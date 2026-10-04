// UI-only localization. Never translate protocol values, player input, or simulation data in place.
import zhCN from './locales/zh-CN.js';
import en from './locales/en.js';
import ko from './locales/ko.js';
import ja from './locales/ja.js';

export const DEFAULT_LOCALE = 'zh-CN';
export const LOCALE_STORAGE_KEY = 'sp.pref.locale';
export const LOCALES = Object.freeze([
  { id: 'zh-CN', label: '简体中文' },
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
]);
export const catalogs = Object.freeze({ 'zh-CN': zhCN, en, ko, ja });
const own = (obj, key) => obj != null && Object.hasOwn(obj, key);

/** Accept browser regional tags; return null for unsupported or malformed values. */
export function normalizeLocale(value) {
  if (typeof value !== 'string') return null;
  const tag = value.trim().replace(/_/g, '-').toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) return null;
  const language = tag.split('-')[0];
  return language === 'zh' ? 'zh-CN' : language === 'ko' || language === 'en' || language === 'ja' ? language : null;
}

export function detectLocale(saved, languages = []) {
  return normalizeLocale(saved) || languages.map(normalizeLocale).find(Boolean) || DEFAULT_LOCALE;
}

/** Injectable instance for tests. Missing translations fall back to Chinese, then an explicit source or the key. */
export function createI18n({ locale = DEFAULT_LOCALE, messages = catalogs, persist = () => {} } = {}) {
  let current = normalizeLocale(locale) || DEFAULT_LOCALE;
  const listeners = new Set();
  const api = {
    getLocale: () => current,
    setLocale(value) {
      const next = normalizeLocale(value);
      if (!next) return false;
      try { persist(next); } catch { /* Private browsing / full storage must not prevent switching. */ }
      if (next === current) return true;
      current = next;
      for (const fn of [...listeners]) fn(current);
      return true;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    t(key, params = {}, fallback = key) {
      const selected = messages[current];
      const base = messages[DEFAULT_LOCALE];
      let text = own(selected, key) ? selected[key] : own(base, key) ? base[key] : fallback;
      if (text && typeof text === 'object') {
        const category = new Intl.PluralRules(current).select(Number(params.count));
        text = text[category] ?? text.other;
      }
      if (typeof text !== 'string') text = fallback;
      // Plain text only; Preact escapes the resulting value. Values are never re-interpolated.
      return String(text).replace(/\{([a-zA-Z][\w]*)\}/g, (token, name) => own(params, name) ? String(params[name]) : token);
    },
    number(value, options) { return new Intl.NumberFormat(current, options).format(value); },
  };
  return api;
}

let saved;
let languages = [];
// Node imports retain the original Chinese defaults (including existing server/unit tests).
if (typeof window !== 'undefined') {
  try { saved = window.localStorage.getItem(LOCALE_STORAGE_KEY); } catch { /* optional */ }
  languages = Array.from(window.navigator?.languages || [window.navigator?.language]).filter(Boolean);
}
export const i18n = createI18n({
  locale: detectLocale(saved, languages),
  persist: (locale) => globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale),
});
export const t = (key, params, fallback) => i18n.t(key, params, fallback);
export const getLocale = () => i18n.getLocale();
export const setLocale = (locale) => i18n.setLocale(locale);
export const formatNumber = (value, options) => i18n.number(value, options);

/** Stable record-id keys for translated game text, without changing the shared canonical data. */
export const localizedText = (domain, id, field, source, params) => t(`data.${domain}.${id}.${field}`, params, source);

/** Localize the non-Preact shell as well as assistive-technology language metadata. */
export function syncDocumentLocale(doc = globalThis.document) {
  if (!doc) return;
  doc.documentElement.lang = getLocale();
  doc.title = t('app.title');
  for (const el of doc.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  doc.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
  doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', t('app.name'));
}
