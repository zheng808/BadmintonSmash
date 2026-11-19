import type { Locale } from '@badmintonsmash/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { en, type Messages } from './en';
import { zhCN } from './zh-CN';

export type { Locale, Messages };

const STORAGE_KEY = 'i18n:locale';
const dictionaries: Record<Locale, Messages> = { en, 'zh-CN': zhCN };

export const LOCALE_LABELS: Record<Locale, string> = { en: 'English', 'zh-CN': '中文（简体）' };

export function detectLocale(): Locale {
  const nav = (globalThis as { navigator?: { language?: string } }).navigator;
  const tag = nav?.language || Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  return /^zh/i.test(tag) ? 'zh-CN' : 'en';
}

let locale: Locale = detectLocale();
let initialised = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocale(): Locale {
  return locale;
}

/** Persisted override; also mirrored to the profile by the caller when signed in. */
export async function setLocale(next: Locale): Promise<void> {
  locale = next;
  notify();
  await AsyncStorage.setItem(STORAGE_KEY, next);
}

/** Load the stored override once at startup. */
export async function initLocale(): Promise<void> {
  if (initialised) return;
  initialised = true;
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'zh-CN') {
    locale = saved;
    notify();
  }
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** Messages for the active locale (hook; re-renders on change). */
export function useT(): Messages {
  return dictionaries[useLocale()];
}

/** Messages for the active locale (non-React code). */
export function t(): Messages {
  return dictionaries[locale];
}

/** BCP-47 tag for Intl date formatting. */
export function dateLocale(l: Locale = locale): string {
  return l === 'zh-CN' ? 'zh-CN' : 'en-CA';
}
