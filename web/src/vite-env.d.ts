/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_USER_POOL_ID?: string;
  readonly VITE_USER_POOL_CLIENT_ID?: string;
  readonly VITE_OAUTH_DOMAIN?: string;
  readonly VITE_WEB_URL?: string;
  readonly VITE_GOOGLE_MAPS_KEY?: string;
  readonly VITE_DEV_AUTH?: string;
  readonly VITE_DEV_USER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
