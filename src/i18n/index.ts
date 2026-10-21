import { en } from './en';
import { type Key, zhTW } from './zh-TW';

export type Lang = 'zh-TW' | 'en';
export type { Key };

const dictionaries: Record<Lang, Record<Key, string>> = { 'zh-TW': zhTW, en };

let current: Lang = 'zh-TW';
const listeners = new Set<(lang: Lang) => void>();

/** Chinese browsers get Traditional Chinese, everyone else English. */
export function detectLang(): Lang {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((l) => l?.toLowerCase().startsWith('zh')) ? 'zh-TW' : 'en';
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang === 'zh-TW' ? 'zh-Hant' : 'en';
  document.title = t('meta.title');
  listeners.forEach((fn) => fn(lang));
}

export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Looks a string up and fills `{name}` placeholders. */
export function t(key: Key, params?: Record<string, string | number>): string {
  const text = dictionaries[current][key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Picks the right string from a pair of per-language values (used by content modules). */
export function pick<T>(values: Record<Lang, T>): T {
  return values[current];
}
