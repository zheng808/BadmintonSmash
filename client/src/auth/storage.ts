import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStorageInterface } from 'aws-amplify/utils';
import * as SecureStore from 'expo-secure-store';

/** SecureStore keys may only contain [A-Za-z0-9._-]. */
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

/**
 * Cognito token storage backed by the device keychain/keystore, falling back to AsyncStorage
 * when the secure store refuses a value (for example oversized entries on some Android builds).
 */
export const secureKeyValueStorage: KeyValueStorageInterface = {
  async setItem(key, value) {
    try {
      await SecureStore.setItemAsync(safeKey(key), value);
      await AsyncStorage.removeItem(key);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  async getItem(key) {
    try {
      const v = await SecureStore.getItemAsync(safeKey(key));
      if (v !== null) return v;
    } catch {
      // fall through
    }
    return AsyncStorage.getItem(key);
  },
  async removeItem(key) {
    try {
      await SecureStore.deleteItemAsync(safeKey(key));
    } catch {
      // ignore
    }
    await AsyncStorage.removeItem(key);
  },
  async clear() {
    // SecureStore cannot enumerate keys; Amplify removes its keys individually on sign-out.
  },
};
