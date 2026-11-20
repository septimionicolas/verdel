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
const MINUTE = 60 * 1000;

async function open({ limits, authOptions = {} } = {}) {
  const clock = { now: Date.parse('2026-11-15T01:10:00Z') };
  const now = () => clock.now;
  const lines = [];
  const log = (event, detail = {}) => lines.push({ event, ...detail });
  const telegram = { call: async (method) => (method === 'getChatMember' ? { status: 'member' } : { message_id: 1 }) };
  const service = createService({ store: memoryEventStore(() => new Date(clock.now)), telegram, optionIndex: buildOptionIndex(), venue: VENUE, now });
  service.bind('salon', -1, 'Salón', 'Septi');
  const staff = createStaffLogin({ service, auth: createAuth({ ...keys, now, ...authOptions }), telegram, timeZone: VENUE.timeZone, now, botUsername: () => 'verdel_bot' });
  const config = { botToken: '', allowedOrigins: [], trustProxy: true };
  const server = createServer(createHttpHandler({ service, staff, config, webDir: fileURLToPath(new URL('../web/', import.meta.url)), ready: true, now, log, ...(limits ? { limits } : {}) }));
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, from) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'x-forwarded-for': from, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const login = (name, pin, from = '200.1.1.1') => post('/api/staff/sessions', { name, pin }, from);
  const approved = async (name, from = '200.1.1.1') => {
    const asked = await login(name, keys.pin, from);
    await staff.telegramStart(asked.body.requestId, { id: 7, name });
    await staff.telegramAnswer(asked.body.requestId, { id: 7, name }, true);
    return post('/api/staff/sessions/claim', { requestId: asked.body.requestId, claimSecret: asked.body.claimSecret }, from);
  };
  const emergency = async (name, setupKey, from = '200.1.1.1') => {
    const asked = await login(name, keys.pin, from);
    return post('/api/staff/sessions/emergency', { requestId: asked.body.requestId, claimSecret: asked.body.claimSecret, setupKey }, from);
  };
  return { clock, lines, login, approved, emergency, close: () => server.close() };
}

test('cada ingreso queda en el registro con nombre y origen, sin el PIN ni el token', async (t) => {
  const bar = await open({ authOptions: { maxAttempts: 2 } });
  t.after(bar.close);
  const ok = await bar.approved('Caro', '200.1.1.7');
  assert.equal(ok.status, 201);
  await bar.login('Intruso', 'clave-mala-1', '200.9.9.9');
  await bar.login('Intruso', 'clave-mala-2', '200.9.9.9');
  await bar.login('Intruso', 'clave-mala-3', '200.9.9.9');
  assert.deepEqual(bar.lines, [
    { event: 'staff_login', name: 'Caro', origin: '200.1.1.7' },
    { event: 'staff_login_failed', name: 'Intruso', origin: '200.9.9.9', kind: 'pin' },
    { event: 'staff_login_failed', name: 'Intruso', origin: '200.9.9.9', kind: 'pin' },
    { event: 'staff_login_failed', name: 'Intruso', origin: '200.9.9.9', kind: 'locked' },
  ]);
  const written = JSON.stringify(bar.lines);
  assert.doesNotMatch(written, new RegExp(keys.pin));
  assert.doesNotMatch(written, /clave-mala/);
  assert.equal(written.includes(ok.body.token), false);
});

test('el ingreso de emergencia también queda en el registro, y una clave mala sale como key', async (t) => {
  const bar = await open();
  t.after(bar.close);
  assert.equal((await bar.emergency('Septi', 'clave-equivocada', '200.3.3.3')).status, 401);
  const ok = await bar.emergency('Septi', keys.setupKey, '200.3.3.3');
  assert.equal(ok.status, 201);
  assert.deepEqual(bar.lines, [
    { event: 'staff_login_failed', name: null, origin: '200.3.3.3', kind: 'key' },
    { event: 'staff_login', name: 'Septi', origin: '200.3.3.3' },
  ]);
  const written = JSON.stringify(bar.lines);
  assert.doesNotMatch(written, /clave-equivocada/);
  assert.doesNotMatch(written, new RegExp(keys.setupKey));
  assert.equal(written.includes(ok.body.token), false);
});

test('una ráfaga de intentos fallidos no llena el registro ni tapa un ingreso bueno', async (t) => {
  const bar = await open({ limits: { failedLoginLogsPerMinute: 5 }, authOptions: { maxAttempts: 1000, freezeFailures: 1000 } });
  t.after(bar.close);
  for (let attempt = 0; attempt < 20; attempt++) await bar.login('Intruso', `mala-${attempt}`, `200.9.9.${attempt}`);
  assert.equal(bar.lines.length, 5);
  await bar.approved('Caro');
  assert.deepEqual(bar.lines.at(-1), { event: 'staff_login', name: 'Caro', origin: '200.1.1.1' });
  bar.clock.now += MINUTE;
  await bar.login('Intruso', 'mala-otra', '200.9.9.1');
  assert.deepEqual(bar.lines.at(-1), { event: 'staff_login_failed', name: 'Intruso', origin: '200.9.9.1', kind: 'pin' });
});
