import { Amplify } from 'aws-amplify';

import { env } from '@/env';

let configured = false;

/** Google sign-in needs the Cognito hosted domain; it is never used in dev-auth mode. */
export const oauthEnabled = env.oauthDomain.length > 0 && !env.devAuth;

/** Idempotent. No-op in dev-auth mode. */
export function configureAmplify(): void {
  if (configured || env.devAuth) return;
  configured = true;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: env.userPoolId,
        userPoolClientId: env.userPoolClientId,
        ...(oauthEnabled
          ? {
              loginWith: {
                oauth: {
                  domain: env.oauthDomain,
                  scopes: ['openid', 'email', 'profile'],
                  redirectSignIn: [env.webUrl, `${env.webUrl}/`],
                  redirectSignOut: [env.webUrl, `${env.webUrl}/`],
                  responseType: 'code' as const,
                },
              },
            }
          : {}),
      },
    },
  });
}
