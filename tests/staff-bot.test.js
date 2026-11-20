import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createBot } from '../server/bot.js';
import { createService } from '../server/service.js';
import { createStaffLogin } from '../server/staff-login.js';
import { memoryEventStore } from '../server/store.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', setupKey: 'clave-de-vincular-2026' };
const CHATS = { salon: -1, owner: -4, stranger: -9 };
const MEMBERS = new Set([7, 8]);

function setup() {
  const now = () => Date.parse('2026-11-21T00:04:00Z');
  const sent = [];
  const telegram = {
    call: async (method, params) => {
      sent.push({ method, ...params });
      if (method === 'getChatMember') return { status: MEMBERS.has(params.user_id) ? 'member' : 'left' };
      return { message_id: sent.length };
    },
  };
  const store = memoryEventStore(() => new Date(now()));
  const service = createService({ store, telegram, optionIndex: buildOptionIndex(), venue: VENUE, now });
  service.bind('salon', CHATS.salon, 'Salón', 'Septi');
  service.bind('owner', CHATS.owner, 'Dueño', 'Nico');
  const staff = createStaffLogin({ service, auth: createAuth({ ...keys, now }), telegram, timeZone: VENUE.timeZone, now, botUsername: () => 'verdel_bot' });
  const bot = createBot({ service, telegram, venue: VENUE, setupKey: keys.setupKey, staff, now });
  let update = 0;
  const privateStart = (userId, requestId) => bot.handleUpdate({ update_id: ++update, message: { message_id: update, chat: { id: userId, type: 'private' }, from: { id: userId, first_name: 'Ana' }, text: `/start in_${requestId}` } });
  const command = (chatId, text) => bot.handleUpdate({ update_id: ++update, message: { message_id: update, chat: { id: chatId, type: 'supergroup', title: 'Grupo' }, from: { id: 8, first_name: 'Septi' }, text } });
  const tap = (chatId, data, from = { id: 8, first_name: 'Septi' }, type = 'supergroup') => bot.handleUpdate({ update_id: ++update, callback_query: { id: `q${update}`, data, from, message: { message_id: 99, chat: { id: chatId, type } } } });
  const ask = () => staff.request({ name: 'Ana', pin: keys.pin, origin: 'bar', userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36' });
  const pair = (request) => ({ requestId: request.requestId, claimSecret: request.claimSecret });
  const last = (method) => sent.filter((call) => call.method === method).at(-1);
  return { service, staff, store, sent, privateStart, command, tap, ask, pair, last };
}

async function signIn(bar, userId = 7) {
  const request = bar.ask();
  await bar.privateStart(userId, request.requestId);
  await bar.tap(userId, `staffme:${request.requestId}`, { id: userId, first_name: 'Ana' }, 'private');
  return bar.staff.claim(bar.pair(request));
}

test('/start in_ de alguien del salón y «Sí, soy yo» entregan el token una sola vez', async () => {
  const bar = setup();
  const request = bar.ask();
  await bar.privateStart(7, request.requestId);
  assert.match(bar.last('sendMessage').text, /Sos vos la que está ingresando como «Ana»/);
  assert.deepEqual(bar.last('sendMessage').reply_markup.inline_keyboard[0].map((button) => button.callback_data), [`staffme:${request.requestId}`, `staffnotme:${request.requestId}`]);
  assert.deepEqual(bar.staff.claim(bar.pair(request)), { state: 'pending' });
  await bar.tap(7, `staffme:${request.requestId}`, { id: 7, first_name: 'Ana' }, 'private');
  assert.match(bar.last('editMessageText').text, /Volvé al navegador/);
  const claimed = bar.staff.claim(bar.pair(request));
  assert.ok(claimed.token);
  assert.ok(bar.staff.verify(claimed.token));
  assert.equal(bar.staff.claim(bar.pair(request)).error, 'REQUEST_EXPIRED');
});

test('/start in_ en un grupo muestra la ayuda y no toca el ingreso', async () => {
  const bar = setup();
  const request = bar.ask();
  await bar.command(CHATS.salon, `/start in_${request.requestId}`);
  assert.match(bar.last('sendMessage').text, /Cómo se usa/);
  assert.equal(bar.sent.some((call) => call.method === 'getChatMember'), false);
});

test('/start de alguien que no está en ningún grupo no crea sesión y se lo dice', async () => {
  const bar = setup();
  const request = bar.ask();
  await bar.privateStart(66, request.requestId);
  assert.match(bar.last('sendMessage').text, /No te encuentro en el grupo/);
  await bar.tap(66, `staffme:${request.requestId}`, { id: 66, first_name: 'Intrusa' }, 'private');
  assert.deepEqual(bar.staff.claim(bar.pair(request)), { state: 'pending' });
  assert.equal(bar.store.events.some((event) => event.type === 'staff_session_started'), false);
});

test('«No fui yo» rechaza el pedido y le avisa al dueño', async () => {
  const bar = setup();
  const request = bar.ask();
  await bar.privateStart(7, request.requestId);
  await bar.tap(7, `staffnotme:${request.requestId}`, { id: 7, first_name: 'Ana' }, 'private');
  assert.equal(bar.staff.claim(bar.pair(request)).error, 'REQUEST_DENIED');
  assert.ok(bar.sent.some((call) => call.method === 'sendMessage' && call.chat_id === CHATS.owner && /dijo que no fue ella/.test(call.text)));
  assert.equal(bar.store.events.find((event) => event.type === 'staff_login_denied').reason, 'not_me');
});

test('el pedido al grupo sale una vez, [Aprobar] desde un chat ajeno no hace nada y desde el dueño sí', async () => {
  const bar = setup();
  const request = bar.ask();
  assert.deepEqual(await bar.staff.ask(bar.pair(request)), { asked: true });
  assert.equal((await bar.staff.ask(bar.pair(request))).error, 'ALREADY_ASKED');
  const posted = bar.sent.filter((call) => call.method === 'sendMessage' && call.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === `staffok:${request.requestId}`);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].chat_id, CHATS.salon);
  await bar.tap(CHATS.stranger, `staffok:${request.requestId}`);
  assert.deepEqual(bar.staff.claim(bar.pair(request)), { state: 'pending' });
  await bar.tap(CHATS.owner, `staffok:${request.requestId}`);
  assert.ok(bar.staff.claim(bar.pair(request)).token);
  assert.equal(bar.store.events.find((event) => event.type === 'staff_session_started').approvedBy, 'Septi');
});

