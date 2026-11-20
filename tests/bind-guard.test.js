import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createBindGuard } from '../server/bind-guard.js';
import { createBot } from '../server/bot.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';

const SETUP_KEY = 'clave-de-vincular-2026';
const OWNER = -4;
const MINUTE = 60 * 1000;

function setup() {
  let now = Date.parse('2026-11-15T01:10:00Z');
  const sent = [];
  const logs = [];
  const log = (event, detail) => logs.push({ event, ...detail });
  const telegram = { call: async (method, params) => (sent.push({ method, ...params }), { message_id: sent.length }) };
  const service = createService({ store: memoryEventStore(() => new Date(now)), telegram, optionIndex: buildOptionIndex(), venue: VENUE, now: () => now, log });
  const bindGuard = createBindGuard({ setupKey: SETUP_KEY, now: () => now, notify: (alarm) => service.securityAlert(alarm), log });
  const bot = createBot({ service, telegram, venue: VENUE, setupKey: SETUP_KEY, bindGuard, log });
  const command = (chatId, fromId, text) => bot.handleUpdate({ message: { text, chat: { id: chatId, type: 'private' }, message_id: 1, from: { id: fromId, first_name: 'Extraño' } } });
  const toOwner = () => sent.filter((call) => call.method === 'sendMessage' && call.chat_id === OWNER);
  return { service, sent, logs, command, toOwner, advance: (ms) => (now += ms) };
}

test('/vincular con 6 claves mal seguidas frena: la clave buena después no vincula, el dueño recibe un solo aviso y el log dice bind_failed', async () => {
  const { service, sent, logs, command, toOwner } = setup();
  service.bind('owner', OWNER, 'Dueño', 'Nico');
  for (let guess = 0; guess < 6; guess++) await command(777, 777, `/vincular dueno clave-probada-${guess}`);
  await command(777, 777, `/vincular dueno ${SETUP_KEY}`);
  assert.equal(service.state.bindings.owner.chatId, OWNER);
  assert.equal(toOwner().length, 1);
  assert.match(toOwner()[0].text, /SETUP_KEY/);
  assert.doesNotMatch(toOwner()[0].text, /clave-probada|777|Extraño/);
  const failed = logs.filter((entry) => entry.event === 'bind_failed');
  assert.ok(failed.length >= 6);
  assert.deepEqual(failed[0], { event: 'bind_failed', chatId: 777, fromId: 777, role: 'owner', reason: 'key' });
  assert.ok(failed.some((entry) => entry.reason === 'locked'));
  assert.ok(logs.every((entry) => !JSON.stringify(entry).includes('clave-probada') && !JSON.stringify(entry).includes(SETUP_KEY)));
  assert.match(sent.filter((call) => call.method === 'sendMessage' && call.chat_id === 777).at(-1).text, /Demasiados intentos/);
});

test('el freno de /vincular es por cuenta de Telegram y además hay uno total: muchas cuentas no alcanzan para probar claves', async () => {
  const { service, command } = setup();
  for (let account = 0; account < 4; account++) for (let guess = 0; guess < 5; guess++) await command(1000 + account, 1000 + account, `/vincular salon mala-${account}-${guess}`);
  await command(-1, 42, `/vincular salon ${SETUP_KEY}`);
  assert.equal(service.state.bindings.salon, undefined);
});

test('pasada la hora del freno, la clave buena vincula; una cuenta con una clave mal no frena a otra', async () => {
  const { service, command, advance } = setup();
  for (let guess = 0; guess < 5; guess++) await command(777, 777, `/vincular salon mala-${guess}`);
  await command(-1, 42, '/vincular salon mala');
  await command(-1, 42, `/vincular salon ${SETUP_KEY}`);
  assert.equal(service.state.bindings.salon.chatId, -1);
  await command(777, 777, `/vincular dueno ${SETUP_KEY}`);
  assert.equal(service.state.bindings.owner, undefined);
  advance(60 * MINUTE);
  await command(777, 777, `/vincular dueno ${SETUP_KEY}`);
  assert.equal(service.state.bindings.owner.chatId, 777);
});

test('miles de claves mal en /vincular no mandan miles de avisos ni de líneas al log', async () => {
  const { service, logs, command, toOwner } = setup();
  service.bind('owner', OWNER, 'Dueño', 'Nico');
  for (let guess = 0; guess < 500; guess++) await command(5000 + (guess % 50), 5000 + (guess % 50), `/vincular salon mala-${guess}`);
  assert.equal(toOwner().length, 1);
  assert.ok(logs.filter((entry) => entry.event === 'bind_failed').length <= 60);
  assert.equal(service.state.bindings.salon, undefined);
});
