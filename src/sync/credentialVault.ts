import * as SecureStore from 'expo-secure-store';
import type { CredentialVault } from './configuration';
const options:SecureStore.SecureStoreOptions={keychainService:'noeting.sync.v1',requireAuthentication:false,keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY};
export const credentialVault:CredentialVault={
 available:()=>SecureStore.isAvailableAsync(),
 get:key=>SecureStore.getItemAsync(key,options),
 set:(key,value)=>SecureStore.setItemAsync(key,value,options),
 remove:key=>SecureStore.deleteItemAsync(key,options),
};
