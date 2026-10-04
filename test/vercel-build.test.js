import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Vercel build publishes browser mounts and keeps server code and owner credentials private', () => {
  const secret = 'build-test-secret-must-never-be-published';
  execFileSync(process.execPath, ['tools/build-vercel.mjs'], {
    cwd: root, env: { ...process.env, SP_FETCH_ASSETS: '0', SP_ROOM_CREATION: 'owner', SP_OWNER_KEY: secret },
  });
  const out = path.join(root, 'dist');
  for (const file of ['index.html', 'js/main.js', 'js/locales/ko.js', 'vendor/preact.module.js',
    'shared/protocol.js', 'data/config.json', 'data/local-assets.json', 'sim/Battle.js', 'data.js']) {
    assert.ok(existsSync(path.join(out, file)), file);
  }
  for (const file of ['server', 'api', 'sim/nodeData.js', '.env', '.env.example', 'package.json', 'node_modules']) {
    assert.equal(existsSync(path.join(out, file)), false, file);
  }
  const scan = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      assert.ok(!entry.name.startsWith('.'), file);
      if (entry.isDirectory()) scan(file);
      else if (/\.(js|html|json|css)$/.test(file)) assert.ok(!readFileSync(file, 'utf8').includes(secret), file);
    }
  };
  scan(out);
  assert.match(readFileSync(path.join(out, 'data.js'), 'utf8'), /getSimData/);
});
