import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogs, LOCALES, createI18n, detectLocale, normalizeLocale, setLocale, localizedText } from '../../public/js/i18n.js';
import { describeError } from '../../public/js/ui/toasts.js';
import { NetError, CLIENT_ERR_TEXT } from '../../public/js/net.js';
import { ERR } from '../../shared/constants.js';
import { difficultyInfo, stageNote } from '../../public/js/screens/lobby.js';

afterEach(() => setLocale('zh-CN'));

test('saved language wins; regional tags, browser preference order and unsupported values', () => {
  assert.equal(detectLocale('ja-JP', ['ko-KR']), 'ja');
  assert.equal(detectLocale('invalid', ['fr-FR', 'ko-KR', 'en-US']), 'ko');
  assert.equal(detectLocale(null, ['zh-TW']), 'zh-CN');
  assert.equal(detectLocale(null, ['fr-FR']), 'zh-CN');
  assert.equal(normalizeLocale('EN_us'), 'en');
  for (const value of [null, 4, {}, 'constructor', '__proto__', 'ja<script>']) assert.equal(normalizeLocale(value), null);
});

test('all four catalogs have matching keys, placeholders, and every protocol error', () => {
  const keys = Object.keys(catalogs['zh-CN']).sort();
  const params = (value) => [...new Set(String(value).match(/\{\w+\}/g) || [])].sort();
  assert.deepEqual(LOCALES.map((l) => l.id).sort(), ['en', 'ja', 'ko', 'zh-CN']);
  for (const { id } of LOCALES) {
    assert.deepEqual(Object.keys(catalogs[id]).sort(), keys, id);
    for (const key of keys) {
      assert.equal(typeof catalogs[id][key], 'string', `${id}: ${key}`);
      assert.ok(catalogs[id][key].length, `${id}: ${key}`);
      assert.deepEqual(params(catalogs[id][key]), params(catalogs['zh-CN'][key]), `${id}: ${key}`);
    }
    for (const code of [...Object.keys(ERR), ...Object.keys(CLIENT_ERR_TEXT)]) assert.ok(catalogs[id][`error.${code}`]);
  }
});

test('missing translations, plural selection, and interpolation preserve literal player input', () => {
  const tr = createI18n({ locale: 'en', messages: {
    'zh-CN': { fallback: '原文', welcome: '你好 {name}' },
    en: { welcome: 'Hello {name}', count: { one: '{count} item', other: '{count} items' } },
  } });
  assert.equal(tr.t('fallback'), '原文');
  assert.equal(tr.t('missing', {}, 'Source text'), 'Source text');
  assert.equal(tr.t('missing'), 'missing');
  assert.equal(tr.t('constructor'), 'constructor');
  assert.equal(tr.t('welcome', { name: '<img src=x> {name} $&' }), 'Hello <img src=x> {name} $&');
  assert.equal(tr.t('welcome', Object.create({ name: 'inherited' })), 'Hello {name}');
  assert.equal(tr.t('count', { count: 1 }), '1 item');
  assert.equal(tr.t('count', { count: 2 }), '2 items');
  assert.equal(tr.number(1234.5), '1,234.5');
});

test('switches notify once, unsubscribe, persist even the detected language, and survive blocked storage', () => {
  const saved = [], seen = [];
  const tr = createI18n({ locale: 'ko', persist: (locale) => saved.push(locale) });
  const unsubscribe = tr.subscribe((locale) => seen.push(locale));
  assert.equal(tr.setLocale('ko-KR'), true);
  assert.equal(tr.setLocale('ja-JP'), true);
  assert.equal(tr.setLocale('unsupported'), false);
  unsubscribe();
  tr.setLocale('en');
  assert.deepEqual(saved, ['ko', 'ja', 'en']);
  assert.deepEqual(seen, ['ja']);
  const denied = createI18n({ persist: () => { throw new Error('Storage denied'); } });
  assert.equal(denied.setLocale('ja'), true);
  assert.equal(denied.t('common.start'), '開始');
});

test('network errors are localized at display time without changing wire codes or raw server text', () => {
  const error = new NetError('NO_FUNDS');
  const raw = error.message;
  setLocale('ko');
  assert.equal(describeError(error), '자금이 부족합니다');
  setLocale('ja');
  assert.equal(describeError(error), '資金が不足しています');
  assert.equal(error.code, 'NO_FUNDS');
  assert.equal(error.message, raw);
  assert.equal(describeError(new NetError('BAD_MSG', '', 'protocol version mismatch')), catalogs.ja['error.VERSION']);
  assert.equal(describeError({ code: 'FUTURE_CODE', msg: 'server fallback' }), 'server fallback');
  assert.equal(describeError('constructor'), 'constructor');
});

test('mode and stage display translate while IDs, rules, and source records stay canonical', () => {
  const config = JSON.parse(readFileSync(new URL('../../data/config.json', import.meta.url)));
  const original = JSON.stringify(config);
  setLocale('en');
  assert.equal(stageNote(['act1autochess_m01']), 'Fixed battlefield: Battlefield #01');
  assert.equal(difficultyInfo('solo', 'FUNNY').rounds, 9);
  assert.equal(difficultyInfo('coop', 'HARD').desc, 'Simulation with very strong enemy attacks');
  assert.doesNotThrow(() => difficultyInfo('coop', undefined));
  assert.equal(localizedText('chess', 'untranslated', 'name', '原名'), '原名');
  for (const [id, mode] of Object.entries(config.modes)) {
    if (!mode.inScope) continue;
    for (const locale of ['ko', 'ja', 'en']) {
      setLocale(locale);
      assert.notEqual(localizedText('modes', id, 'desc', mode.desc), mode.desc);
    }
  }
  assert.equal(JSON.stringify(config), original);
});
