import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createService } from '../server/service.js';
import { createStaffLogin } from '../server/staff-login.js';
import { memoryEventStore } from '../server/store.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', setupKey: 'clave-de-vincular-2026' };
const MINUTE = 60 * 1000;

function setup({ getChatMember = async () => ({ status: 'member' }), ...options } = {}) {
  const clock = { now: Date.parse('2026-11-21T00:04:00Z') };
  const sent = [];
  const lines = [];
  const telegram = {
    call: async (method, params) => {
      sent.push({ method, ...params });
      if (method === 'getChatMember') return getChatMember(params);
      return { message_id: sent.length };
    },
  };
  const store = memoryEventStore(() => new Date(clock.now));
  const service = createService({ store, telegram, optionIndex: buildOptionIndex(), venue: VENUE, now: () => clock.now });
  service.bind('salon', -1, 'salon', 'Septi');
  service.bind('owner', -4, 'owner', 'Septi');
  const auth = createAuth({ ...keys, now: () => clock.now });
  const staff = createStaffLogin({ service, auth, telegram, timeZone: VENUE.timeZone, now: () => clock.now, botUsername: () => 'verdel_bot', log: (event, detail) => lines.push({ event, ...detail }), ...options });
  const ask = (name, origin) => staff.request({ name, pin: keys.pin, origin, userAgent: '' });
  const toOwner = () => sent.filter((call) => call.method === 'sendMessage' && call.chat_id === -4).map((call) => call.text);
  return { staff, service, store, clock, lines, ask, toOwner };
}

const credentials = (request) => ({ requestId: request.requestId, claimSecret: request.claimSecret });
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('llenar los pedidos de ingreso pendientes le avisa una sola vez al dueño', async () => {
  const bar = setup();
  for (let index = 0; index < 30; index++) assert.ok(bar.ask(`Moza ${index}`, `origen-${index}`).requestId);
  assert.equal(bar.ask('Caro', 'celular-de-caro').error, 'TOO_MANY_REQUESTS');
  assert.equal(bar.ask('Caro', 'celular-de-caro').error, 'TOO_MANY_REQUESTS');
  await settle();
  const alerts = bar.toOwner().filter((text) => text.includes('pedidos de ingreso pendientes'));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /\/desbloquear/);
});

test('/desbloquear vacía los pedidos pendientes y la moza puede pedir de nuevo', async () => {
  const bar = setup();
  for (let index = 0; index < 30; index++) bar.ask(`Moza ${index}`, `origen-${index}`);
  assert.equal(bar.ask('Caro', 'celular-de-caro').error, 'TOO_MANY_REQUESTS');
  bar.staff.unlock('Septi');
  assert.ok(bar.ask('Caro', 'celular-de-caro').requestId);
});

test('/desbloquear no le saca el ingreso a una moza que ya fue aprobada y todavía no lo retiró', async () => {
  const bar = setup();
  const asked = bar.ask('Ana', 'bar');
  await bar.staff.telegramStart(asked.requestId, { id: 7, name: 'Ana Pérez' });
  await bar.staff.telegramAnswer(asked.requestId, { id: 7, name: 'Ana Pérez' }, true);
  bar.staff.unlock('Septi');
  assert.ok(bar.staff.claim(credentials(asked)).token);
});

test('después de un ataque que vació los pendientes, un nuevo lleno vuelve a avisar', async () => {
  const bar = setup();
  for (let index = 0; index < 30; index++) bar.ask(`Moza ${index}`, `origen-${index}`);
  bar.ask('Caro', 'celular-de-caro');
  bar.clock.now += 4 * MINUTE;
  for (let index = 0; index < 30; index++) bar.ask(`Moza ${index}`, `otro-${index}`);
  bar.ask('Caro', 'celular-de-caro');
  await settle();
  assert.equal(bar.toOwner().filter((text) => text.includes('pedidos de ingreso pendientes')).length, 2);
});
