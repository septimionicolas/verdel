import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createHttpHandler } from '../server/http.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga' };
const MINUTE = 60 * 1000;

async function open({ limits, authOptions = {} } = {}) {
  const clock = { now: Date.parse('2026-11-15T01:10:00Z') };
  const now = () => clock.now;
  const service = createService({ store: memoryEventStore(() => new Date(clock.now)), telegram: null, optionIndex: buildOptionIndex(), venue: VENUE, now });
  const auth = createAuth({ ...keys, now, ...authOptions });
  const config = { botToken: '', allowedOrigins: [], trustProxy: true };
  const server = createServer(createHttpHandler({ service, auth, config, webDir: fileURLToPath(new URL('../web/', import.meta.url)), ready: true, now, ...(limits ? { limits } : {}) }));
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { from = '200.1.1.1', method = 'GET', body, token } = {}) => {
    const headers = { 'x-forwarded-for': from, 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, text: await response.text() };
  };
  const login = (name, pin, from) => call('/api/staff/sessions', { method: 'POST', body: { name, pin }, from });
  return { clock, call, login, close: () => server.close() };
}

test('treinta celulares detrás de la misma dirección siguen su pedido diez minutos sin que los frene', async (t) => {
  const bar = await open();
  t.after(bar.close);
  const statuses = new Set();
  for (let minute = 0; minute < 10; minute++) {
    for (let poll = 0; poll < 12; poll++) {
      const round = await Promise.all(Array.from({ length: 30 }, (_, phone) => bar.call(`/api/orders/status?code=v1.${phone + 1}.no0x1`)));
      for (const answer of round) statuses.add(answer.status);
    }
    bar.clock.now += MINUTE;
  }
  assert.deepEqual([...statuses], [200]);
});

test('un mismo código consultado más de lo que pregunta un celular se frena, y los otros códigos de esa dirección siguen', async (t) => {
  const bar = await open();
  t.after(bar.close);
  for (let poll = 0; poll < 30; poll++) assert.equal((await bar.call('/api/orders/status?code=v1.1.no0x1')).status, 200);
  assert.deepEqual(await bar.call('/api/orders/status?code=v1.1.no0x1'), { status: 429, text: '{"error":"RATE_LIMITED"}' });
  assert.equal((await bar.call('/api/orders/status?code=v1.2.no0x1')).status, 200);
  assert.equal((await bar.call('/api/orders/status?code=v1.1.no0x1', { from: '200.9.9.9' })).status, 200);
  bar.clock.now += MINUTE;
  assert.equal((await bar.call('/api/orders/status?code=v1.1.no0x1')).status, 200);
});

test('las consultas de estado de una dirección tienen un techo para todo el bar', async (t) => {
  const bar = await open({ limits: { statusPerOrigin: 3 } });
  t.after(bar.close);
  for (let table = 1; table <= 3; table++) assert.equal((await bar.call(`/api/orders/status?code=v1.${table}.no0x1`)).status, 200);
  assert.equal((await bar.call('/api/orders/status?code=v1.4.no0x1')).status, 429);
  assert.equal((await bar.call('/api/orders/status?code=v1.4.no0x1', { from: '200.9.9.9' })).status, 200);
});

test('cada ingreso manda hasta 30 pedidos por minuto y otra moza en la misma dirección sigue', async (t) => {
  const bar = await open();
  t.after(bar.close);
  const caro = JSON.parse((await bar.login('Caro', keys.pin)).text).token;
  const marta = JSON.parse((await bar.login('Marta', keys.pin)).text).token;
  for (let order = 0; order < 30; order++) assert.notEqual((await bar.call('/api/orders', { method: 'POST', token: caro, body: { code: `v1.${(order % 30) + 1}.no0x${(order % 9) + 1}` } })).status, 429);
  assert.deepEqual(await bar.call('/api/orders', { method: 'POST', token: caro, body: { code: 'v1.1.pe0x1' } }), { status: 429, text: '{"error":"RATE_LIMITED"}' });
  assert.equal((await bar.call('/api/orders', { method: 'POST', token: marta, body: { code: 'v1.1.pe0x1' } })).status, 201);
  bar.clock.now += MINUTE;
  assert.equal((await bar.call('/api/orders', { method: 'POST', token: caro, body: { code: 'v1.2.pe0x1' } })).status, 201);
});

test('el mismo código se puede enviar igual hasta tres veces en diez minutos', async (t) => {
  const bar = await open();
  t.after(bar.close);
  const token = JSON.parse((await bar.login('Caro', keys.pin)).text).token;
  const resend = () => bar.call('/api/orders', { method: 'POST', token, body: { code: 'v1.5.no0x1', force: true } });
  assert.equal((await bar.call('/api/orders', { method: 'POST', token, body: { code: 'v1.5.no0x1' } })).status, 201);
  for (let time = 0; time < 3; time++) assert.equal((await resend()).status, 201);
  assert.deepEqual(await resend(), { status: 429, text: '{"error":"RATE_LIMITED"}' });
  assert.equal((await bar.call('/api/orders', { method: 'POST', token, body: { code: 'v1.6.no0x1' } })).status, 201);
  bar.clock.now += 10 * MINUTE;
  assert.equal((await resend()).status, 201);
});

