#!/usr/bin/env node
// Build display-only overlays from the upstream client text tables. Canonical data is never rewritten.
import overrides from './i18n/overrides.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const REVISION = '56aee3d6c5a29c3a0d192456d70d14252cbb0804';
const flags = new Set(['--refresh', '--offline', '--check']);
for (const arg of process.argv.slice(2)) if (!flags.has(arg)) throw new Error(`Unknown option: ${arg}`);
if (process.argv.includes('--refresh') && process.argv.includes('--offline')) throw new Error('--refresh and --offline are mutually exclusive');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, '.cache/i18n', REVISION);
const tables = ['character_table', 'skill_table', 'uniequip_table', 'battle_equip_table', 'handbook_info_table', 'activity_table'];
const regions = { zh: 'cn', ko: 'kr', en: 'en', ja: 'jp' };
const fields = new Set(['name', 'subProfessionName', 'desc', 'descRaw', 'moduleDesc', 'moduleDescRaw', 'effectName', 'effectDesc', 'effectDescRaw', 'eventTypeDesc']);
const han = /\p{Script=Han}/u;
const plain = s => s.replace(/<[@$#][^<>]*>|<\/>|<\/?color[^<>]*>|<\/?[bi]>/gi, '').replace(/\\n/g, '\n');
const normalize = s => plain(s).replace(/\s+/g, '').replace(/[，,]/g, ',').replace(/[。]/g, '.');
async function table(lang, name) {
  const path = resolve(cache, `${lang}-${name}.json`);
  if (!process.argv.includes('--refresh')) {
    try { return JSON.parse(await readFile(path, 'utf8')); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  if (process.argv.includes('--offline')) throw new Error(`Missing cache: ${path}`);
  const url = `https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/${REVISION}/${regions[lang]}/gamedata/excel/${name}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}: ${url}`);
  const text = await res.text();
  const obj = JSON.parse(text);
  await writeFile(path, text);
  return obj;
}
function pairs(a, b, out) {
  if (typeof a === 'string' && typeof b === 'string' && a && b && han.test(a)) { out.set(a, b); return; }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return;
  for (const key of Object.keys(a)) if (Object.hasOwn(b, key)) pairs(a[key], b[key], out);
}
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function template(source, target) {
  const keys = [];
  const chunks = normalize(source).split(/(\{[^{}]+\})/g);
  const pattern = chunks.map(s => {
    if (!s.startsWith('{')) return escape(s);
    keys.push(s.slice(1, -1).toLowerCase());
    return '([+−-]?[0-9]+(?:\\.[0-9]+)?[%％]?)';
  }).join('');
  return { regex: new RegExp(`^${pattern}$`), keys, target };
}
function translate(text, templates, exact) {
  const norm = normalize(text);
  if (exact.has(norm)) return exact.get(norm);
  for (const {regex, keys, target} of templates) {
    const m = regex.exec(norm);
    if (!m) continue;
    const values = new Map(keys.map((k,i) => [k, m[i+1]]));
    let missing = false;
    const result = target.replace(/\{([^{}]+)\}/g, (token,key) => {
      const v = values.get(key.toLowerCase());
      if (v === undefined) missing = true;
      return v ?? token;
    });
    if (!missing) return result.replace(/\\n/g, '\n');
  }
  return null;
}
async function main() {
  await mkdir(cache, {recursive:true});
  const sourceTables = await Promise.all(tables.map(name => table('zh',name)));
  const domains = ['chess', 'tokens', 'garrisons', 'bonds'];
  const source = Object.fromEntries(await Promise.all(domains.map(async name => [name, JSON.parse(await readFile(resolve(root,`data/${name}.json`),'utf8'))])));
  await mkdir(resolve(root,'data/locales'),{recursive:true});
  for (const lang of ['ko','en','ja']) {
    const translations = new Map();
    const localized = await Promise.all(tables.map(name => table(lang,name)));
    sourceTables.forEach((src,i) => pairs(src,localized[i],translations));
    const exact = new Map(), templates = [];
    for (const [a,b] of translations) {
      if (a.includes('{')) templates.push(template(a,b));
      exact.set(normalize(a),b.replace(/\\n/g,'\n'));
    }
    for (const row of overrides) exact.set(normalize(row[0]), row[{ko:1,en:2,ja:3}[lang]]);
    const out = {}, missing = new Map();
    function walk(value, path) {
      if (!value || typeof value !== 'object') return;
      for (const [key, v] of Object.entries(value)) {
        const next = [...path,key];
        if (typeof v === 'object') walk(v,next);
        else if (typeof v === 'string' && fields.has(key) && han.test(v)) {
          const text = translate(v, templates, exact);
          if (text != null) out[next.join('/')] = [v, key.endsWith('Raw') ? text : plain(text)];
          else { const paths = missing.get(v) || []; paths.push(next.join('/')); missing.set(v, paths); }
        }
      }
    }
    walk(source,[]);
    await writeFile(resolve(cache,`${lang}-missing.json`),JSON.stringify(Object.fromEntries(missing),null,2));
    if (missing.size) throw new Error(`${lang}: ${missing.size} untranslated source texts; update tools/i18n/overrides.mjs`);
    const output = JSON.stringify(out,null,2)+'\n';
    const outputPath = resolve(root,`data/locales/${lang}.json`);
    if (process.argv.includes('--check')) {
      if (await readFile(outputPath, 'utf8') !== output) throw new Error(`${outputPath} is stale; run npm run build-i18n`);
    } else await writeFile(outputPath,output);
    console.log(`${lang}: ${Object.keys(out).length} translated fields; ${missing.size} unmatched source texts (see ${cache}/${lang}-missing.json)`);
  }
}
main().catch(err => {console.error(err); process.exitCode=1;});
