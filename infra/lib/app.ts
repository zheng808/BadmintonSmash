import { App, DefaultStackSynthesizer, Tags } from 'aws-cdk-lib';
import { BackendStack } from './backend-stack';
import { BootstrapStack } from './bootstrap-stack';
import { loadConfig } from './config';
import { PersistenceStack } from './persistence-stack';
import { WebStack } from './web-stack';

/** Builds all stacks; exported so tests can synthesize with custom context. */
export function buildApp(app: App = new App()): App {
  const config = loadConfig(app);
  const common = {
    env: { account: config.account, region: config.region },
    synthesizer: new DefaultStackSynthesizer({ qualifier: config.bootstrapQualifier }),
  };

  // Web first: its URL feeds Cognito callback URLs, CORS and email links.
  const web = new WebStack(app, `Smash-${config.env}-Web`, { ...common, config });
  const persistence = new PersistenceStack(app, `Smash-${config.env}-Persistence`, { ...common, config, webUrl: web.webUrl });
  const backend = new BackendStack(app, `Smash-${config.env}-Backend`, {
    ...common,
    config,
    table: persistence.table,
    userPool: persistence.userPool,
    userPoolClient: persistence.userPoolClient,
    cognitoDomain: persistence.cognitoDomain,
    webUrl: web.webUrl,
  });
  persistence.addStackDependency(web);
  backend.addStackDependency(persistence);
  backend.addStackDependency(web);

  new BootstrapStack(app, 'Smash-Bootstrap', { ...common, config });

  for (const stack of [persistence, web, backend]) {
    Tags.of(stack).add('app', 'badmintonsmash');
    Tags.of(stack).add('env', config.env);
  }
  return app;
}