test('/mozas lista las sesiones, [Cerrar] corta una y [Cerrar todas] con confirmación corta el resto', async () => {
  const bar = setup();
  const first = await signIn(bar, 7);
  const second = await signIn(bar, 8);
  await bar.command(CHATS.salon, '/mozas');
  const list = bar.last('sendMessage');
  assert.match(list.text, /Ana · desde 21:04 · Telegram/);
  const ends = list.reply_markup.inline_keyboard.flat().map((button) => button.callback_data);
  assert.equal(ends.at(-1), 'staffendall:1');
  await bar.tap(CHATS.salon, ends[0]);
  assert.equal(bar.staff.verify(first.token), null);
  assert.ok(bar.staff.verify(second.token));
  await bar.tap(CHATS.stranger, 'staffendallyes:1');
  assert.ok(bar.staff.verify(second.token));
  await bar.tap(CHATS.salon, 'staffendall:1');
  assert.deepEqual(bar.last('editMessageText').reply_markup.inline_keyboard[0].map((button) => button.callback_data), ['staffendallyes:1', 'staffendallno:1']);
  await bar.tap(CHATS.salon, 'staffendallno:1');
  assert.ok(bar.staff.verify(second.token));
  await bar.tap(CHATS.owner, 'staffendallyes:1');
  assert.equal(bar.staff.verify(second.token), null);
  assert.equal(bar.store.events.find((event) => event.type === 'staff_session_ended').reason, 'revoked');
});

test('/desbloquear en el dueño levanta el bloqueo del origen y en el salón no hace nada', async () => {
  const bar = setup();
  for (let attempt = 0; attempt < 5; attempt++) bar.staff.request({ name: 'Ana', pin: 'mal', origin: 'bar' });
  assert.equal(bar.ask().error, 'LOCKED');
  await bar.command(CHATS.salon, '/desbloquear');
  assert.equal(bar.ask().error, 'LOCKED');
  assert.equal(bar.store.events.some((event) => event.type === 'login_unlocked'), false);
  await bar.command(CHATS.owner, '/desbloquear');
  assert.ok(bar.ask().requestId);
  assert.equal(bar.store.events.find((event) => event.type === 'login_unlocked').by, 'Septi');
});

test('la ayuda nombra /mozas y /desbloquear', async () => {
  const bar = setup();
  await bar.command(CHATS.salon, '/ayuda');
  assert.match(bar.last('sendMessage').text, /\/mozas/);
  assert.match(bar.last('sendMessage').text, /\/desbloquear/);
});
