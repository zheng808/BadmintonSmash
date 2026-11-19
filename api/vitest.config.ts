import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: {
      AWS_ACCESS_KEY_ID: 'local',
      AWS_SECRET_ACCESS_KEY: 'local',
      AWS_REGION: 'us-west-2',
      POWERTOOLS_LOG_LEVEL: 'SILENT',
      POWERTOOLS_DEV: 'true',
      DEV_AUTH: '1',
      TABLE_NAME: 'smash-test',
      APP_WEB_URL: 'https://smash.test',
      SES_FROM: 'noreply@smash.test',
    },
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
