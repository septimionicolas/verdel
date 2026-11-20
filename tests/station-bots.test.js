import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createBot } from '../server/bot.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';
import { createTelegram } from '../server/telegram.js';

const CHATS = { salon: -1, pizzas: -2, house: -3, owner: -4 };
const calls = [];
let messageId = 100;

async function fakeFetch(url, options) {
  const [bot, method] = url.split('/').slice(-2);
  calls.push({ bot: bot.slice(3), method, params: JSON.parse(options.body) });
  return Response.json({ ok: true, result: method === 'sendMessage' ? { message_id: ++messageId } : true });
}

const connect = (token) => createTelegram({ token, apiBase: 'http://telegram.test', fetchImpl: fakeFetch });
const main = connect('MAIN');
const stationTelegrams = { pizzas: connect('PIZZAS'), house: connect('HOUSE') };
const service = createService({ store: memoryEventStore(), telegram: main, stationTelegrams, optionIndex: buildOptionIndex(), venue: VENUE });
const bots = {
  main: createBot({ service, telegram: main, venue: VENUE, setupKey: 'clave-de-vincular-2026', roles: ['salon', 'owner'] }),
  pizzas: createBot({ service, telegram: stationTelegrams.pizzas, venue: VENUE, setupKey: 'clave-de-vincular-2026', roles: ['pizzas'] }),
  house: createBot({ service, telegram: stationTelegrams.house, venue: VENUE, setupKey: 'clave-de-vincular-2026', roles: ['house'] }),
};

const command = (bot, chat, text) => bots[bot].handleUpdate({ message: { text, chat: { id: chat, title: `Grupo ${chat}` }, message_id: 1, from: { first_name: 'Septi' } } });
const tap = (bot, chat, data) => bots[bot].handleUpdate({ callback_query: { id: 'q', from: { first_name: 'Marta' }, message: { chat: { id: chat }, message_id: 5 }, data } });
const lastTo = (bot, chat) => calls.filter((call) => call.bot === bot && call.method === 'sendMessage' && call.params.chat_id === chat).at(-1)?.params.text;
const lastAnswer = (bot) => calls.filter((call) => call.bot === bot && call.method === 'answerCallbackQuery').at(-1).params.text;

test('cada cocina se vincula solo con su bot, y el bot del salón no vincula cocinas', async () => {
  await command('main', CHATS.pizzas, '/vincular pizzas clave-de-vincular-2026');
  assert.match(lastTo('MAIN', CHATS.pizzas), /su propio bot/);
  await command('house', CHATS.salon, '/vincular salon clave-de-vincular-2026');
  assert.match(lastTo('HOUSE', CHATS.salon), /solo para Cocina de Verdel/);
  assert.deepEqual(service.state.bindings, {});

  await command('main', CHATS.salon, '/vincular salon clave-de-vincular-2026');
  await command('main', CHATS.owner, '/vincular dueno clave-de-vincular-2026');
  await command('pizzas', CHATS.pizzas, '/vincular pizzas clave-de-vincular-2026');
  await command('house', CHATS.house, '/vincular cocina clave-de-vincular-2026');
  assert.deepEqual(Object.keys(service.state.bindings).sort(), ['house', 'owner', 'pizzas', 'salon']);
});

test('cada cocina recibe lo suyo por su propio bot, y el salón y el dueño por el principal', async () => {
  const result = await service.confirmOrder({ code: 'v1.7.pe0x1-pa2x1', staff: 'Caro' });
  assert.equal(result.telegram, 'sent');
  assert.match(lastTo('PIZZAS', CHATS.pizzas), /Pizza especial/);
  assert.match(lastTo('HOUSE', CHATS.house), /Papas · Yankee/);
  assert.match(lastTo('MAIN', CHATS.salon), /Pedido #1/);
  assert.match(lastTo('MAIN', CHATS.owner), /confirmó Caro/);
  assert.equal(calls.filter((call) => call.bot === 'MAIN' && [CHATS.pizzas, CHATS.house].includes(call.params.chat_id)).length, 2);
});

test('«Listo» desde el bot de la cocina avisa al salón y cada bot edita solo sus mensajes', async () => {
  const before = calls.length;
  await tap('house', CHATS.house, 'ready:1-1:house');
  assert.equal(service.state.nights[0].orders[0].ready.house.by, 'Marta');
  assert.equal(lastAnswer('HOUSE'), 'Avisado al salón.');
  const after = calls.slice(before);
  assert.ok(after.some((call) => call.bot === 'MAIN' && call.method === 'sendMessage' && call.params.chat_id === CHATS.salon && /Listo para retirar/.test(call.params.text)));
  for (const edit of after.filter((call) => call.method === 'editMessageText')) {
    const owner = { [CHATS.salon]: 'MAIN', [CHATS.pizzas]: 'PIZZAS', [CHATS.house]: 'HOUSE' }[edit.params.chat_id];
    assert.equal(edit.bot, owner);
  }
});

test('el bot de una cocina no cobra, no cierra y no muestra los otros grupos', async () => {
  await tap('pizzas', CHATS.pizzas, 'ready:1-1:house');
  assert.match(lastAnswer('PIZZAS'), /otra cocina/);
  await tap('pizzas', CHATS.pizzas, 'charge:1-1');
  assert.match(lastAnswer('PIZZAS'), /no hace nada/);
  assert.equal(service.state.nights[0].orders[0].status, 'open');

  await command('pizzas', CHATS.pizzas, '/cierre');
  assert.doesNotMatch(lastTo('PIZZAS', CHATS.pizzas), /Vendido|Cerrar/);
  await command('pizzas', CHATS.pizzas, '/estado');
  const status = lastTo('PIZZAS', CHATS.pizzas);
  assert.match(status, /Cocina de pizzas y empanadas: Grupo -2/);
  assert.doesNotMatch(status, /Salón|Dueño|Grupo -1/);
});
