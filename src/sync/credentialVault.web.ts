import type { CredentialVault } from './configuration';
const unavailable=async()=>{throw new Error('Protected background credentials are available only in the native app.');};
export const credentialVault:CredentialVault={available:async()=>false,get:async()=>null,set:unavailable,remove:unavailable};
