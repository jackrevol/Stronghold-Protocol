// Player settings (BGM/SFX volume, mute, damage numbers, render quality): a tiny observable store
// persisted in localStorage (`sp.pref.settings`), applied to the audio manager on every change, plus
// the settings modal.

import { LanguageSelect } from './languageSelect.js';
import { t } from '../i18n.js';
import { useLocale } from './useLocale.js';
import { useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Icon, MicroLabel } from './components.js';
import { createStore, useStore, loadPref, savePref } from '../store.js';
import { sanitizeSettings } from './gameLogic.js';
import { audio } from '../audio.js';
import { openGuide } from './guide.js';
import { detectFeatures } from './device.js';

/** Settings store: { bgm, sfx, muted, damageNumbers, quality }. */
export const settingsStore = createStore(sanitizeSettings(loadPref('settings', null)));

settingsStore.subscribe((s) => {
  savePref('settings', sanitizeSettings(s));
  audio.setVolumes(s);
});
audio.setVolumes(settingsStore.get());

/** @param {Partial<ReturnType<typeof sanitizeSettings>>} patch */
export function updateSettings(patch) {
  settingsStore.set(sanitizeSettings({ ...settingsStore.get(), ...patch }));
}

/** Preact hook: current settings. */
export const useSettings = () => useStore((s) => s, Object.is, settingsStore);

function Slider({ label, micro, value, onInput, icon }) {
  const pct = Math.round(value * 100);
  return html`<label class="set-row">
    <span class="set-row__label"><${Icon} name=${icon} />${label}<${MicroLabel}>${micro}<//></span>
    <input class="set-range" type="range" min="0" max="100" step="5" value=${pct} style=${`--pct:${pct}%`}
      onInput=${(e) => onInput(Number(e.currentTarget.value) / 100)} />
    <span class="set-row__val num">${pct}</span>
  </label>`;
}

function Toggle({ label, micro, value, onChange }) {
  return html`<div class="set-row">
    <span class="set-row__label">${label}<${MicroLabel}>${micro}<//></span>
    <button type="button" class=${`set-toggle${value ? ' is-on' : ''}`} role="switch" aria-checked=${value ? 'true' : 'false'}
      onClick=${() => onChange(!value)}><i></i><span>${value ? t('common.on') : t('common.off')}</span></button>
  </div>`;
}

const QUALITY = [['high', 'settings.high'], ['medium', 'settings.medium'], ['low', 'settings.low']];

/**
 * Settings modal.
 * @param {{ open: boolean, onClose: Function }} props
 */
export function SettingsModal({ open, onClose }) {
  useLocale();
  const s = useSettings();
  const [tested, setTested] = useState(false);
  const [touchUi] = useState(() => detectFeatures().coarse && !detectFeatures().fine);
  return html`<${Modal} open=${open} onClose=${onClose} title=${t('settings.title')} micro="SETTINGS" width="7.4rem"
    actions=${html`<${Button} variant="secondary" icon="book" class="set-guide" onClick=${() => openGuide(0)}>${t('common.guide')}<//>
      <${Button} variant="primary" icon="check" onClick=${onClose}>${t('common.done')}<//>`}>
    <div class="set-list">
      <div class="set-row"><${LanguageSelect} /></div>
      <${Slider} label=${t('settings.bgm')} micro="BGM" icon="play" value=${s.bgm} onInput=${(v) => updateSettings({ bgm: v })} />
      <${Slider} label=${t('settings.sfx')} micro="SFX" icon="signal" value=${s.sfx}
        onInput=${(v) => { updateSettings({ sfx: v }); if (!tested) { setTested(true); setTimeout(() => setTested(false), 400); audio.sfx('click'); } }} />
      <${Toggle} label=${t('settings.mute')} micro="MUTE" value=${s.muted} onChange=${(v) => updateSettings({ muted: v })} />
      <${Toggle} label=${t('settings.damage')} micro="DAMAGE NUMBERS" value=${s.damageNumbers} onChange=${(v) => updateSettings({ damageNumbers: v })} />
      <div class="set-row">
        <span class="set-row__label">${t('settings.quality')}<${MicroLabel}>QUALITY<//></span>
        <div class="set-seg" role="radiogroup">
          ${QUALITY.map(([id, label]) => html`<button key=${id} type="button" role="radio" aria-checked=${s.quality === id ? 'true' : 'false'}
            class=${s.quality === id ? 'is-on' : ''} onClick=${() => updateSettings({ quality: id })}>${t(label)}</button>`)}
        </div>
      </div>
      ${touchUi
        ? html`<p class="set-hint">${t('settings.touch')}</p>`
        : html`<p class="set-hint">${t('settings.shortcuts')}</p>`}
    </div>
  <//>`;
}
