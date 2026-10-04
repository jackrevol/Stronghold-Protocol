import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { roomPolicy } from '../server/room-policy.js';
import { TestClient } from './helpers/wsClient.js';

const key = 'owner-test-key-'.repeat(4);
const create = (ownerKey, mode = 'coop') => ({ t: 'room.create', mode, difficulty: 'FUNNY', ...(ownerKey === undefined ? {} : { ownerKey }) });

test('policy fails closed on invalid configuration; public and disabled are explicit', () => {
  assert.equal(roomPolicy({}).allows(), true);
  assert.equal(roomPolicy({ SP_ROOM_CREATION: 'disabled' }).allows(key), false);
  for (const env of [
    { SP_ROOM_CREATION: 'typo' },
    { SP_ROOM_CREATION: 'owner' },
    { SP_ROOM_CREATION: 'owner', SP_OWNER_KEY: 'short' },
    { SP_ROOM_CREATION: 'owner', SP_OWNER_KEY: ' '.repeat(32) },
    { SP_ROOM_CREATION: 'owner', SP_OWNER_KEY: 'x'.repeat(257) },
  ]) assert.throws(() => roomPolicy(env));
  const policy = roomPolicy({ SP_ROOM_CREATION: 'owner', SP_OWNER_KEY: key });
  for (const bad of [undefined, null, {}, 'wrong', key + 'x']) assert.equal(policy.allows(bad), false);
  assert.equal(policy.allows(key), true);
  assert.ok(!JSON.stringify(policy).includes(key));
});

test('real sockets: owner-only creation cannot be bypassed; guests join without the key', async (t) => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true,
    creationPolicy: roomPolicy({ SP_ROOM_CREATION: 'owner', SP_OWNER_KEY: key }) });
  const clients = [];
  t.after(async () => { for (const c of clients) await c.terminate(); await srv.close(); });
  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    clients.push(c);
    const welcome = await c.hello(name);
    assert.equal(welcome.roomCreation, 'owner');
    assert.ok(!JSON.stringify(welcome).includes(key));
    return c;
  };
  const owner = await player('Owner');
  const guest = await player('Guest');
  for (const mode of ['solo', 'coop']) {
    assert.equal((await guest.request(create(undefined, mode))).code, 'ROOM_CREATION_DENIED');
    assert.equal((await guest.request(create('wrong', mode))).code, 'ROOM_CREATION_DENIED');
  }
  assert.equal(srv.lobby.rooms.size, 0);
  assert.equal((await owner.request(create(key))).t, 'ok');
  const state = await owner.waitFor('room.state');
  assert.equal((await guest.request({ t: 'room.join', code: state.code })).t, 'ok');
  assert.equal((await guest.request(create())).code, 'ROOM_CREATION_DENIED');
  assert.equal(srv.lobby.getRoom(state.code).activeHumans().length, 2, 'denial must not leave the current room');
  assert.equal((await owner.request(create())).code, 'ROOM_CREATION_DENIED', 'room host is not server owner authorization');
  assert.equal((await owner.request(create({ secret: key }))).code, 'BAD_MSG');
  assert.equal((await owner.request(create(key, 'solo'))).t, 'ok');
  for (const c of clients) assert.ok(!JSON.stringify(c.log).includes(key), 'key must not be echoed in frames');
});

test('disabled mode rejects creation even with a valid-looking key', async (t) => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true,
    creationPolicy: roomPolicy({ SP_ROOM_CREATION: 'disabled' }) });
  const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
  t.after(async () => { await c.terminate(); await srv.close(); });
  assert.equal((await c.hello('Guest')).roomCreation, 'disabled');
  assert.equal((await c.request(create(key))).code, 'ROOM_CREATION_DENIED');
  assert.equal(srv.lobby.rooms.size, 0);
});

test('Vercel assembly exports an unbound server that can accept runtime-owned HTTP and WebSocket connections', async (t) => {
  const srv = await startServer({ listen: false, quiet: true, creationPolicy: roomPolicy({}) });
  assert.equal(srv.server.listening, false);
  await new Promise((resolve) => srv.server.listen(0, '127.0.0.1', resolve));
  const port = srv.server.address().port;
  const c = await TestClient.connect(`ws://127.0.0.1:${port}/api/server`);
  t.after(async () => { await c.terminate(); await srv.close(); });
  assert.equal((await c.hello('Runtime')).roomCreation, 'public');
  assert.equal((await c.request(create())).t, 'ok');
  for (const route of ['/healthz', '/api/server']) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).rooms, 1);
  }
});
