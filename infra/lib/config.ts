import { Annotations, type App } from 'aws-cdk-lib';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export type EnvName = 'dev' | 'prod';

export interface SmashConfig {
  /** `dev` or `prod`; prefixes every stack and resource name. */
  env: EnvName;
  region: string;
  /** From CDK_DEFAULT_ACCOUNT when available; stacks stay environment-agnostic otherwise. */
  account: string | undefined;
  /** Verified SES sender for notification emails. */
  senderEmail: string;
  /** Receives CloudWatch alarm notifications. Optional. */
  alarmEmail: string | undefined;
  /** Extra CORS origins (the deployed web URL is always added). */
  allowedOrigins: string[];
  /** Optional custom web domain, e.g. smash.example.com (needs hostedZoneId + certificateArn unless region is us-east-1). */
  domain: string | undefined;
  hostedZoneId: string | undefined;
  hostedZoneName: string | undefined;
  certificateArn: string | undefined;
  /** GitHub repo (owner/name) trusted by the OIDC deploy role. */
  githubRepo: string;
  /** Existing GitHub OIDC provider ARN to reuse instead of creating one. */
  githubOidcProviderArn: string | undefined;
  /** CDK bootstrap qualifier used for the deploy role's sts:AssumeRole scope. */
  bootstrapQualifier: string;
  /** Override the DynamoDB table name (e.g. after a PITR restore). */
  tableName: string | undefined;
  /** Cognito hosted-UI domain prefix (globally unique per region). Default smash-<env>. */
  cognitoDomainPrefix: string;
  /** Secrets Manager secret name holding {"clientId","clientSecret"} for Google sign-in. Optional. */
  googleSecretName: string | undefined;
  /** Directory holding http.ts, notifier.ts, housekeeping.ts; resolved relative to infra/. */
  apiEntryDir: string;
  /** Send Cognito emails (one-time codes) through SES from senderEmail. Enable only after the SES identity is verified. */
  cognitoSesEmail: boolean;
}

const INFRA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT_ROOT = path.resolve(INFRA_DIR, '..');

const DEV_ORIGINS = ['http://localhost:8081', 'http://localhost:3000', 'http://localhost:19006', 'http://localhost:5173'];

function str(app: App, key: string): string | undefined {
  const v = app.node.tryGetContext(key);
  if (v === undefined || v === null || v === '') return undefined;
  return String(v);
}

export function loadConfig(app: App): SmashConfig {
  const envRaw = str(app, 'env') ?? 'dev';
  if (envRaw !== 'dev' && envRaw !== 'prod') {
    throw new Error(`Context "env" must be dev or prod, got "${envRaw}"`);
  }
  const env: EnvName = envRaw;

  let senderEmail = str(app, 'senderEmail');
  if (!senderEmail) {
    if (env === 'prod') throw new Error('Context "senderEmail" is required for prod (e.g. -c senderEmail=noreply@example.com)');
    senderEmail = 'noreply@example.com';
    Annotations.of(app).addWarningV2(
      'smash:default-sender-email',
      `No senderEmail context given; using placeholder ${senderEmail}. Pass -c senderEmail=<verified address> before deploying.`,
    );
  }

  const extraOrigins = (str(app, 'allowedOrigins') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const domain = str(app, 'domain');
  const hostedZoneName = str(app, 'hostedZoneName') ?? (domain ? domain.split('.').slice(1).join('.') : undefined);

  return {
    env,
    region: str(app, 'region') ?? process.env.CDK_DEFAULT_REGION ?? 'us-west-2',
    account: process.env.CDK_DEFAULT_ACCOUNT,
    senderEmail,
    alarmEmail: str(app, 'alarmEmail'),
    allowedOrigins: env === 'dev' ? [...DEV_ORIGINS, ...extraOrigins] : extraOrigins,
    domain,
    hostedZoneId: str(app, 'hostedZoneId'),
    hostedZoneName,
    certificateArn: str(app, 'certificateArn'),
    githubRepo: str(app, 'githubRepo') ?? 'zheng808/BadmintonSmash',
    githubOidcProviderArn: str(app, 'githubOidcProviderArn'),
    bootstrapQualifier: str(app, 'bootstrapQualifier') ?? 'hnb659fds',
    tableName: str(app, 'tableName'),
    cognitoDomainPrefix: str(app, 'cognitoDomainPrefix') ?? `smash-${env}`,
    googleSecretName: str(app, 'googleSecretName'),
    apiEntryDir: path.resolve(INFRA_DIR, str(app, 'apiEntryDir') ?? '../api/src/lambda'),
    cognitoSesEmail: str(app, 'cognitoSesEmail') === 'true',
  };
}
