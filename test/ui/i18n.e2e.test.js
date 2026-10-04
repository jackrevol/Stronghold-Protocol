// SP_E2E=1 node --test test/ui/i18n.e2e.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { catalogs } from '../../public/js/i18n.js';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.SP_E2E === '1' && existsSync(CHROME);
let server, browser, base;
before(async () => {
  if (!enabled) return;
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  server = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  base = `http://127.0.0.1:${server.port}`;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await server?.close(); });

test('four languages switch live across title, lobby, room and settings without losing state', { skip: !enabled }, async () => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'en-US'] }));
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-screen .language-select select');
    assert.equal(await page.$eval('html', (el) => el.lang), 'ko');
    await page.type('.title-login input', 'Doctor한日');
    const change = async (locale, selector) => {
      await page.select(`${selector} .language-select select`, locale);
      await page.waitForFunction((locale) => document.documentElement.lang === locale, {}, locale);
      await page.waitForFunction((title) => document.title === title, {}, catalogs[locale]['app.title']);
    };
    for (const locale of ['en', 'ja', 'zh-CN', 'ko']) {
      await change(locale, '.title-screen');
      await page.waitForFunction((text) => document.querySelector('.title-login .btn--primary')?.textContent.trim() === text, {}, catalogs[locale]['common.start']);
      assert.equal(await page.$eval('.title-login input', (el) => el.value), 'Doctor한日');
      assert.equal(await page.$eval('.title-login input', (el) => el.placeholder), catalogs[locale]['title.placeholder'].replace('{max}', '12'));
    }
    await page.click('.title-login .btn--primary');
    await page.waitForSelector('.lobby-screen');
    await page.waitForFunction(() => globalThis.__SP__?.net.status === 'online');
    const playerId = await page.evaluate(() => __SP__.store.get().me.playerId);
    await page.type('.join-row input', 'ABCD');
    for (const locale of ['ja', 'en', 'zh-CN', 'ko']) {
      await change(locale, '.lobby-screen');
      await page.waitForFunction((title) => document.querySelector('.topbar__title')?.textContent === title, {}, catalogs[locale]['lobby.title']);
      assert.equal(await page.$eval('.join-row input', (el) => el.value), 'ABCD');
      assert.equal(await page.evaluate(() => __SP__.store.get().me.playerId), playerId);
      if (process.env.SP_I18N_SCREENSHOTS) {
        mkdirSync(process.env.SP_I18N_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: `${process.env.SP_I18N_SCREENSHOTS}/lobby-${locale}.png` });
      }
    }
    await page.click('.create-box .btn--primary');
    await page.waitForSelector('.room-screen');
    const code = await page.evaluate(() => __SP__.store.get().room.code);
    for (const locale of ['en', 'ja', 'zh-CN', 'ko']) {
      await change(locale, '.room-screen');
      await page.waitForFunction((text) => document.querySelector('.room-bar__right .btn--primary')?.textContent.trim() === text, {}, catalogs[locale]['room.start']);
      assert.equal(await page.evaluate(() => __SP__.store.get().room.code), code);
      if (process.env.SP_I18N_SCREENSHOTS) await page.screenshot({ path: `${process.env.SP_I18N_SCREENSHOTS}/room-${locale}.png` });
    }
    // Render the real settings modal in an independent host, preserving the active room below it.
    await page.evaluate(async () => {
      const { render, h } = await import('/vendor/preact.module.js');
      const { SettingsModal } = await import('/js/ui/settings.js');
      const host = document.createElement('div'); host.id = 'test-settings'; document.body.append(host);
      render(h(SettingsModal, { open: true, onClose: () => {} }), host);
    });
    await page.waitForSelector('#test-settings .language-select select');
    await change('ja', '#test-settings');
    await page.waitForFunction(() => document.querySelector('#test-settings .modal__title')?.textContent === '設定');
    assert.equal(await page.evaluate(() => __SP__.store.get().room.code), code);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.room-screen .language-select select');
    assert.equal(await page.$eval('html', (el) => el.lang), 'ja');
    assert.equal(await page.$eval('.language-select select', (el) => el.value), 'ja');
    assert.equal(await page.evaluate(() => __SP__.store.get().me.playerId), playerId);
    assert.equal(await page.evaluate(() => __SP__.store.get().room.code), code);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('long translations keep language and room controls within a landscape phone viewport', { skip: !enabled }, async () => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => localStorage.setItem('sp.pref.locale', 'ja'));
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-login input');
    await page.type('.title-login input', 'Mobile');
    const inView = async (selector) => {
      const bounds = await page.$eval(selector, (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight };
      });
      assert.ok(bounds.left >= -1 && bounds.right <= bounds.width + 1 && bounds.top >= -1 && bounds.bottom <= bounds.height + 1, `${selector}: ${JSON.stringify(bounds)}`);
    };
    await inView('.language-select select');
    await inView('.title-login .btn--primary');
    await page.click('.title-login .btn--primary');
    await page.waitForSelector('.lobby-screen');
    await page.waitForFunction(() => __SP__.net.status === 'online');
    for (const locale of ['en', 'ja']) {
      await page.select('.language-select select', locale);
      await page.waitForFunction((l) => document.documentElement.lang === l, {}, locale);
      await inView('.language-select select');
    }
    await page.click('.create-box .btn--primary');
    await page.waitForSelector('.room-screen');
    for (const locale of ['en', 'ja']) {
      await page.select('.language-select select', locale);
      await page.waitForFunction((l) => document.documentElement.lang === l, {}, locale);
      await inView('.language-select select');
      await inView('.invite__btns');
      await inView('.room-bar__right .btn--primary');
      if (process.env.SP_I18N_SCREENSHOTS) await page.screenshot({ path: `${process.env.SP_I18N_SCREENSHOTS}/mobile-room-${locale}.png` });
    }
  } finally { await context.close(); }
});

