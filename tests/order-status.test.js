import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createHttpHandler } from '../server/http.js';
import { createLimiter } from '../server/limiter.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';

let nowMs = Date.parse('2026-11-15T01:10:00Z');
const store = memoryEventStore(() => new Date(nowMs));
const service = createService({ store, telegram: null, optionIndex: buildOptionIndex(), venue: VENUE, now: () => nowMs });
const auth = createAuth({ pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', now: () => nowMs });
const config = { botToken: '', allowedOrigins: [], trustProxy: false };
const server = createServer(createHttpHandler({ service, auth, config, webDir: fileURLToPath(new URL('../web/', import.meta.url)), ready: true, now: () => nowMs }));
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

test('el estado va de esperando a en cocina y a listo, sin datos del pedido', async () => {
  const code = 'v1.7.no1x2-pe0x1-pa2x1';
  const first = await status(code);
  assert.deepEqual(first, { status: 200, body: { state: 'waiting', at: '2026-11-15T01:10:00.000Z' } });

  nowMs += 60 * 1000;
  await service.confirmOrder({ code, staff: 'Caro' });
  const cooking = await status(code, first.body.at);
  assert.deepEqual(cooking.body, { state: 'cooking', number: 1, at: '2026-11-15T01:11:00.000Z' });

  await service.markReady('1-1', 'pizzas', 'Juan');
  assert.equal((await status(code, first.body.at)).body.state, 'cooking');
  await service.charge('1-1', 'Caro');
  await service.markReady('1-1', 'house', 'Marta');
  assert.equal((await status(code, first.body.at)).body.state, 'ready');
});

test('un pedido solo de bebidas queda recibido y uno anulado lo dice', async () => {
  const drinks = 'v1.0.fe0x2';
  await service.confirmOrder({ code: drinks, staff: 'Caro' });
  assert.deepEqual((await status(drinks)).body, { state: 'received', number: 2, at: '2026-11-15T01:11:00.000Z' });
  await service.voidOrder('1-2', 'Caro');
  assert.equal((await status(drinks)).body.state, 'voided');
});

test('since descarta un pedido igual confirmado antes y toma el más reciente', async () => {
  const code = 'v1.3.he0x1';
  await service.confirmOrder({ code, staff: 'Caro' });
  nowMs += 60 * 1000;
  const since = (await status(code, new Date(nowMs).toISOString())).body;
  assert.equal(since.state, 'waiting');
  nowMs += 60 * 1000;
  await service.confirmOrder({ code, staff: 'Caro', force: true });
  assert.deepEqual((await status(code, since.at)).body, { state: 'received', number: 4, at: '2026-11-15T01:13:00.000Z' });
  assert.equal((await status(code)).body.number, 4);
  assert.equal((await status(code, 'no-es-fecha')).body.number, 4);
});

test('un código que no cumple el patrón es ORDER_CODE_INVALID', async () => {
  assert.deepEqual(await status('v1.7.<script>'), { status: 422, body: { error: 'ORDER_CODE_INVALID' } });
  assert.equal((await status('')).status, 422);
});

test('pasadas 40 consultas por minuto desde el mismo origen responde RATE_LIMITED', async () => {
  nowMs += 60 * 1000;
  for (let index = 0; index < 40; index += 1) assert.equal((await status('v1.1.no0x1')).status, 200);
  assert.deepEqual(await status('v1.1.no0x1'), { status: 429, body: { error: 'RATE_LIMITED' } });
  nowMs += 60 * 1000;
  assert.equal((await status('v1.1.no0x1')).status, 200);
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
