/** Build-time public configuration, inlined by Vite from VITE_* variables. */
function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

const apiRaw = trimSlash(import.meta.env.VITE_API_URL ?? 'http://localhost:3000');
const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

export const env = {
  /** API base including the /v1 prefix. */
  apiBase: /\/v1$/.test(apiRaw) ? apiRaw : `${apiRaw}/v1`,
  userPoolId: import.meta.env.VITE_USER_POOL_ID ?? '',
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID ?? '',
  /** Cognito hosted domain, e.g. smash-dev.auth.us-west-2.amazoncognito.com. Enables Google sign-in. */
  oauthDomain: import.meta.env.VITE_OAUTH_DOMAIN ?? '',
  webUrl: trimSlash(import.meta.env.VITE_WEB_URL || origin),
  googleMapsKey: import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '',
  devAuth: import.meta.env.VITE_DEV_AUTH === '1',
  devUser: import.meta.env.VITE_DEV_USER ?? 'dev-user-1',
} as const;

export function eventShareUrl(eventId: string): string {
  return `${env.webUrl}/e/${eventId}`;
}
