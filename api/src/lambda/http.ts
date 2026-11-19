import { handle } from 'hono/aws-lambda';
import { createApp } from '../app';
import { createDeps } from '../deps';

const deps = createDeps();
const app = createApp(deps);

export const handler = handle(app);
