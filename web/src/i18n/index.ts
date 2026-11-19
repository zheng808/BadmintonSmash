import { useSyncExternalStore } from 'react';

import { en, type Messages } from './en';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';

export type { Messages };
/** UI locales. The API profile only knows en / zh-CN; zh-TW maps to zh-CN there. */
export type UiLocale = 'en' | 'zh-CN' | 'zh-TW';

const STORAGE_KEY = 'i18n:locale';
const dictionaries: Record<UiLocale, Messages> = { en, 'zh-CN': zhCN, 'zh-TW': zhTW };

export const LOCALE_LABELS: Record<UiLocale, string> = { en: 'English', 'zh-CN': '中文（简体）', 'zh-TW': '中文（繁體）' };

export function detectLocale(): UiLocale {
  const tag = (typeof navigator === 'undefined' ? '' : navigator.language) || 'en';
  if (/^zh/i.test(tag)) return /tw|hk|mo|hant/i.test(tag) ? 'zh-TW' : 'zh-CN';
  return 'en';
}

function readStored(): UiLocale | undefined {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' || saved === 'zh-CN' || saved === 'zh-TW' ? saved : undefined;
  } catch {
    return undefined;
  }
}

let locale: UiLocale = readStored() ?? detectLocale();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocale(): UiLocale {
  return locale;
}

export function setLocale(next: UiLocale): void {
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // private mode etc.
  }
  document.documentElement.lang = next;
  for (const l of listeners) l();
}

export function useLocale(): UiLocale {
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

/** BCP-47 tag for Intl formatting. */
export function intlLocale(l: UiLocale = locale): string {
  return l === 'en' ? 'en-CA' : l;
}

/** What to store on the API profile. */
export function profileLocale(l: UiLocale = locale): 'en' | 'zh-CN' {
  return l === 'en' ? 'en' : 'zh-CN';
}
