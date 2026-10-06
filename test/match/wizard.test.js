import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, giveItem } from './harness.js';
import { ERR, DIFFICULTIES } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { makeCtx } from '../../server/match/effectsMeta.js';
import { attachAudit } from '../../server/match/audit.js';

const wizard = (opts = {}) => makeMatch({ fake: true, wizardMode: true, ...opts }).start().toPrep();

test('wizard catalogs include every eligible tier, exclude match bans, and survive refresh and round changes', () => {
  for (const mode of ['solo', 'coop']) for (const difficulty of DIFFICULTIES) {
    const h = wizard({ mode, difficulty });
    const { m } = h, ps = h.ps('p_0');
    const audit = attachAudit(m);
    const eligible = m.gd.visibleChess.filter((id) => !m.bannedChess.includes(id));
    const ids = () => ps.shop.slots.filter((s) => s?.kind === 'chess').map((s) => s.id);
    assert.deepEqual(ids(), eligible);
    assert.equal(ps.shop.level, 1);
    assert.equal(m.publicView().wizardMode, true);
    assert.equal(ps.privateView().shop.wizardMode, true);
    ps.funds = 100;
    assert.deepEqual(ps.refresh(), { ok: true });
    assert.deepEqual(ids(), eligible);
    ps.freeze();
    h.toPrep(2);
    assert.deepEqual(ids(), eligible);
    h.invariants();
    assert.deepEqual(audit.violations, []);
    m.dispose();
  }
});

test('wizard repeat purchases exceed shared stock, charge each purchase, and still merge and award discoveries', () => {
  const h = wizard(), { m } = h, ps = h.ps('p_0');
  const audit = attachAudit(m);
  const idx = ps.shop.slots.findIndex((s) => s?.kind === 'chess' && m.gd.tierOf(s.id) === 6);
  assert.ok(idx > 15, 'purchase must traverse the expanded network index range');
  const slot = ps.shop.slots[idx], price = ps.priceOf(slot), copies = 9;
  assert.ok(copies > m.pool.cap(slot.id));
  const before = m.pool.snapshot();
  ps.funds = price * copies;
  assert.equal(validateC2S({ t: 'g.buy', slot: idx }), null);
  for (let i = 0; i < copies; i++) {
    assert.deepEqual(m.handle(ps.playerId, { t: 'g.buy', slot: idx }), { ok: true });
    assert.equal(slot.sold, false);
  }
  assert.equal(ps.funds, 0);
  assert.equal(ps.stats.merges, 3);
  assert.equal(ps.offers.length, 3);
  assert.equal(ps.hand.filter((p) => p?.id === m.gd.goldenIdOf(slot.id)).length, 3);
  assert.deepEqual(ps.buy(idx), { error: ERR.NO_FUNDS });
  assert.deepEqual(m.pool.snapshot(), before);
  h.invariants();
  assert.deepEqual(audit.violations, []);
  m.dispose();
});

test('wizard merge discoveries offer all and only the exact reward tier at every shop level, including picks beyond index 5', () => {
  const h = wizard(), { m } = h, ps = h.ps('p_0');
  for (let level = 1; level <= 6; level++) {
    ps.shop.level = level;
    ps.offers = [];
    const offer = ps.pushRewardOffer('merge');
    const tier = Math.min(level + 1, 6);
    const expected = m.gd.visibleChess.filter((id) => m.pool.has(id) && m.gd.tierOf(id) === tier);
    assert.deepEqual(offer.slots.map((s) => s.id), expected);
    assert.ok(expected.length > 6);
    const idx = expected.length - 1;
    assert.equal(validateC2S({ t: 'g.reward', idx }), null);
    assert.deepEqual(ps.pickReward(idx), { ok: true });
    assert.ok(ps.hand.some((p) => p?.id === expected[idx]));
    assert.equal(ps.offers.length, 0);
  }
  h.invariants();
  m.dispose();
});

test('wizard enforces funds, hand capacity, bans and prep gates; item slots still sell out', () => {
  const h = wizard(), { m } = h, ps = h.ps('p_0');
  ps.funds = 100;
  const id = m.bannedChess[0];
  assert.ok(id);
  ps.shop.slots.push({ kind: 'chess', id, basePrice: 1, sold: false });
  assert.deepEqual(ps.buy(ps.shop.slots.length - 1), { error: ERR.BAD_TARGET });
  ps.shop.slots.pop();
  assert.equal(ps.pushRewardOffer('special', { ids: [id] }), null);
  ps.offers.push({ source: 'merge', slots: [{ kind: 'chess', id, price: 0 }] });
  assert.deepEqual(ps.pickReward(0), { error: ERR.BAD_TARGET });
  ps.offers = [];
  const idx = ps.shop.slots.findIndex((s) => s?.kind === 'item');
  assert.deepEqual(ps.buy(idx), { ok: true });
  assert.deepEqual(ps.buy(idx), { error: ERR.SOLD_OUT });
  const item = ps.shop.slots[idx].id;
  while (ps.hand.some((p) => p == null)) giveItem(m, ps, m.gd.item(item).goldenId || item);
  const funds = ps.funds;
  assert.deepEqual(ps.buy(0), { error: ERR.HAND_FULL });
  assert.equal(ps.funds, funds);
  ps.ready = true;
  assert.deepEqual(ps.buy(0), { error: ERR.WRONG_PHASE, detail: 'ready' });
  ps.ready = false;
  h.invariants();
  m.dispose();
});

test('wizard catalog entries persist through shop effects', () => {
  const h = wizard(), { m } = h, ps = h.ps('p_0');
  const ctx = makeCtx(m, ps, { key: 'test' }, 'onRefresh');
  const first = ps.shop.slots[0];
  assert.equal(ctx.setShopSlot(0, null), true);
  assert.equal(ps.shop.slots[0], first);
  assert.equal(ctx.setShopSlot(0, { id: ps.shop.slots[1].id, kind: 'chess' }), false);
  assert.equal(ctx.setShopSlot(0, { id: first.id, kind: 'chess', price: 1 }), true);
  assert.equal(ps.shop.slots[0].id, first.id);
  assert.equal(ps.shop.slots[0].basePrice, 1);
  ps.freeze();
  h.toPrep(2);
  assert.equal(ps.shop.slots[0].id, first.id);
  assert.equal(ps.shop.slots[0].basePrice, 1, 'frozen catalog discounts survive the round');
  h.invariants();
  m.dispose();
});

test('normal mode retains randomized shops, finite stock and three-choice discoveries', () => {
  const h = makeMatch({ fake: true }).start().toPrep(), { m } = h, ps = h.ps('p_0');
  assert.equal(m.wizardMode, false);
  assert.equal(ps.shop.slots.length, m.gd.shopSlots(1).chess + m.gd.shopSlots(1).item);
  ps.funds = 100;
  const idx = ps.shop.slots.findIndex((s) => s?.kind === 'chess');
  const id = ps.shop.slots[idx].id, before = m.pool.left(id);
  assert.deepEqual(ps.buy(idx), { ok: true });
  assert.equal(m.pool.left(id), before - 1);
  assert.deepEqual(ps.buy(idx), { error: ERR.SOLD_OUT });
  assert.equal(ps.pushRewardOffer('merge').slots.length, 3);
  h.invariants();
  m.dispose();
});
