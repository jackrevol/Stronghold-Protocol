// SP_E2E=1 node --test test/ui/room-policy.e2e.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startServer } from '../../server/index.js';
import { roomPolicy } from '../../server/room-policy.js';

const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('owner key input creates a room; guest joins without learning or storing the owner key', {
  skip: process.env.SP_E2E !== '1' || !existsSync(chrome),
}, async () => {
  const key = 'browser-owner-test-secret-'.repeat(2);
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true,
    creationPolicy: roomPolicy({ SP_ROOM_CREATION: 'owner', SP_OWNER_KEY: key }) });
  let browser;
  try {
    const puppeteer = (await import('puppeteer-core')).default;
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
    const errors = [];
    const enter = async (name) => {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${srv.port}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.title-login input');
      await page.type('.title-login input', name);
      await page.click('.title-login .btn--primary');
      await page.waitForSelector('.create-box input[type=password]');
      await page.waitForFunction(() => globalThis.__SP__?.net.status === 'online');
      assert.equal(await page.$eval('.create-box .btn--primary', (el) => el.disabled), true);
      return page;
    };
    const owner = await enter('Owner');
    await owner.type('.create-box input[type=password]', key);
    await owner.click('.create-box .btn--primary');
    await owner.waitForSelector('.room-screen');
    const code = await owner.evaluate(() => __SP__.store.get().room.code);
    const guest = await enter('Guest');
    assert.equal(await guest.$eval('.create-box input', (el) => el.value), '');
    await guest.type('.join-row input', code);
    await guest.keyboard.press('Enter');
    await guest.waitForSelector('.room-screen');
    assert.equal(await guest.evaluate(() => __SP__.store.get().room.code), code);
    for (const page of [owner, guest]) {
      const storage = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
      assert.ok(!storage.includes(key));
    }
    assert.equal(srv.lobby.getRoom(code).activeHumans().length, 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await srv.close();
  }
});
