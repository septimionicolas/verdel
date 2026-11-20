import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createService } from '../server/service.js';
import { createStaffLogin } from '../server/staff-login.js';
import { memoryEventStore } from '../server/store.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', setupKey: 'clave-de-vincular-2026' };
const MINUTE = 60 * 1000;

function setup() {
  const clock = { now: Date.parse('2026-11-21T00:04:00Z') };
  const lines = [];
  const telegram = { call: async (method) => (method === 'getChatMember' ? { status: 'member' } : { message_id: 1 }) };
  const store = memoryEventStore(() => new Date(clock.now));
  const service = createService({ store, telegram, optionIndex: buildOptionIndex(), venue: VENUE, now: () => clock.now });
  service.bind('salon', -1, 'salon', 'Septi');
  service.bind('owner', -4, 'owner', 'Septi');
  const staff = createStaffLogin({ service, auth: createAuth({ ...keys, now: () => clock.now }), telegram, timeZone: VENUE.timeZone, now: () => clock.now, botUsername: () => 'verdel_bot', log: (event, detail) => lines.push({ event, ...detail }) });
  const approved = async (name) => {
    const asked = staff.request({ name, pin: keys.pin, origin: 'bar', userAgent: '' });
    await staff.telegramStart(asked.requestId, { id: 7, name: 'Ana Pérez' });
    await staff.telegramAnswer(asked.requestId, { id: 7, name: 'Ana Pérez' }, true);
    return { requestId: asked.requestId, claimSecret: asked.claimSecret };
  };
  return { staff, service, store, clock, lines, approved };
}

test('un ingreso aprobado que el navegador todavía no retiró no aparece como moza adentro', async () => {
  const bar = setup();
  await bar.approved('Ana');
  assert.deepEqual(bar.service.openStaffSessions(), []);
});

test('un ingreso aprobado y nunca retirado vence sin abrir sesión y deja la señal en el registro', async () => {
  const bar = setup();
  const credentials = await bar.approved('Ana');
  bar.clock.now += 4 * MINUTE;
  bar.staff.sweep();
  assert.deepEqual(bar.service.openStaffSessions(), []);
  assert.equal(bar.store.events.some((event) => event.type === 'staff_session_started'), false);
  assert.deepEqual(bar.lines, [{ event: 'staff_login_unclaimed', name: 'Ana', method: 'telegram' }]);
  assert.equal(bar.staff.claim(credentials).error, 'REQUEST_EXPIRED');
});

test('al retirarlo, el navegador recibe un token que sirve y la sesión dura desde ese momento', async () => {
  const bar = setup();
  const credentials = await bar.approved('Ana');
  bar.clock.now += 2 * MINUTE;
  const claimed = bar.staff.claim(credentials);
  assert.equal(bar.staff.verify(claimed.token).name, 'Ana');
  assert.equal(Date.parse(claimed.expiresAt), bar.clock.now + 12 * 60 * MINUTE);
  assert.equal(bar.service.openStaffSessions().length, 1);
});
