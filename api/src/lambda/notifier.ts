import { SESClient } from '@aws-sdk/client-ses';
import { createDeps } from '../deps';
import { createNotifierHandler } from '../notify/notifier';
import { SesSender } from '../notify/sender';

const deps = createDeps();
const sender = new SesSender(new SESClient({ region: deps.config.region }), deps.config.sesFrom);

export const handler = createNotifierHandler(deps, sender);
