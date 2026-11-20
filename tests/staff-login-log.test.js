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
  const lines = [];
  const log = (event, detail = {}) => lines.push({ event, ...detail });
  const service = createService({ store: memoryEventStore(() => new Date(clock.now)), telegram: null, optionIndex: buildOptionIndex(), venue: VENUE, now });
  const auth = createAuth({ ...keys, now, ...authOptions });
  const config = { botToken: '', allowedOrigins: [], trustProxy: true };
  const server = createServer(createHttpHandler({ service, auth, config, webDir: fileURLToPath(new URL('../web/', import.meta.url)), ready: true, now, log, ...(limits ? { limits } : {}) }));
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (name, pin, from = '200.1.1.1') => {
    const response = await fetch(`${base}/api/staff/sessions`, { method: 'POST', headers: { 'x-forwarded-for': from, 'content-type': 'application/json' }, body: JSON.stringify({ name, pin }) });
    return { status: response.status, body: await response.json() };
  };
  return { clock, lines, login, close: () => server.close() };
}

test('cada ingreso queda en el registro con nombre y origen, sin el PIN ni el token', async (t) => {
  const bar = await open({ authOptions: { maxAttempts: 2 } });
  t.after(bar.close);
  const ok = await bar.login('Caro', keys.pin, '200.1.1.7');
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

test('una ráfaga de intentos fallidos no llena el registro ni tapa un ingreso bueno', async (t) => {
  const bar = await open({ limits: { failedLoginLogsPerMinute: 5 }, authOptions: { maxAttempts: 1000, freezeFailures: 1000 } });
  t.after(bar.close);
  for (let attempt = 0; attempt < 20; attempt++) await bar.login('Intruso', `mala-${attempt}`, `200.9.9.${attempt}`);
  assert.equal(bar.lines.length, 5);
  await bar.login('Caro', keys.pin);
  assert.deepEqual(bar.lines.at(-1), { event: 'staff_login', name: 'Caro', origin: '200.1.1.1' });
  bar.clock.now += MINUTE;
  await bar.login('Intruso', 'mala-otra', '200.9.9.1');
  assert.deepEqual(bar.lines.at(-1), { event: 'staff_login_failed', name: 'Intruso', origin: '200.9.9.1', kind: 'pin' });
});
