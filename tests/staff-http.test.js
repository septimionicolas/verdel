import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createHttpHandler } from '../server/http.js';
import { createService } from '../server/service.js';
import { createStaffLogin } from '../server/staff-login.js';
import { memoryEventStore } from '../server/store.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', setupKey: 'clave-de-vincular-2026' };

async function open({ bind = true } = {}) {
  const now = () => Date.parse('2026-11-21T00:04:00Z');
  const telegram = { call: async (method) => (method === 'getChatMember' ? { status: 'member' } : { message_id: 1 }) };
  const store = memoryEventStore(() => new Date(now()));
  const service = createService({ store, telegram, optionIndex: buildOptionIndex(), venue: VENUE, now });
  if (bind) service.bind('salon', -1, 'Salón', 'Septi');
  const staff = createStaffLogin({ service, auth: createAuth({ ...keys, now }), telegram, timeZone: VENUE.timeZone, now, botUsername: () => 'verdel_bot' });
  const config = { botToken: '', allowedOrigins: [], trustProxy: true };
  const server = createServer(createHttpHandler({ service, staff, config, webDir: fileURLToPath(new URL('../web/', import.meta.url)), ready: true, now }));
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body = {}, token) => {
    const headers = { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36' };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, cache: response.headers.get('cache-control') };
  };
  return { staff, store, post, close: () => server.close() };
}

const pair = (request) => ({ requestId: request.requestId, claimSecret: request.claimSecret });

test('el ingreso por HTTP pasa por pedido, espera, confirmación en Telegram y entrega única del token', async (t) => {
  const bar = await open();
  t.after(bar.close);
  const asked = await bar.post('/api/staff/sessions', { name: 'Ana', pin: keys.pin });
  assert.equal(asked.status, 202);
  assert.equal(asked.cache, 'no-store');
  assert.deepEqual(Object.keys(asked.body).sort(), ['botLink', 'claimSecret', 'emergency', 'expiresAt', 'groupApproval', 'matchCode', 'requestId']);
  assert.deepEqual(await bar.post('/api/staff/sessions/claim', pair(asked.body)), { status: 200, body: { state: 'pending' }, cache: 'no-store' });
  await bar.staff.telegramStart(asked.body.requestId, { id: 7, name: 'Ana Pérez' });
  await bar.staff.telegramAnswer(asked.body.requestId, { id: 7, name: 'Ana Pérez' }, true);
  const claimed = await bar.post('/api/staff/sessions/claim', pair(asked.body));
  assert.equal(claimed.status, 201);
  assert.equal(claimed.body.name, 'Ana');
  assert.equal((await bar.post('/api/staff/sessions/claim', pair(asked.body))).status, 410);
  const order = await bar.post('/api/orders', { code: 'v2.aaaaaaaaaaaaaaaaaaaa.3.no0x1' }, claimed.body.token);
  assert.equal(order.status, 201);
  assert.equal(bar.store.events.find((event) => event.type === 'order_confirmed').sessionId, bar.staff.verify(claimed.body.token).sessionId);
});

test('los errores del ingreso salen con su código HTTP', async (t) => {
  const bar = await open();
  t.after(bar.close);
  assert.deepEqual((await bar.post('/api/staff/sessions', { name: '', pin: keys.pin })).body, { error: 'NAME_REQUIRED' });
  assert.equal((await bar.post('/api/staff/sessions', { name: '', pin: keys.pin })).status, 422);
  assert.equal((await bar.post('/api/staff/sessions', { name: 'Ana', pin: 'mal' })).status, 401);
  const asked = (await bar.post('/api/staff/sessions', { name: 'Ana', pin: keys.pin })).body;
  assert.equal((await bar.post('/api/staff/sessions/claim', { requestId: asked.requestId, claimSecret: 'otro' })).status, 410);
  assert.deepEqual(await bar.post('/api/staff/sessions/ask', pair(asked)), { status: 202, body: { asked: true }, cache: 'no-store' });
  assert.deepEqual((await bar.post('/api/staff/sessions/ask', pair(asked))), { status: 409, body: { error: 'ALREADY_ASKED' }, cache: 'no-store' });
  assert.equal((await bar.post('/api/staff/sessions/emergency', { ...pair(asked), setupKey: 'mala' })).status, 401);
  const entered = await bar.post('/api/staff/sessions/emergency', { ...pair(asked), setupKey: keys.setupKey });
  assert.equal(entered.status, 201);
  assert.equal((await bar.post('/api/staff/sessions/end', {}, entered.body.token)).status, 204);
  assert.deepEqual((await bar.post('/api/orders', { code: 'v2.bbbbbbbbbbbbbbbbbbbb.3.no0x1' }, entered.body.token)).body, { error: 'SESSION_INVALID' });
  assert.equal((await bar.post('/api/staff/sessions/end', {}, entered.body.token)).status, 401);
});

test('sin grupo vinculado el ask da 409 NO_GROUP y no hay link al bot', async (t) => {
  const bar = await open({ bind: false });
  t.after(bar.close);
  const asked = (await bar.post('/api/staff/sessions', { name: 'Ana', pin: keys.pin })).body;
  assert.equal(asked.botLink, null);
  assert.deepEqual((await bar.post('/api/staff/sessions/ask', pair(asked))).body, { error: 'NO_GROUP' });
});

test('un token con el formato de antes ya no confirma pedidos', async (t) => {
  const bar = await open();
  t.after(bar.close);
  const old = 'eyJuYW1lIjoiQ2FybyIsImV4cCI6OTk5OTk5OTk5OTk5OX0.Zmlyb2E';
  assert.deepEqual(await bar.post('/api/orders', { code: 'v2.cccccccccccccccccccc.3.no0x1' }, old), { status: 401, body: { error: 'SESSION_INVALID' }, cache: null });
});
