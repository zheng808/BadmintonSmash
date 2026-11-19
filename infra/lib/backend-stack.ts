import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as schedulerTargets from 'aws-cdk-lib/aws-scheduler-targets';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import * as path from 'node:path';
import { PROJECT_ROOT, type SmashConfig } from './config';

export interface BackendStackProps extends StackProps {
  config: SmashConfig;
  table: dynamodb.ITable;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  /** Hosted-UI domain (prefix.auth.region.amazoncognito.com), re-exported for the client env. */
  cognitoDomain: string;
  /** Deployed web URL; used for CORS and links in emails. */
  webUrl: string;
}

const NOTIFIER_TIMEOUT = Duration.seconds(30);

/** API Lambda + HTTP API, notification queue + notifier, hourly housekeeping, SES identity, alarms. */
export class BackendStack extends Stack {
  readonly httpApi: apigwv2.HttpApi;
  readonly apiFunction: NodejsFunction;
  readonly notifierFunction: NodejsFunction;
  readonly housekeepingFunction: NodejsFunction;
  readonly queue: sqs.Queue;
  readonly deadLetterQueue: sqs.Queue;
  readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);
    const { config, table, userPool, userPoolClient, cognitoDomain, webUrl } = props;
    const isDev = config.env === 'dev';
    const prefix = `Smash-${config.env}`;

    // --- Queues -------------------------------------------------------------------------------
    this.deadLetterQueue = new sqs.Queue(this, 'NotificationsDlq', {
      queueName: `${prefix}-notifications-dlq`,
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });
    this.queue = new sqs.Queue(this, 'Notifications', {
      queueName: `${prefix}-notifications`,
      retentionPeriod: Duration.days(4),
      visibilityTimeout: Duration.seconds(NOTIFIER_TIMEOUT.toSeconds() * 6),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      deadLetterQueue: { queue: this.deadLetterQueue, maxReceiveCount: 5 },
    });

    // --- SES sender ---------------------------------------------------------------------------
    const sender = new ses.EmailIdentity(this, 'Sender', {
      identity: ses.Identity.email(config.senderEmail),
    });

    // --- Lambda functions ---------------------------------------------------------------------
    const commonEnv: Record<string, string> = {
      NODE_OPTIONS: '--enable-source-maps',
      SMASH_ENV: config.env,
      LOG_LEVEL: isDev ? 'DEBUG' : 'INFO',
      TABLE_NAME: table.tableName,
      QUEUE_URL: this.queue.queueUrl,
      USER_POOL_ID: userPool.userPoolId,
      SES_FROM: config.senderEmail,
      APP_WEB_URL: webUrl,
    };

    const makeFunction = (name: string, opts: { memory: number; timeout: Duration }): NodejsFunction => {
      const functionName = `${prefix}-${name}`;
      const logGroup = new logs.LogGroup(this, `${name}LogGroup`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.ONE_MONTH,
      });
      return new NodejsFunction(this, `${name}Function`, {
        functionName,
        entry: path.join(config.apiEntryDir, `${name}.ts`),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: opts.memory,
        timeout: opts.timeout,
        logGroup,
        tracing: isDev ? lambda.Tracing.ACTIVE : lambda.Tracing.PASS_THROUGH,
        projectRoot: PROJECT_ROOT,
        depsLockFilePath: path.join(PROJECT_ROOT, 'package-lock.json'),
        environment: { ...commonEnv, POWERTOOLS_SERVICE_NAME: `smash-${name}` },
        bundling: {
          format: OutputFormat.ESM,
          target: 'node22',
          mainFields: ['module', 'main'],
          sourceMap: true,
          minify: !isDev,
          banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        },
      });
    };

    this.apiFunction = makeFunction('http', { memory: 512, timeout: Duration.seconds(10) });
    this.notifierFunction = makeFunction('notifier', { memory: 256, timeout: NOTIFIER_TIMEOUT });
    this.housekeepingFunction = makeFunction('housekeeping', { memory: 256, timeout: Duration.seconds(60) });

    // Least-privilege grants per function.
    table.grantReadWriteData(this.apiFunction);
    this.queue.grantSendMessages(this.apiFunction);
    userPool.grant(this.apiFunction, 'cognito-idp:AdminGetUser', 'cognito-idp:AdminDeleteUser', 'cognito-idp:ListUsers');

    table.grantReadWriteData(this.notifierFunction);
    sender.grantSendEmail(this.notifierFunction);

    table.grantReadWriteData(this.housekeepingFunction);
    this.queue.grantSendMessages(this.housekeepingFunction);

    // --- Event sources ------------------------------------------------------------------------
    this.notifierFunction.addEventSource(
      new SqsEventSource(this.queue, { batchSize: 10, reportBatchItemFailures: true }),
    );

    new scheduler.Schedule(this, 'HousekeepingHourly', {
      scheduleName: `${prefix}-housekeeping-hourly`,
      description: 'Auto-complete events 24h after end time and re-run waitlist promotion',
      schedule: scheduler.ScheduleExpression.rate(Duration.hours(1)),
      target: new schedulerTargets.LambdaInvoke(this.housekeepingFunction, {
        retryAttempts: 2,
        maxEventAge: Duration.minutes(30),
      }),
    });

    // --- HTTP API -----------------------------------------------------------------------------
    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;
    const jwtAuthorizer = new HttpJwtAuthorizer('CognitoJwt', issuer, {
      jwtAudience: [userPoolClient.userPoolClientId],
    });
    const integration = new HttpLambdaIntegration('ApiIntegration', this.apiFunction);

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `${prefix}-api`,
      description: `BadmintonSmash API (${config.env})`,
      createDefaultStage: false,
      defaultAuthorizer: jwtAuthorizer,
      corsPreflight: {
        allowOrigins: [...config.allowedOrigins, webUrl],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type', 'x-request-id'],
        exposeHeaders: ['x-request-id'],
        maxAge: Duration.days(1),
      },
    });

    const noAuth = new apigwv2.HttpNoneAuthorizer();
    // Explicit methods, not ANY: an ANY route would also match the browser's OPTIONS preflight and send it
    // through the JWT authorizer (401). With no OPTIONS route, API Gateway answers preflights itself.
    const authedMethods = [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.PATCH, apigwv2.HttpMethod.DELETE];
    this.httpApi.addRoutes({ path: '/v1/{proxy+}', methods: authedMethods, integration });
    this.httpApi.addRoutes({ path: '/v1/health', methods: [apigwv2.HttpMethod.GET], integration, authorizer: noAuth });
    this.httpApi.addRoutes({ path: '/v1/public/{proxy+}', methods: [apigwv2.HttpMethod.GET], integration, authorizer: noAuth });

    const stage = new apigwv2.HttpStage(this, 'DefaultStage', {
      httpApi: this.httpApi,
      stageName: '$default',
      autoDeploy: true,
      throttle: isDev ? { rateLimit: 20, burstLimit: 50 } : { rateLimit: 100, burstLimit: 200 },
    });

    // --- Alarms -------------------------------------------------------------------------------
    this.alarmTopic = new sns.Topic(this, 'Alarms', { topicName: `${prefix}-alarms` });
    if (config.alarmEmail) {
      this.alarmTopic.addSubscription(new subscriptions.EmailSubscription(config.alarmEmail));
    }
    const alarmAction = new cwActions.SnsAction(this.alarmTopic);
    const fiveMin = Duration.minutes(5);

    const alarms: cloudwatch.Alarm[] = [
      new cloudwatch.Alarm(this, 'ApiErrorsAlarm', {
        alarmName: `${prefix}-api-errors`,
        metric: this.apiFunction.metricErrors({ period: fiveMin, statistic: 'Sum' }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, 'Api5xxRateAlarm', {
        alarmName: `${prefix}-api-5xx-rate`,
        metric: new cloudwatch.MathExpression({
          expression: 'IF(count > 0, 100 * errors / count, 0)',
          usingMetrics: {
            errors: this.httpApi.metricServerError({ period: fiveMin, statistic: 'Sum' }),
            count: this.httpApi.metricCount({ period: fiveMin, statistic: 'Sum' }),
          },
          label: 'HTTP API 5xx %',
          period: fiveMin,
        }),
        threshold: 2,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, 'DlqAlarm', {
        alarmName: `${prefix}-notifications-dlq`,
        metric: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(1), statistic: 'Maximum' }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, 'NotifierErrorsAlarm', {
        alarmName: `${prefix}-notifier-errors`,
        metric: this.notifierFunction.metricErrors({ period: fiveMin, statistic: 'Sum' }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, 'HousekeepingErrorsAlarm', {
        alarmName: `${prefix}-housekeeping-errors`,
        metric: this.housekeepingFunction.metricErrors({ period: Duration.hours(1), statistic: 'Sum' }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
    ];
    for (const alarm of alarms) {
      alarm.addAlarmAction(alarmAction);
      alarm.addOkAction(alarmAction);
    }

    // --- Outputs ------------------------------------------------------------------------------
    new CfnOutput(this, 'ApiUrl', { value: stage.url });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { value: cognitoDomain });
    new CfnOutput(this, 'QueueUrl', { value: this.queue.queueUrl });
    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'Region', { value: this.region });
    new CfnOutput(this, 'AlarmTopicArn', { value: this.alarmTopic.topicArn });
  }
}
