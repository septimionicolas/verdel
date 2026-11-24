import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createBot } from '../server/bot.js';
import { createService } from '../server/service.js';
import { createStaffLogin } from '../server/staff-login.js';
import { memoryEventStore } from '../server/store.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', setupKey: 'clave-de-vincular-2026' };
const SALON = -1;

function setup() {
  const now = () => Date.parse('2026-11-21T00:04:00Z');
  const sent = [];
  const telegram = {
    call: async (method, params) => {
      sent.push({ method, ...params });
      if (method === 'getChatMember') return { status: 'member' };
      return { message_id: sent.length };
    },
    sendDocument: async () => ({ message_id: sent.length }),
  };
  const service = createService({ store: memoryEventStore(() => new Date(now())), telegram, optionIndex: buildOptionIndex(), venue: VENUE, now });
  service.bind('salon', SALON, 'Salón', 'Septi');
  service.bind('owner', -4, 'Dueño', 'Nico');
  const staff = createStaffLogin({ service, auth: createAuth({ ...keys, now }), telegram, timeZone: VENUE.timeZone, now, botUsername: () => 'verdel_bot' });
  const bot = createBot({ service, telegram, venue: VENUE, setupKey: keys.setupKey, staff, now });
  let update = 0;
  const from = { id: 8, first_name: 'Septi' };
  const command = (text) => bot.handleUpdate({ update_id: ++update, message: { message_id: update, chat: { id: SALON, type: 'supergroup', title: 'Grupo' }, from, text } });
  const tap = (data) => bot.handleUpdate({ update_id: ++update, callback_query: { id: `q${update}`, data, from, message: { message_id: 99, chat: { id: SALON, type: 'supergroup' } } } });
  const signIn = async (userId) => {
    const request = staff.request({ name: `Moza ${userId}`, pin: keys.pin, origin: `celular-${userId}`, userAgent: '' });
    await staff.telegramStart(request.requestId, { id: userId, name: 'Moza' });
    await staff.telegramAnswer(request.requestId, { id: userId, name: 'Moza' }, true);
    return staff.claim({ requestId: request.requestId, claimSecret: request.claimSecret });
  };
  const closeNight = async () => {
    await service.confirmOrder({ code: `v2.${'nochevieja'.padEnd(20, 'a')}.4.no0x1`, staff: 'Caro' });
    await service.closeNight('Dueño');
  };
  const buttons = (method) => sent.filter((call) => call.method === method).at(-1).reply_markup.inline_keyboard.flat().map((button) => button.callback_data);
  const answers = () => sent.filter((call) => call.method === 'answerCallbackQuery').map((call) => call.text);
  return { staff, command, tap, signIn, closeNight, buttons, answers };
}

test('[Cerrar todas] de una noche ya cerrada no cierra los ingresos de la noche nueva', async () => {
  const bar = setup();
  await bar.signIn(7);
  await bar.command('/mozas');
  const endAll = bar.buttons('sendMessage').at(-1);
  await bar.closeNight();
  const fresh = await bar.signIn(8);
  await bar.tap(endAll);
  assert.ok(bar.staff.verify(fresh.token));
  assert.match(bar.answers().at(-1), /Botón viejo/);
});

test('[Sí, cerrar todas] que quedó de una noche cerrada no hace nada', async () => {
  const bar = setup();
  await bar.signIn(7);
  await bar.command('/mozas');
  await bar.tap(bar.buttons('sendMessage').at(-1));
  const [yes] = bar.buttons('editMessageText');
  await bar.closeNight();
  const fresh = await bar.signIn(8);
  await bar.tap(yes);
  assert.ok(bar.staff.verify(fresh.token));
  assert.match(bar.answers().at(-1), /Botón viejo/);
});

test('[Cerrar todas] de la noche en curso sigue cerrando todo', async () => {
  const bar = setup();
  const first = await bar.signIn(7);
  await bar.command('/mozas');
  await bar.tap(bar.buttons('sendMessage').at(-1));
  await bar.tap(bar.buttons('editMessageText')[0]);
  assert.equal(bar.staff.verify(first.token), null);
});
