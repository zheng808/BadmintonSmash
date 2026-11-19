import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../lib/app';

function makeApp(env: 'dev' | 'prod', extra: Record<string, string> = {}): App {
  const app = new App({
    context: {
      env,
      region: 'us-west-2',
      apiEntryDir: 'test/stubs',
      senderEmail: 'noreply@example.com',
      alarmEmail: 'ops@example.com',
      githubRepo: 'zheng808/BadmintonSmash',
      ...extra,
    },
  });
  return buildApp(app);
}

describe('dev stacks', () => {
  let persistence: Template;
  let backend: Template;
  let web: Template;
  let bootstrap: Template;

  beforeAll(() => {
    const app = makeApp('dev');
    const find = (name: string) => app.node.findChild(name) as import('aws-cdk-lib').Stack;
    persistence = Template.fromStack(find('Smash-dev-Persistence'));
    backend = Template.fromStack(find('Smash-dev-Backend'));
    web = Template.fromStack(find('Smash-dev-Web'));
    bootstrap = Template.fromStack(find('Smash-Bootstrap'));
  });

  it('table has two GSIs, PITR, TTL, on-demand billing and is retained', () => {
    persistence.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'smash-dev',
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      GlobalSecondaryIndexes: [
        Match.objectLike({ IndexName: 'GSI1', Projection: { ProjectionType: 'ALL' } }),
        Match.objectLike({ IndexName: 'GSI2', Projection: { ProjectionType: 'ALL' } }),
      ],
    });
    persistence.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
  });

  it('user pool uses email sign-in, code verification, and a public SRP client', () => {
    persistence.hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
      DeletionProtection: 'ACTIVE',
      Policies: { PasswordPolicy: Match.objectLike({ MinimumLength: 8, RequireUppercase: true, RequireLowercase: true, RequireNumbers: true }) },
      AccountRecoverySetting: { RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }] },
    });
    persistence.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Retain' });
    persistence.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']),
      EnableTokenRevocation: true,
      RefreshTokenValidity: 43200,
      TokenValidityUnits: Match.objectLike({ RefreshToken: 'minutes' }),
      AllowedOAuthFlows: ['code'],
      AllowedOAuthScopes: ['openid', 'email', 'profile'],
      CallbackURLs: Match.arrayWith(['http://localhost:8081', 'badmintonsmash://']),
      SupportedIdentityProviders: ['COGNITO'],
    });
    persistence.hasResourceProperties('AWS::Cognito::UserPoolDomain', { Domain: 'smash-dev' });
    persistence.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 0);
    persistence.hasOutput('CognitoDomain', { Value: 'smash-dev.auth.us-west-2.amazoncognito.com' });
  });

  it('adds a Google identity provider when googleSecretName is set', () => {
    const app = makeApp('dev', { googleSecretName: 'smash/dev/google', cognitoDomainPrefix: 'smash-dev-abc123' });
    const persistenceWithGoogle = Template.fromStack(app.node.findChild('Smash-dev-Persistence') as import('aws-cdk-lib').Stack);
    persistenceWithGoogle.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
      ProviderName: 'Google',
      ProviderType: 'Google',
      ProviderDetails: Match.objectLike({
        authorize_scopes: 'openid email profile',
        client_id: Match.stringLikeRegexp('resolve:secretsmanager:smash/dev/google:SecretString:clientId'),
        client_secret: Match.stringLikeRegexp('resolve:secretsmanager:smash/dev/google:SecretString:clientSecret'),
      }),
      AttributeMapping: Match.objectLike({ email: 'email', given_name: 'given_name', family_name: 'family_name', picture: 'picture' }),
    });
    persistenceWithGoogle.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      SupportedIdentityProviders: ['COGNITO', 'Google'],
    });
    persistenceWithGoogle.hasResourceProperties('AWS::Cognito::UserPoolDomain', { Domain: 'smash-dev-abc123' });
    persistenceWithGoogle.hasResource('AWS::Cognito::UserPoolClient', { DependsOn: Match.arrayWith([Match.stringLikeRegexp('^Google')]) });
  });

  it('runs three arm64 Node 22 functions with 30-day log retention', () => {
    backend.resourceCountIs('AWS::Lambda::Function', 3);
    backend.allResourcesProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
    });
    backend.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'Smash-dev-http',
      MemorySize: 512,
      Timeout: 10,
      TracingConfig: { Mode: 'Active' },
      Environment: { Variables: Match.objectLike({ TABLE_NAME: Match.anyValue(), QUEUE_URL: Match.anyValue(), USER_POOL_ID: Match.anyValue(), SES_FROM: 'noreply@example.com' }) },
    });
    backend.resourceCountIs('AWS::Logs::LogGroup', 3);
    backend.allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  it('HTTP API has a Cognito JWT default authorizer, CORS, open health/public routes, and throttling', () => {
    backend.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
      JwtConfiguration: { Audience: [Match.anyValue()], Issuer: Match.anyValue() },
    });
    backend.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({
        AllowHeaders: ['authorization', 'content-type', 'x-request-id'],
        ExposeHeaders: ['x-request-id'],
        AllowOrigins: Match.arrayWith(['http://localhost:8081']),
      }),
    });
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      backend.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: `${m} /v1/{proxy+}`, AuthorizationType: 'JWT' });
    }
    backend.resourcePropertiesCountIs('AWS::ApiGatewayV2::Route', { RouteKey: 'ANY /v1/{proxy+}' }, 0);
    backend.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'GET /v1/health', AuthorizationType: 'NONE' });
    backend.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'GET /v1/public/{proxy+}', AuthorizationType: 'NONE' });
    backend.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 50 },
    });
  });

  it('wires the notifier to the queue with a DLQ and partial batch failures', () => {
    backend.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'Smash-dev-notifications',
      VisibilityTimeout: 180,
      MessageRetentionPeriod: 345600,
      RedrivePolicy: Match.objectLike({ maxReceiveCount: 5 }),
    });
    backend.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 10,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
  });

  it('schedules housekeeping hourly and registers the SES sender', () => {
    backend.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'rate(1 hour)',
      State: 'ENABLED',
    });
    backend.hasResourceProperties('AWS::SES::EmailIdentity', { EmailIdentity: 'noreply@example.com' });
  });

  it('has alarms routed to an SNS topic with the ops email subscribed', () => {
    backend.resourceCountIs('AWS::CloudWatch::Alarm', 5);
    backend.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'ops@example.com' });
    backend.hasResourceProperties('AWS::CloudWatch::Alarm', { AlarmName: 'Smash-dev-notifications-dlq', Threshold: 1 });
  });

  it('grants least privilege: notifier can send email, api can call Cognito admin APIs', () => {
    backend.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: Match.arrayWith(['cognito-idp:AdminGetUser', 'cognito-idp:AdminDeleteUser', 'cognito-idp:ListUsers']) }),
        ]),
      },
    });
    backend.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: Match.arrayWith(['ses:SendEmail']) })]) },
    });
  });

  it('web bucket is private and CloudFront serves the SPA with index fallback', () => {
    web.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    });
    web.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Delete' });
    web.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        PriceClass: 'PriceClass_100',
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({ ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' }),
          Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' }),
        ]),
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https', Compress: true }),
      }),
    });
    web.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  it('bootstrap role trusts the GitHub repo on main and develop only', () => {
    bootstrap.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'Smash-GitHubDeploy',
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
              StringLike: {
                'token.actions.githubusercontent.com:sub': [
                  'repo:zheng808/BadmintonSmash:ref:refs/heads/main',
                  'repo:zheng808/BadmintonSmash:ref:refs/heads/develop',
                ],
              },
            },
          }),
        ],
      },
    });
    bootstrap.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: 'sts:AssumeRole' })]) },
    });
  });
});

