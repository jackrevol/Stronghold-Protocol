import { html } from './components.js';
import { LOCALES, setLocale, t } from '../i18n.js';
import { useLocale } from './useLocale.js';

export function LanguageSelect() {
  const locale = useLocale();
  return html`<label class="language-select">
    <span>${t('settings.language')}</span>
    <select value=${locale} onChange=${(e) => setLocale(e.currentTarget.value)}>
      ${LOCALES.map(({ id, label }) => html`<option key=${id} value=${id} lang=${id}>${label}</option>`)}
    </select>
  </label>`;
}
