/* Local dev server: `npm run dev -w api` (DynamoDB Local on :8000 by default, or MEMORY_STORE=1). */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createDeps } from './deps';
import { createTableIfMissing } from './repo/table';

process.env.DEV_AUTH ??= '1';
process.env.AWS_REGION ??= 'us-west-2';
process.env.AWS_ACCESS_KEY_ID ??= 'local';
process.env.AWS_SECRET_ACCESS_KEY ??= 'local';
if (process.env.MEMORY_STORE !== '1') process.env.DYNAMODB_ENDPOINT ??= 'http://localhost:8000';

const deps = createDeps();
if (!deps.config.memoryStore) {
  await createTableIfMissing(new DynamoDBClient({ region: deps.config.region, endpoint: deps.config.dynamoEndpoint }), deps.config.tableName);
}
const app = createApp(deps);
const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
deps.logger.info(`API listening on http://localhost:${port}/v1 (DEV_AUTH on: send x-dev-user / x-dev-email headers)`);
