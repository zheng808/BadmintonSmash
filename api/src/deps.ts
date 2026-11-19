import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { SQSClient } from '@aws-sdk/client-sqs';
import { loadConfig, type Config } from './config';
import { CognitoDirectory, MemoryDirectory, type UserDirectory } from './directory';
import { createLogger, type AppLogger } from './logger';
import { MemoryPublisher, SqsPublisher, type Publisher } from './notify/publisher';
import { DynamoStore, createDocumentClient } from './repo/dynamo-store';
import { EventsRepo } from './repo/events';
import { MemoryStore } from './repo/memory-store';
import { SignupsRepo } from './repo/signups';
import type { Store } from './repo/store';
import { UsersRepo } from './repo/users';

export interface Deps {
  config: Config;
  logger: AppLogger;
  store: Store;
  users: UsersRepo;
  events: EventsRepo;
  signups: SignupsRepo;
  publisher: Publisher;
  userDirectory: UserDirectory;
  now: () => Date;
}

export type DepsOverrides = Partial<Omit<Deps, 'config'>> & { config?: Partial<Config> };

export function createDeps(overrides: DepsOverrides = {}): Deps {
  const config: Config = { ...loadConfig(), ...overrides.config };
  const logger = overrides.logger ?? createLogger('smash-api', config.logLevel);
  const store: Store =
    overrides.store ??
    (config.memoryStore
      ? new MemoryStore()
      : new DynamoStore(createDocumentClient({ region: config.region, endpoint: config.dynamoEndpoint }), config.tableName));
  const publisher: Publisher =
    overrides.publisher ??
    (config.queueUrl ? new SqsPublisher(new SQSClient({ region: config.region }), config.queueUrl) : new MemoryPublisher(logger));
  const userDirectory: UserDirectory =
    overrides.userDirectory ??
    (config.userPoolId
      ? new CognitoDirectory(new CognitoIdentityProviderClient({ region: config.region }), config.userPoolId)
      : new MemoryDirectory(config.devAuth ? 'dev.local' : undefined));
  return {
    config,
    logger,
    store,
    users: overrides.users ?? new UsersRepo(store),
    events: overrides.events ?? new EventsRepo(store),
    signups: overrides.signups ?? new SignupsRepo(store),
    publisher,
    userDirectory,
    now: overrides.now ?? (() => new Date()),
  };
}
