export interface Config {
  tableName: string;
  /** Set for DynamoDB Local; unset in AWS. */
  dynamoEndpoint?: string;
  /** Use the in-memory store (tests, quick local dev). */
  memoryStore: boolean;
  queueUrl?: string;
  userPoolId?: string;
  sesFrom: string;
  appWebUrl: string;
  region: string;
  /** Accept `x-dev-user` header instead of a JWT. Never set in AWS. */
  devAuth: boolean;
  version: string;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    tableName: env.TABLE_NAME ?? 'smash-local',
    dynamoEndpoint: env.DYNAMODB_ENDPOINT || undefined,
    memoryStore: env.MEMORY_STORE === '1',
    queueUrl: env.QUEUE_URL || undefined,
    userPoolId: env.USER_POOL_ID || undefined,
    sesFrom: env.SES_FROM ?? 'noreply@example.com',
    appWebUrl: env.APP_WEB_URL ?? 'http://localhost:8081',
    region: env.AWS_REGION ?? 'us-west-2',
    devAuth: env.DEV_AUTH === '1',
    version: env.APP_VERSION ?? '0.1.0',
    logLevel: env.POWERTOOLS_LOG_LEVEL ?? 'INFO',
  };
}
