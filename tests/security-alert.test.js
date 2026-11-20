import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga' };

function setup({ owner = true, alertsPerHour } = {}) {
  let now = Date.parse('2026-11-15T01:10:00Z');
  const sent = [];
  const logs = [];
  const telegram = { call: async (method, params) => (sent.push({ method, ...params }), { message_id: sent.length }) };
  const service = createService({ store: memoryEventStore(() => new Date(now)), telegram, optionIndex: buildOptionIndex(), venue: VENUE, now: () => now, log: (event, detail) => logs.push({ event, ...detail }), ...(alertsPerHour ? { alertsPerHour } : {}) });
  if (owner) service.bind('owner', -4, 'Dueño', 'Nico');
  return { service, sent, logs, advance: (ms) => (now += ms) };
}

test('el aviso de ingresos fallidos llega al grupo del dueño con cuántos y desde cuántas direcciones, sin el PIN ni la dirección probados', async () => {
  const { service, sent } = setup();
  const alarms = [];
  const auth = createAuth({ ...keys, notify: (alarm) => alarms.push(service.securityAlert(alarm)) });
  for (let origin = 0; origin < 20; origin++) auth.checkPin(`pin-probado-${origin}`, `10.0.0.${origin}`);
  await Promise.all(alarms);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, -4);
  assert.match(sent[0].text, /20 ingresos fallidos/);
  assert.match(sent[0].text, /20 direcciones/);
  assert.match(sent[0].text, /STAFF_PIN/);
  assert.doesNotMatch(sent[0].text, /pin-probado|10\.0\.0/);
});

test('el freno de ingresos avisa que las mozas que ya entraron siguen andando', async () => {
  const { service, sent } = setup();
  await service.securityAlert({ kind: 'frozen', failures: 200, origins: 37, windowMinutes: 60, frozenMinutes: 15 });
  assert.match(sent[0].text, /200 ingresos fallidos/);
  assert.match(sent[0].text, /37 direcciones/);
  assert.match(sent[0].text, /15 minutos/);
  assert.match(sent[0].text, /ya entraron siguen/);
});

test('sin grupo del dueño vinculado el aviso va al log', async () => {
  const { service, sent, logs } = setup({ owner: false });
  await service.securityAlert({ kind: 'attempts', failures: 20, origins: 3, windowMinutes: 10 });
  assert.equal(sent.length, 0);
  assert.deepEqual(logs.find((entry) => entry.event === 'security_alert'), { event: 'security_alert', kind: 'attempts', failures: 20, origins: 3, delivered: false });
});

test('los avisos tienen tope por hora y lo que pasa el tope queda solo en el log', async () => {
  const { service, sent, logs, advance } = setup({ alertsPerHour: 2 });
  for (let alarm = 0; alarm < 5; alarm++) await service.securityAlert({ kind: 'attempts', failures: 20, origins: 1, windowMinutes: 10 });
  assert.equal(sent.length, 2);
  assert.equal(logs.filter((entry) => entry.event === 'security_alert').length, 5);
  advance(60 * 60 * 1000);
  await service.securityAlert({ kind: 'attempts', failures: 20, origins: 1, windowMinutes: 10 });
  assert.equal(sent.length, 3);
});
