import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, type StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';
import type { SmashConfig } from './config';

export interface PersistenceStackProps extends StackProps {
  config: SmashConfig;
  /** Deployed web URL, added to the OAuth callback/logout URLs. */
  webUrl: string;
}

/** Native deep-link scheme registered in client/app.json. */
export const MOBILE_SCHEME_URL = 'badmintonsmash://';

/** Long-lived state: the single DynamoDB table and the Cognito user pool. Both are RETAINed. */
export class PersistenceStack extends Stack {
  readonly table: dynamodb.Table;
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly userPoolDomain: cognito.UserPoolDomain;
  /** Full hosted-UI domain, e.g. smash-dev.auth.us-west-2.amazoncognito.com */
  readonly cognitoDomain: string;

  constructor(scope: Construct, id: string, props: PersistenceStackProps) {
    super(scope, id, props);
    const { config, webUrl } = props;

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: config.tableName ?? `smash-${config.env}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.RETAIN,
      deletionProtection: config.env === 'prod',
    });
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.userPool = new cognito.UserPool(this, 'Users', {
      userPoolName: `Smash-${config.env}`,
      // ESSENTIALS is required for passwordless (email one-time code) sign-in.
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      // Primary flow: email one-time code. Password stays enabled as a secondary factor.
      signInPolicy: { allowedFirstAuthFactors: { password: true, emailOtp: true } },
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: false, mutable: true },
        familyName: { required: false, mutable: true },
        profilePicture: { required: false, mutable: true },
      },
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
        emailSubject: 'Your BadmintonSmash verification code',
        emailBody: 'Your BadmintonSmash verification code is {####}',
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Cognito's default sender is capped at 50 emails/day; one-time codes need SES in production.
      ...(config.cognitoSesEmail
        ? { email: cognito.UserPoolEmail.withSES({ fromEmail: config.senderEmail, fromName: 'BadmintonSmash', sesRegion: this.region }) }
        : {}),
      mfa: cognito.Mfa.OFF,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Hosted UI domain: needed for the Google (OAuth) sign-in redirect flow.
    this.userPoolDomain = this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: config.cognitoDomainPrefix },
    });
    this.cognitoDomain = `${config.cognitoDomainPrefix}.auth.${this.region}.amazoncognito.com`;

    // Optional Google identity provider, credentials read from Secrets Manager at deploy time.
    let google: cognito.UserPoolIdentityProviderGoogle | undefined;
    if (config.googleSecretName) {
      google = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: this.userPool,
        clientId: SecretValue.secretsManager(config.googleSecretName, { jsonField: 'clientId' }).unsafeUnwrap(),
        clientSecretValue: SecretValue.secretsManager(config.googleSecretName, { jsonField: 'clientSecret' }),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
        },
      });
    }

    const redirectUrls = Array.from(new Set([...config.allowedOrigins, webUrl, MOBILE_SCHEME_URL]));

    this.userPoolClient = this.userPool.addClient('Client', {
      userPoolClientName: `smash-${config.env}-app`,
      generateSecret: false,
      authFlows: { user: true, userSrp: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(30),
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: redirectUrls,
        logoutUrls: redirectUrls,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        ...(google ? [cognito.UserPoolClientIdentityProvider.GOOGLE] : []),
      ],
    });
    if (google) this.userPoolClient.node.addDependency(google);

    new CfnOutput(this, 'TableName', { value: this.table.tableName });
    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { value: this.cognitoDomain });
    new CfnOutput(this, 'GoogleSignIn', { value: google ? 'enabled' : 'disabled' });
  }
}
