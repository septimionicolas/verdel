import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createHttpHandler } from '../server/http.js';
import { createLimiter } from '../server/limiter.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';

let nowMs = Date.parse('2026-11-15T01:10:00Z');
const store = memoryEventStore(() => new Date(nowMs));
const service = createService({ store, telegram: null, optionIndex: buildOptionIndex(), venue: VENUE, now: () => nowMs });
const config = { botToken: '', allowedOrigins: [], trustProxy: false };
const server = createServer(createHttpHandler({ service, config, webDir: fileURLToPath(new URL('../web/', import.meta.url)), ready: true, now: () => nowMs }));
let base = '';

const status = async (code, since) => {
  const params = new URLSearchParams({ code });
  if (since) params.set('since', since);
  const response = await fetch(`${base}/api/orders/status?${params}`);
  return { status: response.status, body: await response.json() };
};

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const v2 = (nonce, rest) => `v2.${nonce.padEnd(20, 'a')}.${rest}`;

test('el estado va de esperando a en cocina y a listo, sin datos del pedido', async () => {
  const code = v2('cocina', '7.no1x2-pe0x1-pa2x1');
  const first = await status(code);
  assert.deepEqual(first, { status: 200, body: { state: 'waiting', at: '2026-11-15T01:10:00.000Z' } });

  nowMs += 60 * 1000;
  await service.confirmOrder({ code, staff: 'Caro' });
  const cooking = await status(code);
  assert.deepEqual(cooking.body, { state: 'cooking', number: 1, at: '2026-11-15T01:11:00.000Z' });

  await service.markReady('1-1', 'pizzas', 'Juan');
  assert.equal((await status(code)).body.state, 'cooking');
  await service.charge('1-1', 'Caro');
  await service.markReady('1-1', 'house', 'Marta');
  assert.equal((await status(code)).body.state, 'ready');
});

test('un pedido solo de bebidas queda recibido y uno anulado lo dice', async () => {
  const drinks = v2('bebidas', '0.fe0x2');
  await service.confirmOrder({ code: drinks, staff: 'Caro' });
  assert.deepEqual((await status(drinks)).body, { state: 'received', number: 2, at: '2026-11-15T01:11:00.000Z' });
  await service.voidOrder('1-2', 'Caro');
  assert.equal((await status(drinks)).body.state, 'voided');
});

test('dos rondas iguales con nonce distinto se siguen por separado y since se ignora', async () => {
  const first = v2('rondauno', '3.he0x1');
  const second = v2('rondados', '3.he0x1');
  await service.confirmOrder({ code: first, staff: 'Caro' });
  nowMs += 60 * 1000;
  assert.equal((await status(second)).body.state, 'waiting');
  await service.confirmOrder({ code: second, staff: 'Caro', force: true });
  assert.equal((await status(first)).body.number, 3);
  assert.deepEqual((await status(second, 'no-es-fecha')).body, { state: 'received', number: 4, at: '2026-11-15T01:12:00.000Z' });
  assert.equal((await status(second, '2030-01-01T00:00:00Z')).body.number, 4);
});

test('el nonce de un pedido con otras líneas o en otra mesa no revela el estado', async () => {
  const code = v2('ajeno', '4.no0x1');
  await service.confirmOrder({ code, staff: 'Caro' });
  assert.equal((await status(code)).body.state, 'received');
  assert.deepEqual((await status(v2('ajeno', '4.no0x2'))).body, { state: 'waiting', at: '2026-11-15T01:12:00.000Z' });
  assert.equal((await status(v2('ajeno', '5.no0x1'))).body.state, 'waiting');
});

test('un pedido de una noche cerrada se sigue encontrando por su nonce', async () => {
  const code = v2('nocheanterior', '6.no0x1');
  await service.confirmOrder({ code, staff: 'Caro' });
  const number = (await status(code)).body.number;
  await service.closeNight('Dueño');
  assert.deepEqual((await status(code)).body, { state: 'received', number, at: '2026-11-15T01:12:00.000Z' });
});

test('un código v1 responde unknown y uno que no cumple el patrón es ORDER_CODE_INVALID', async () => {
  assert.deepEqual(await status('v1.7.no1x2-pe0x1'), { status: 200, body: { state: 'unknown', at: '2026-11-15T01:12:00.000Z' } });
  assert.deepEqual(await status('v1.7.<script>'), { status: 422, body: { error: 'ORDER_CODE_INVALID' } });
  assert.deepEqual(await status(v2('roto', '7.<script>')), { status: 422, body: { error: 'ORDER_CODE_INVALID' } });
  assert.equal((await status('')).status, 422);
});

test('pasadas 20 consultas por minuto del mismo nonce responde RATE_LIMITED', async () => {
  nowMs += 60 * 1000;
  for (let index = 0; index < 20; index += 1) assert.equal((await status(v2('topes', '1.no0x1'))).status, 200);
  assert.deepEqual(await status(v2('topes', '1.no0x2')), { status: 429, body: { error: 'RATE_LIMITED' } });
  assert.equal((await status(v2('otrotope', '1.no0x1'))).status, 200);
  nowMs += 60 * 1000;
  assert.equal((await status(v2('topes', '1.no0x1'))).status, 200);
});

test('el límite cuenta por origen y respeta la ventana', () => {
  let now = 0;
  const limiter = createLimiter({ limit: 2, windowMs: 1000, now: () => now, maxKeys: 2 });
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), false);
  assert.equal(limiter.take('b'), true);
  now = 1000;
  assert.equal(limiter.take('c'), true);
  assert.equal(limiter.take('a'), true);
});
