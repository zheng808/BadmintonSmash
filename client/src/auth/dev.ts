import AsyncStorage from '@react-native-async-storage/async-storage';

import { env } from '@/lib/env';

const KEY = 'dev:userId';

export async function loadDevUserId(): Promise<string> {
  return (await AsyncStorage.getItem(KEY)) ?? env.devUser;
}

export async function saveDevUserId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEY, id);
}

const PENDING_NAME = 'auth:pendingDisplayName';
export const pendingDisplayName = {
  get: () => AsyncStorage.getItem(PENDING_NAME),
  set: (name: string) => AsyncStorage.setItem(PENDING_NAME, name),
  clear: () => AsyncStorage.removeItem(PENDING_NAME),
};