test('una dirección que pide de a miles se frena en la API y en los archivos, y las demás no', async (t) => {
  const bar = await open({ limits: { apiPerOrigin: 3, staticPerOrigin: 3 } });
  t.after(bar.close);
  for (let hit = 0; hit < 3; hit++) assert.equal((await bar.call('/api/health')).status, 200);
  assert.deepEqual(await bar.call('/api/health'), { status: 429, text: '{"error":"RATE_LIMITED"}' });
  for (let hit = 0; hit < 3; hit++) assert.equal((await bar.call('/index.html')).status, 200);
  assert.equal((await bar.call('/styles.css')).status, 429);
  assert.equal((await bar.call('/index.html', { from: '200.9.9.9' })).status, 200);
  bar.clock.now += MINUTE;
  assert.equal((await bar.call('/api/health')).status, 200);
});

test('los topes generales de fábrica alcanzan para que treinta mesas abran la carta a la vez', async (t) => {
  const bar = await open();
  t.after(bar.close);
  const files = ['/', '/styles.css', '/config.js', '/app.js', '/menu.js', '/order-code.js', '/device.js'];
  const answers = await Promise.all(Array.from({ length: 90 }, () => files.map((file) => bar.call(file))).flat());
  assert.ok(answers.every((answer) => answer.status !== 429));
});

test('ninguna respuesta del ingreso dice si falló el nombre, la clave o un bloqueo ajeno', async (t) => {
  const bar = await open({ authOptions: { freezeFailures: 12, freezeOrigins: 12 } });
  t.after(bar.close);
  const wrong = [await bar.login('Caro', '0000', '10.0.0.1'), await bar.login('Nadie Conocido', 'birra-fria-25', '10.0.0.2')];
  assert.deepEqual(wrong[0], wrong[1]);
  assert.deepEqual(wrong[0], { status: 401, text: '{"error":"PIN_INVALID"}' });
  for (let attempt = 0; attempt < 4; attempt++) await bar.login('Caro', '0000', '10.0.0.1');
  const ownLock = await bar.login('Caro', '0000', '10.0.0.1');
  const neighbourLock = await bar.login('Marta', keys.pin, '10.0.0.1');
  for (let origin = 3; origin < 15; origin++) await bar.login('Juan', '0000', `10.0.0.${origin}`);
  const frozen = await bar.login('Marta', keys.pin, '10.0.0.200');
  assert.deepEqual(ownLock, { status: 429, text: '{"error":"LOCKED"}' });
  assert.deepEqual(neighbourLock, ownLock);
  assert.deepEqual(frozen, ownLock);
});

test('un celular que inunda una ruta de la API no frena los pedidos de las mozas ni las otras rutas desde el mismo wifi', async (t) => {
  const bar = await open({ limits: { apiPerOrigin: 3 } });
  t.after(bar.close);
  const token = JSON.parse((await bar.login('Caro', keys.pin)).text).token;
  for (let hit = 0; hit < 3; hit++) await bar.call('/api/health');
  assert.equal((await bar.call('/api/health')).status, 429);
  assert.equal((await bar.call('/api/orders', { method: 'POST', token, body: { code: 'v1.5.no0x1' } })).status, 201);
  assert.equal((await bar.call('/api/orders/status?code=v1.5.no0x1')).status, 200);
});

test('los pedidos sin un ingreso válido sí cuentan para el tope por origen', async (t) => {
  const bar = await open({ limits: { apiPerOrigin: 3 } });
  t.after(bar.close);
  for (let hit = 0; hit < 3; hit++) assert.equal((await bar.call('/api/orders', { method: 'POST', token: 'falso', body: { code: 'v1.5.no0x1' } })).status, 401);
  assert.equal((await bar.call('/api/orders', { method: 'POST', token: 'falso', body: { code: 'v1.5.no0x1' } })).status, 429);
});

test('rutas inventadas de la API comparten un solo tope por origen', async (t) => {
  const bar = await open({ limits: { apiPerOrigin: 3 } });
  t.after(bar.close);
  for (let hit = 0; hit < 3; hit++) assert.equal((await bar.call(`/api/nada-${hit}`, { method: 'POST' })).status, 404);
  assert.equal((await bar.call('/api/nada-9', { method: 'POST' })).status, 429);
});

test('con el tope de pedidos de una dirección lleno de tokens falsos, la moza con ingreso válido desde el mismo wifi sigue confirmando', async (t) => {
  const bar = await open({ limits: { apiPerOrigin: 3 } });
  t.after(bar.close);
  const token = JSON.parse((await bar.login('Caro', keys.pin)).text).token;
  for (let hit = 0; hit < 3; hit++) assert.equal((await bar.call('/api/orders', { method: 'POST', token: 'falso', body: { code: 'v1.5.no0x1' } })).status, 401);
  assert.equal((await bar.call('/api/orders', { method: 'POST', token: 'falso', body: { code: 'v1.5.no0x1' } })).status, 429);
  assert.equal((await bar.call('/api/orders', { method: 'POST', token, body: { code: 'v1.5.no0x1' } })).status, 201);
  assert.equal((await bar.call('/api/orders', { method: 'POST', token, body: { code: 'v1.6.no0x1' } })).status, 201);
});
