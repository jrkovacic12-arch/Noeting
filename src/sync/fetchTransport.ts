// Expo's native transport disables both OkHttp followRedirects and
// followSslRedirects when redirect:'error'. RN's legacy fetch is not relied on.
import { fetch as expoFetch } from 'expo/fetch';
export const syncFetch=expoFetch as unknown as typeof globalThis.fetch;
