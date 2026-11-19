import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { Platform } from 'react-native';

import { secureKeyValueStorage } from '@/auth/storage';
import { env } from '@/lib/env';

let configured = false;

/** Google sign-in via the Cognito hosted UI is web-only until @aws-amplify/rtn-web-browser is added for native. */
export const oauthEnabled = Platform.OS === 'web' && env.oauthDomain.length > 0 && !env.devAuth;

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
                  responseType: 'code',
                },
              },
            }
          : {}),
      },
    },
  });
  if (Platform.OS !== 'web') {
    cognitoUserPoolsTokenProvider.setKeyValueStorage(secureKeyValueStorage);
  }
}
