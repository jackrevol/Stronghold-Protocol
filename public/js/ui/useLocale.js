import { useLayoutEffect, useState } from '../../vendor/hooks.module.js';
import { i18n } from '../i18n.js';

/** Subscribe without remounting screens: typing, dialogs and active matches keep their state. */
export function useLocale() {
  const [locale, update] = useState(i18n.getLocale);
  useLayoutEffect(() => {
    const unsubscribe = i18n.subscribe(update);
    update(i18n.getLocale());
    return unsubscribe;
  }, []);
  return locale;
}
