// Build only the browser's public mounts. Never copy server credentials or Node-only modules.
import { cp, mkdir, readdir, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DATA_SHIM_JS } from '../server/index.js';
import { AUDIO_EXTS } from '../shared/media.js';
import { writePackIndex } from './packs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const run = (script) => {
  const result = spawnSync(process.execPath, [path.join(root, script)], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${script} failed`, { cause: result.error });
};
run('tools/vendor.mjs');
if (process.env.SP_FETCH_ASSETS === '1') run('tools/fetch-assets.mjs');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const visible = (file) => !path.basename(file).startsWith('.') && !file.endsWith('~');
await cp(path.join(root, 'public'), out, { recursive: true, filter: visible });
for (const dir of ['data', 'shared']) {
  await cp(path.join(root, dir), path.join(out, dir), { recursive: true, filter: visible });
}
await cp(path.join(root, 'server/sim'), path.join(out, 'sim'), {
  recursive: true,
  filter: (file) => visible(file) && path.basename(file).toLowerCase() !== 'nodedata.js'
    && (!path.extname(file) || file.endsWith('.js')),
});
await writeFile(path.join(out, 'data.js'), DATA_SHIM_JS);
writePackIndex(root, path.join(out, 'packs/index.json'));
try { await access(path.join(out, 'data/local-assets.json')); }
catch { await writeFile(path.join(out, 'data/local-assets.json'), JSON.stringify({ version: 1, source: 'none', count: 0, groups: {} })); }

// Web Audio fetches extension-less URLs; publish aliases on the CDN, outside the Function bundle.
async function mediaAliases(dir, rel = '') {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return; throw e; }
  const stems = new Map();
  for (const entry of entries) {
    if (!visible(entry.name)) continue;
    if (entry.isDirectory()) await mediaAliases(path.join(dir, entry.name), path.join(rel, entry.name));
    else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!AUDIO_EXTS.includes(ext)) continue;
      const stem = entry.name.slice(0, -ext.length);
      const prev = stems.get(stem);
      if (!prev || AUDIO_EXTS.indexOf(ext) < AUDIO_EXTS.indexOf(path.extname(prev).toLowerCase())) stems.set(stem, entry.name);
    }
  }
  if (stems.size) await mkdir(path.join(out, 'media', rel), { recursive: true });
  for (const [stem, name] of stems) await cp(path.join(dir, name), path.join(out, 'media', rel, stem));
}
await mediaAliases(path.join(root, 'public/assets/audio'));
console.log('Vercel static client built in dist/ (game server: api/server.js)');