describe('prod stacks', () => {
  it('retains the web bucket, throttles higher, and requires senderEmail', () => {
    const app = makeApp('prod');
    const web = Template.fromStack(app.node.findChild('Smash-prod-Web') as import('aws-cdk-lib').Stack);
    web.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
    const backend = Template.fromStack(app.node.findChild('Smash-prod-Backend') as import('aws-cdk-lib').Stack);
    backend.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: { ThrottlingRateLimit: 100, ThrottlingBurstLimit: 200 },
    });
    backend.hasResourceProperties('AWS::Lambda::Function', { FunctionName: 'Smash-prod-http', TracingConfig: { Mode: 'PassThrough' } });
    expect(() => buildApp(new App({ context: { env: 'prod', apiEntryDir: 'test/stubs' } }))).toThrow(/senderEmail/);
  });

  it('custom domain requires a certificate ARN outside us-east-1', () => {
    expect(() => makeApp('prod', { domain: 'smash.example.com', hostedZoneId: 'Z123' })).toThrow(/certificateArn/);
    const app = makeApp('prod', {
      domain: 'smash.example.com',
      hostedZoneId: 'Z123',
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc',
    });
    const web = Template.fromStack(app.node.findChild('Smash-prod-Web') as import('aws-cdk-lib').Stack);
    web.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: ['smash.example.com'] }),
    });
    web.resourceCountIs('AWS::Route53::RecordSet', 2);
  });
});
