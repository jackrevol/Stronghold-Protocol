import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContentData, localizeRecord, CONTENT_DOMAINS } from '../../public/js/contentLocale.js';
import { createI18n } from '../../public/js/i18n.js';
import { createDataStore } from '../../public/js/data.js';
import { sourceRecord } from '../../shared/sourceRecord.js';
import { loadoutRecord, attackRangeGrid, traitRangeExtend } from '../../shared/loadoutRecord.js';
import { filterRoster } from '../../public/js/ui/loadoutModel.js';

const read = path => JSON.parse(readFileSync(new URL(`../../data/${path}.json`, import.meta.url), 'utf8'));
const source = Object.fromEntries([...CONTENT_DOMAINS].map(name => [name, read(name)]));
const textFields = new Set(['name', 'subProfessionName', 'desc', 'descRaw', 'moduleDesc', 'moduleDescRaw', 'effectName', 'effectDesc', 'effectDescRaw', 'eventTypeDesc']);
for (const locale of ['ko', 'en', 'ja']) {
  const catalog = read(`locales/${locale}`);
  test(`${locale}: all operator/summon text is covered, with no unresolved templates or stale translations`, () => {
    function check(value, path) {
      for (const [key, v] of Object.entries(value || {})) {
        const field = `${path}/${key}`;
        if (v && typeof v === 'object') check(v, field);
        else if (typeof v === 'string' && textFields.has(key) && /\p{Script=Han}/u.test(v)) {
          assert.equal(catalog[field]?.[0], v, field);
          const translated = catalog[field][1];
          assert.ok(translated.trim(), field);
          assert.deepEqual((translated.match(/\{[^{}]+\}/g) || []).sort(), (v.match(/\{[^{}]+\}/g) || []).sort(), field);
          if (locale !== 'ja') assert.doesNotMatch(translated, /\p{Script=Han}/u, field);
        }
      }
    }
    for (const [domain, records] of Object.entries(source)) check(records, domain);
  });
  test(`${locale}: all skills/modules retain canonical stats, range, IDs and blackboards`, () => {
    for (const [id, original] of Object.entries(source.chess)) {
      const rec = localizeRecord(original, `chess/${id}`, catalog);
      assert.equal(sourceRecord(rec), original);
      assert.equal(rec.stats, original.stats);
      assert.equal(rec.assets, original.assets);
      for (const skill of original.skills || []) {
        for (const moduleId of ['none', ...(original.modules || []).map(m => m.uniEquipId)]) {
          const selection = {skillIndex:skill.index, moduleId};
          const a = loadoutRecord(original, selection), b = loadoutRecord(rec, selection);
          assert.deepEqual(b.stats, a.stats, id);
          assert.equal(b.skill.skillId, a.skill.skillId);
          assert.deepEqual(b.skill.bb, a.skill.bb);
          assert.deepEqual(attackRangeGrid(b), attackRangeGrid(a), `${id}/${skill.skillId}/${moduleId}`);
          assert.equal(traitRangeExtend(b), traitRangeExtend(a), id);
        }
      }
    }
  });
}

test('stale or hostile overlay fields cannot alter source records or simulation fields', () => {
  const source = {name:'旧名', chessId:'id', stats:{atk:40}, skill:{name:'原技能', skillId:'s'}};
  const overlay = {'chess/id/name':['别名','Wrong'], 'chess/id/chessId':['id','changed'], 'chess/id/stats/atk':[40,100], 'chess/id/skill/name':['原技能','Skill']};
  const result = localizeRecord(source,'chess/id',overlay);
  assert.equal(result.name,'旧名');
  assert.equal(result.chessId,'id');
  assert.equal(result.stats,source.stats);
  assert.equal(result.skill.name,'Skill');
  assert.equal(source.skill.name,'原技能');
});

test('switching languages updates lookup and lists, reuses downloads, and preserves canonical data/search', async () => {
  const calls = [];
  const i18n = createI18n({locale:'ko'});
  const raw = createDataStore({fetch:async url => ({ok:true,json:async()=>source[url.split('/').pop().replace('.json','')]})});
  const data = createContentData(raw,i18n,{fetch:async url => {calls.push(url);return {ok:true,json:async()=>read(`locales/${url.split('/').pop().replace('.json','')}`)};}});
  const events = [];
  data.subscribe(name => events.push(name));
  try {
    await Promise.all([data.load('chess'),data.load('tokens')]);
    const id='chess_char_1_01_a';
    const korean = data.lookup('chess',id);
    assert.equal(korean.name,'인사이더');
    assert.equal(korean.skill.name,"'트러블 해결'");
    assert.equal(raw.lookup('chess',id).name,'隐现');
    assert.equal(data.get('chess'),raw.get('chess'));
    for (const query of ['인사이더','Insider','隐现']) assert.ok(filterRoster(data.list('chess'),{query}).some(c=>c.chessId===id),query);
    for (const [locale,name] of [['en','Insider'],['ja','インサイダー'],['zh-CN','隐现'],['ko','인사이더']]) {
      i18n.setLocale(locale);
      await data.loadLocale();
      assert.equal(data.lookup('chess',id).name,name);
      assert.equal(data.list('chess').find(c=>c.chessId===id).name,name);
    }
    assert.equal(data.lookup('chess',id),korean,'stable cached record');
    assert.equal(calls.length,3,'one catalog request per non-Chinese locale');
    assert.ok(events.includes('chess') && events.includes('tokens'));
  } finally {data.dispose();}
});

test('failed locale downloads fall back safely and a subsequent load retries', async () => {
  const i18n = createI18n({locale:'ko'});
  const raw = createDataStore({fetch:async()=>({ok:true,json:async()=>source.chess})});
  let attempts = 0;
  const data = createContentData(raw,i18n,{fetch:async()=>++attempts === 1 ? {ok:false,status:503} : {ok:true,json:async()=>read('locales/ko')}});
  try {
    await data.load('chess');
    assert.equal(data.lookup('chess','chess_char_1_01_a').name,'隐现');
    await data.load('chess');
    assert.equal(data.lookup('chess','chess_char_1_01_a').name,'인사이더');
  } finally {data.dispose();}
});
