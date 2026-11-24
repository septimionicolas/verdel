import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createDailyReport, createVisits, reportWindow } from '../server/daily.js';
import { createHttpHandler } from '../server/http.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';

const TZ = VENUE.timeZone;
// Tucumán is UTC-3: 06:00 local on Tuesday 24/11 is 09:00 UTC.
const TUESDAY_0610 = Date.parse('2026-11-24T09:10:00Z');
const dir = () => mkdtempSync(join(tmpdir(), 'verdel-daily-'));
const order = (confirmedAt, status, table, totalCents) => ({ confirmedAt, status, table, totalCents, lines: [] });

function fakeService({ bound = true, fail = false } = {}) {
  const sent = [];
  return {
    sent,
    state: {
      bindings: bound ? { socios: { chatId: -1 } } : {},
      nights: [
        { number: 1, orders: [
          order('2026-11-23T08:59:00Z', 'charged', 3, 999900), // lunes 05:59: día anterior
          order('2026-11-23T09:00:00Z', 'charged', 3, 100000), // lunes 06:00: entra
          order('2026-11-23T23:00:00Z', 'voided', 4, 500000),
        ] },
        { number: 2, orders: [
          order('2026-11-24T01:00:00Z', 'charged', 3, 50000), // misma mesa, otra noche: cuenta aparte
          order('2026-11-24T08:59:00Z', 'open', 7, 9450000), // martes 05:59: entra sin /cerrar
          order('2026-11-24T09:00:00Z', 'open', 7, 777700), // martes 06:00: queda para mañana
        ] },
      ],
    },
    async send(role, text) {
      if (fail) return null;
      sent.push({ role, text });
      return { ok: true };
    },
  };
}

const visitsStub = { count: (day) => (day === '2026-11-23' ? 312 : 0) };

test('la ventana va de 06:00 del día anterior a 06:00 de hoy, hora de Tucumán', () => {
  const { from, to, sendDate } = reportWindow(TUESDAY_0610, TZ);
  assert.equal(new Date(from).toISOString(), '2026-11-23T09:00:00.000Z');
  assert.equal(new Date(to).toISOString(), '2026-11-24T09:00:00.000Z');
  assert.equal(sendDate, '2026-11-24');
});

test('el reporte cuenta pedidos sin cerrar, saca los anulados y respeta el formato', async () => {
  const service = fakeService();
  const report = createDailyReport({ service, visits: visitsStub, venue: VENUE, file: join(dir(), 'daily.json'), now: () => TUESDAY_0610 });
  await report.tick();
  assert.equal(service.sent.length, 1);
  assert.equal(service.sent[0].role, 'socios');
  assert.equal(service.sent[0].text, [
    '📊 <b>Verdel</b> · martes 24/11',
    '(de 06:00 del lunes a 06:00 del martes)',
    '',
    'Visitas a la carta: 312 (personas distintas)',
    'Mesas atendidas: 3',
    'Pedidos: 3',
    'Ventas totales: $96.000',
    '  Cobrado: $1.500 · Sin cobrar: $94.500',
  ].join('\n'));
});

test('no manda dos veces el mismo día aunque el servidor se reinicie', async () => {
  const file = join(dir(), 'daily.json');
  const service = fakeService();
  await createDailyReport({ service, visits: visitsStub, venue: VENUE, file, now: () => TUESDAY_0610 }).tick();
  await createDailyReport({ service, visits: visitsStub, venue: VENUE, file, now: () => TUESDAY_0610 + 60000 }).tick();
  assert.equal(service.sent.length, 1);
});

test('no manda antes de las 06:00, después del mediodía ni sin grupo de socios', async () => {
  for (const [ms, bound] of [[Date.parse('2026-11-24T08:59:00Z'), true], [Date.parse('2026-11-24T15:00:00Z'), true], [TUESDAY_0610, false]]) {
    const service = fakeService({ bound });
    await createDailyReport({ service, visits: visitsStub, venue: VENUE, file: join(dir(), 'daily.json'), now: () => ms }).tick();
    assert.equal(service.sent.length, 0, new Date(ms).toISOString());
  }
});

test('si Telegram falla, reintenta en el próximo minuto', async () => {
  const file = join(dir(), 'daily.json');
  const broken = fakeService({ fail: true });
  await createDailyReport({ service: broken, visits: visitsStub, venue: VENUE, file, now: () => TUESDAY_0610 }).tick();
  const service = fakeService();
  await createDailyReport({ service, visits: visitsStub, venue: VENUE, file, now: () => TUESDAY_0610 + 60000 }).tick();
  assert.equal(service.sent.length, 1);
});

test('las visitas cuentan teléfonos distintos por día con una cookie anónima', async () => {
  let clock = Date.parse('2026-11-24T00:00:00Z'); // lunes 21:00 en Tucumán
  const file = join(dir(), 'visits.json');
  const visits = createVisits({ file, timeZone: TZ, now: () => clock });
  const service = createService({ store: memoryEventStore(), telegram: null, optionIndex: buildOptionIndex(), venue: VENUE });
  const auth = createAuth({ pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga' });
  const webDir = fileURLToPath(new URL('../web/', import.meta.url));
  const server = createServer(createHttpHandler({ service, auth, config: { botToken: '', allowedOrigins: [], trustProxy: false }, webDir, ready: true, visits }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const phone = { 'user-agent': 'Mozilla/5.0 (iPhone)' };
  try {
    const first = await fetch(`${base}/`, { headers: phone });
    const cookie = first.headers.get('set-cookie');
    assert.match(cookie, /^vd=[A-Za-z0-9_-]{22}; Max-Age=31536000; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
    const id = cookie.split(';')[0];
    const again = await fetch(`${base}/index.html`, { headers: { ...phone, cookie: id } });
    assert.equal(again.headers.get('set-cookie'), null);
    await fetch(`${base}/`, { headers: phone }); // otro teléfono
    await fetch(`${base}/`, { headers: { 'user-agent': 'curl/8' } }); // no es un navegador
    await fetch(`${base}/app.js`, { headers: phone }); // no es la carta
    assert.equal(visits.count('2026-11-23'), 2);

    clock = Date.parse('2026-11-24T10:00:00Z'); // martes 07:00: día nuevo, el mismo teléfono vuelve a contar
    await fetch(`${base}/`, { headers: { ...phone, cookie: id } });
    assert.equal(visits.count('2026-11-24'), 1);
    assert.equal(createVisits({ file, timeZone: TZ, now: () => clock }).count('2026-11-23'), 2);
  } finally {
    server.close();
  }
});
