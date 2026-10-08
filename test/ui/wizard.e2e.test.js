// SP_E2E=1 node --test test/ui/wizard.e2e.test.js (isolated headless Chrome, real server and match).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startServer } from '../../server/index.js';
import { Match } from '../../server/match/Match.js';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.SP_E2E === '1' && existsSync(CHROME);

test('wizard room toggle, catalog filters, repeat purchases, and full-tier discovery selection work through the browser', { skip: !enabled, timeout: 90000 }, async () => {
  class FundedMatch extends Match {
    constructor(opts) { super({ ...opts, timerScale: 0 }); }
    startRound(round) {
      super.startRound(round);
      for (const ps of this.players.values()) { ps.funds = 100; ps.dirty(); }
    }
  }
  const server = await startServer({ port: 0, host: '127.0.0.1', quiet: true, MatchClass: FundedMatch, seedFn: () => 1 });
  let browser;
  try {
    const puppeteer = (await import('puppeteer-core')).default;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (err) => errors.push(err.stack || err.message));
    // This checkout need not have downloaded game art. Supply the renderer's required shadow as a tiny fixture.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === '/assets/ui/battle/sprite_shadow.png') {
        void req.respond({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
      } else void req.continue();
    });
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'languages', { get: () => ['en-US'] }));
    await page.goto(`${server.url}?lang=en`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-login input');
    await page.type('.title-login input', 'WizardTest');
    await page.click('.title-login .btn--primary');
    await page.waitForFunction(() => globalThis.__SP__?.net.status === 'online');
    await page.evaluate(() => globalThis.__SP__.net.request('room.create', { mode: 'solo', difficulty: 'NORMAL' }));
    await page.waitForSelector('.room-screen');
    await page.evaluate(() => [...document.querySelectorAll('.room-screen button')].find((b) => b.textContent.includes('Wizard mode')).click());
    await page.waitForFunction(() => globalThis.__SP__.store.get().room?.wizardMode === true);
    if (process.env.SP_E2E_OUT) {
      await page.screenshot({ path: `${process.env.SP_E2E_OUT}/wizard-room-1440.png` });
      await page.setViewport({ width: 844, height: 390 });
      await page.screenshot({ path: `${process.env.SP_E2E_OUT}/wizard-room-844.png` });
      await page.setViewport({ width: 1440, height: 900 });
    }
    await page.evaluate(() => globalThis.__SP__.net.request('room.start', {}));
    await page.waitForFunction(() => globalThis.__SP__.store.get().match.public?.phase === 'INFO_CHECK');
    await page.evaluate(() => globalThis.__SP__.net.request('g.infoReady', {}));
    await page.waitForFunction(() => globalThis.__SP__.store.get().match.public?.phase === 'BAND_DRAFT');
    await page.evaluate(() => globalThis.__SP__.net.request('g.band', { bandId: 'band_bldsk' }));
    await page.waitForSelector('.shopbar.is-wizard .wizard-catalog');
    await page.waitForFunction(() => globalThis.__SP__.store.get().match.public?.phase === 'PREP');

    const match = [...server.lobby.rooms.values()][0].match;
    const ps = [...match.players.values()][0];
    const expectedIds = match.gd.visibleChess.filter((id) => !match.bannedChess.includes(id));
    assert.deepEqual(ps.shop.slots.filter((s) => s?.kind === 'chess').map((s) => s.id), expectedIds);
    assert.equal(ps.shop.level, 1);
    await page.select('.wizard-catalog select', '6');
    await page.waitForFunction(() => [...document.querySelectorAll('.shopbar__cards .scard .tierchip')].every((chip) => chip.textContent.includes('6')));
    assert.equal(await page.$$eval('.shopbar__cards .scard', (els) => els.length), expectedIds.filter((id) => match.gd.tierOf(id) === 6).length);
    await page.select('.wizard-catalog select', '0');
    const buyId = ps.shop.slots.find((s) => s?.kind === 'chess' && match.gd.tierOf(s.id) === 1 && !ps.hand.some((p) => p?.id === s.id)).id;
    await page.type('.wizard-catalog input', buyId);
    await page.waitForFunction(() => document.querySelectorAll('.shopbar__cards .scard').length === 1);
    const price = match.gd.chessPrice(buyId);
    for (let n = 1; n <= 3; n++) {
      await page.click('.shopbar__cards .scard');
      await page.waitForSelector('.shopbar__cards .scard.is-armed');
      await page.click('.shopbar__cards .scard');
      await page.waitForFunction((funds) => globalThis.__SP__.store.get().match.private?.funds === funds, {}, 100 - price * n);
    }
    assert.equal(ps.stats.merges, 1);
    await page.waitForSelector('.shopbar__rwcards .scard');
    const offer = ps.offers[0];
    assert.deepEqual(offer.slots.map((s) => s.id), expectedIds.filter((id) => match.gd.tierOf(id) === 2));
    assert.ok(offer.slots.length > 6);
    const pickId = offer.slots.at(-1).id;
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
      await page.setViewport(viewport);
      await page.waitForFunction(() => {
        const row = document.querySelector('.shopbar__row').getBoundingClientRect();
        return row.left >= -1 && row.right <= innerWidth + 1;
      });
      const scrollable = await page.$eval('.shopbar__rwcards', (el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto');
      assert.ok(scrollable);
      if (process.env.SP_E2E_OUT) await page.screenshot({ path: `${process.env.SP_E2E_OUT}/wizard-${viewport.width}.png` });
    }
    await page.$eval('.shopbar__rwcards', (el) => { el.scrollLeft = el.scrollWidth; });
    await page.click('.shopbar__rwcards .scard:last-child');
    await page.waitForSelector('.shopbar__rwcards .scard:last-child.is-armed');
    await page.click('.shopbar__rwcards .scard:last-child');
    await page.waitForFunction(() => !globalThis.__SP__.store.get().match.private?.shop.rewardOffer);
    assert.ok(ps.hand.some((p) => p?.id === pickId));
    await page.waitForSelector('.wizard-catalog input');
    assert.equal(await page.$eval('.wizard-catalog input', (el) => el.value), buyId);
    assert.equal(await page.$$eval('.shopbar__cards .scard', (els) => els.length), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
