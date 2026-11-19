/** Build-time public configuration. Values are inlined by Expo from EXPO_PUBLIC_* variables. */
function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

const apiUrlRaw = trimSlash(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000');

export const env = {
  /** Base URL including the /v1 prefix. */
  apiBase: /\/v1$/.test(apiUrlRaw) ? apiUrlRaw : `${apiUrlRaw}/v1`,
  userPoolId: process.env.EXPO_PUBLIC_USER_POOL_ID ?? '',
  userPoolClientId: process.env.EXPO_PUBLIC_USER_POOL_CLIENT_ID ?? '',
  /** Cognito hosted UI domain, e.g. smash-dev.auth.us-west-2.amazoncognito.com. Enables Google sign-in on web. */
  oauthDomain: process.env.EXPO_PUBLIC_OAUTH_DOMAIN ?? '',
  region: process.env.EXPO_PUBLIC_REGION ?? 'us-west-2',
  /** Google Maps Platform key restricted to the Places API (New). Enables the venue picker. */
  googleMapsKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '',
  webUrl: trimSlash(process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:8081'),
  devAuth: process.env.EXPO_PUBLIC_DEV_AUTH === '1',
  devUser: process.env.EXPO_PUBLIC_DEV_USER ?? 'dev-user-1',
  version: '0.1.0',
} as const;

export function eventShareUrl(eventId: string): string {
  return `${env.webUrl}/e/${eventId}`;
}