test('operator content switches live, including search, selected skills, talents and modules', { skip: !enabled }, async () => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.setViewport({width:1440,height:1000});
  await page.evaluateOnNewDocument(() => localStorage.setItem('sp.pref.locale','ko'));
  try {
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.title-login input');
    await page.type('.title-login input','Doctor中文');
    await page.click('.title-login .btn--primary');
    await page.waitForSelector('[data-testid="loadout-open"]');
    await page.click('[data-testid="loadout-open"]');
    await page.waitForFunction(() => document.querySelector('[data-chess="chess_char_1_01_a"] .lo-card__name')?.textContent === '인사이더');
    await page.type('.lo-search input','인사이더');
    await page.waitForFunction(()=>document.querySelectorAll('.lo-card').length===1);
    await page.click('[data-chess="chess_char_1_01_a"]');
    await page.click('.lo-skill[data-skill="0"]');
    const loadoutBefore = await page.evaluate(async()=>JSON.stringify((await import('/js/ui/loadoutSync.js')).loadoutStore.get().entries));
    for (const [locale, name] of [['en','Insider'],['ja','インサイダー'],['zh-CN','隐现'],['ko','인사이더']]) {
      await page.evaluate(async locale => {
        const {setLocale}=await import('/js/i18n.js');
        const {data}=await import('/js/data.js');
        setLocale(locale);
        await data.loadLocale();
      },locale);
      await page.waitForFunction(name=>document.querySelector('.lo-dhead__name')?.textContent===name,{},name);
      assert.equal(await page.$eval('.lo-search input',el=>el.value),'인사이더','search input preserved');
      assert.equal(await page.evaluate(async()=>JSON.stringify((await import('/js/ui/loadoutSync.js')).loadoutStore.get().entries)),loadoutBefore);
      const texts = await page.$$eval('.lo-skill__name, .lo-skill__desc, .lo-mod__name, .lo-minfo__tname, .lo-minfo__v .rt',els=>els.map(el=>el.textContent).join('\n'));
      if (locale==='ko'||locale==='en') assert.doesNotMatch(texts,/\p{Script=Han}/u);
      assert.equal(await page.$eval('.lo-skill[data-skill="0"]',el=>el.getAttribute('aria-checked')),'true');
      if (process.env.SP_I18N_SCREENSHOTS) {
        mkdirSync(process.env.SP_I18N_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:`${process.env.SP_I18N_SCREENSHOTS}/operators-${locale}.png`});
      }
    }
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
});
