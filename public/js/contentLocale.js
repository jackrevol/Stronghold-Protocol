import { SOURCE_RECORD } from '../../shared/sourceRecord.js';

export const CONTENT_DOMAINS = new Set(['chess', 'tokens', 'garrisons', 'bonds']);
const TEXT_FIELDS = new Set(['name', 'subProfessionName', 'desc', 'descRaw', 'moduleDesc', 'moduleDescRaw', 'effectName', 'effectDesc', 'effectDescRaw', 'eventTypeDesc']);

/** Copy only translated branches. IDs, stats, blackboards and the source object remain untouched. */
export function localizeRecord(record, path, catalog) {
  if (!record || typeof record !== 'object' || !catalog) return record;
  let result = record;
  for (const [key, value] of Object.entries(record)) {
    const fieldPath = `${path}/${key}`;
    let next = value;
    if (typeof value === 'string' && TEXT_FIELDS.has(key)) {
      const entry = catalog[fieldPath];
      // A data rebuild must never attach an old translation to a different source text.
      if (Array.isArray(entry) && entry[0] === value && typeof entry[1] === 'string') next = entry[1];
    } else if (value && typeof value === 'object') {
      next = localizeRecord(value, fieldPath, catalog);
    }
    if (next !== value) {
      if (result === record) result = Array.isArray(record) ? record.slice() : { ...record, [SOURCE_RECORD]: record };
      result[key] = next;
    }
  }
  return result;
}

/** A lazy, per-language presentation layer over the canonical data store. */
export function createContentData(raw, i18n, { fetch: doFetch = (...args) => globalThis.fetch(...args) } = {}) {
  const catalogs = new Map();
  const pending = new Map();
  const views = new Map();
  const listeners = new Set();
  const changed = () => { for (const domain of CONTENT_DOMAINS) for (const fn of [...listeners]) fn(domain); };
  async function loadLocale(locale = i18n.getLocale()) {
    if (locale === 'zh-CN' || catalogs.has(locale)) return;
    if (!pending.has(locale)) {
      const task = Promise.resolve().then(async () => {
        try {
          const response = await doFetch(`/data/locales/${locale}.json`, { cache: 'no-cache' });
          if (!response?.ok) throw new Error(`HTTP ${response?.status}`);
          const catalog = await response.json();
          if (!catalog || Array.isArray(catalog) || typeof catalog !== 'object') throw new Error('Invalid catalog');
          catalogs.set(locale, catalog);
          views.delete(locale);
        } catch (error) {
          console.warn(`[i18n] ${locale} game text unavailable; using source text`, error);
        } finally {
          pending.delete(locale);
          if (locale === i18n.getLocale()) changed();
        }
      });
      pending.set(locale, task);
    }
    await pending.get(locale);
  }
  const unsubscribeLocale = i18n.subscribe(() => {
    // Do not clear records or remount the screen while the selected language downloads.
    changed();
    if ([...CONTENT_DOMAINS].some(name => raw.status(name) !== 'idle')) void loadLocale();
  });
  const unsubscribeRaw = raw.subscribe(name => { for (const fn of [...listeners]) fn(name); });
  function view(name, record) {
    const locale = i18n.getLocale();
    const catalog = catalogs.get(locale);
    if (!CONTENT_DOMAINS.has(name) || !catalog || !record) return record;
    let cache = views.get(locale);
    if (!cache) views.set(locale, cache = new WeakMap());
    if (!cache.has(record)) {
      const id = record.chessId || record.tokenId || record.garrisonId || record.bondId || record.key;
      cache.set(record, id ? localizeRecord(record, `${name}/${id}`, catalog) : record);
    }
    return cache.get(record);
  }
  const load = async name => {
    const [value] = await Promise.all([raw.load(name), CONTENT_DOMAINS.has(name) ? loadLocale() : null]);
    return value;
  };
  return {
    ...raw,
    load,
    loadAll: (...names) => Promise.all(names.flat().map(load)),
    lookup: (name, id) => view(name, raw.lookup(name, id)),
    list: name => raw.list(name).map(record => view(name, record)),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    loadLocale,
    dispose() { unsubscribeLocale(); unsubscribeRaw(); listeners.clear(); },
  };
}
