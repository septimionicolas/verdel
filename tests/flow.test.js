import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createBot } from '../server/bot.js';
import { createHttpHandler } from '../server/http.js';
import { replay } from '../server/night.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';
import { createTelegram } from '../server/telegram.js';

const CHATS = { salon: -1, pizzas: -2, house: -3, owner: -4 };
let nowMs = Date.parse('2026-11-15T01:10:00Z');
const calls = [];
const logs = [];
const waits = [];
let messageId = 100;
let networkMs = 0;
let downUntil = 0;
const sleep = async (ms) => {
  waits.push(ms);
  networkMs += ms;
};
const cutNetwork = (ms) => {
  downUntil = networkMs + ms;
};

async function fakeFetch(url, options) {
  if (networkMs < downUntil) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
  const method = url.split('/').pop();
  const isForm = options.body instanceof FormData;
  const params = isForm ? { chat_id: Number(options.body.get('chat_id')), caption: options.body.get('caption'), fileName: options.body.get('document').name, html: await options.body.get('document').text() } : JSON.parse(options.body);
  calls.push({ method, params });
  return Response.json({ ok: true, result: { message_id: ++messageId } });
}

const telegram = createTelegram({ token: 'TEST', apiBase: 'http://telegram.test', fetchImpl: fakeFetch, sleep });
const store = memoryEventStore(() => new Date(nowMs));
const service = createService({ store, telegram, optionIndex: buildOptionIndex(), venue: VENUE, now: () => nowMs, log: (event, detail) => logs.push({ event, ...detail }) });
const bot = createBot({ service, telegram, venue: VENUE, setupKey: 'clave-de-vincular-2026' });
const auth = createAuth({ pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', now: () => nowMs });
const config = { botToken: 'TEST', allowedOrigins: ['https://carta.test'], trustProxy: false };
const server = createServer(createHttpHandler({ service, auth, config, webDir: fileURLToPath(new URL('../web/', import.meta.url)), ready: true }));
let base = '';
let token = '';

const sentTo = (chat, method = 'sendMessage') => calls.filter((call) => call.method === method && call.params.chat_id === chat);
const command = (chat, text) => bot.handleUpdate({ message: { text, chat: { id: chat, title: `Grupo ${chat}` }, message_id: 1, from: { first_name: 'Septi' } } });
const tap = (chat, data, name = 'Caro') => bot.handleUpdate({ callback_query: { id: 'q', from: { first_name: name }, message: { chat: { id: chat }, message_id: 5 }, data } });
const lastAnswer = () => calls.filter((call) => call.method === 'answerCallbackQuery').at(-1).params.text;
const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const order = (code, force = false) => post('/api/orders', { code, force }, { authorization: `Bearer ${token}` });

before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('cada grupo se vincula con la clave y sin ella no', async () => {
  await command(CHATS.salon, '/vincular salon mala');
  assert.deepEqual(service.state.bindings, {});
  await command(CHATS.salon, '/vincular salon clave-de-vincular-2026');
  await command(CHATS.pizzas, '/vincular@verdel_bot pizzas clave-de-vincular-2026');
  await command(CHATS.house, '/vincular cocina clave-de-vincular-2026');
  await command(CHATS.owner, '/vincular dueno clave-de-vincular-2026');
  assert.deepEqual(Object.keys(service.state.bindings), ['salon', 'pizzas', 'house', 'owner']);
  assert.ok(calls.some((call) => call.method === 'deleteMessage'));
});

test('sin ingreso no se confirma nada y el PIN da el ingreso', async () => {
  assert.equal((await post('/api/orders', { code: 'v1.7.no1x2' })).status, 401);
  assert.equal((await post('/api/staff/sessions', { name: 'Caro', pin: '0000' })).status, 401);
  const response = await post('/api/staff/sessions', { name: 'Caro', pin: 'birra-fria-26' });
  assert.equal(response.status, 201);
  token = (await response.json()).token;
});

test('el pedido confirmado llega al salón, a cada cocina lo suyo y al dueño', async () => {
  const response = await order('v1.7.no1x2-pe0x1-pa2x1');
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { number: 1, totalCents: 7400000, telegram: 'sent' });

  const salon = sentTo(CHATS.salon).at(-1).params;
  assert.match(salon.text, /Mesa 7<\/b> · Pedido #1/);
  assert.match(salon.text, /Total \$ 74\.000/);
  assert.match(salon.text, /Confirmó Caro · 22:10/);
  assert.equal(salon.reply_markup.inline_keyboard[0][0].callback_data, 'charge:1-1');

  const pizzas = sentTo(CHATS.pizzas).at(-1).params.text;
  assert.match(pizzas, /1 × Pizza especial · Entera/);
  assert.doesNotMatch(pizzas, /Norte|Papas|\$/);
  assert.match(sentTo(CHATS.house).at(-1).params.text, /1 × Papas · Yankee/);
  assert.match(sentTo(CHATS.owner).at(-1).params.text, /Pedido · Mesa 7 · #1 · \$ 74\.000 · confirmó Caro/);
});

test('el mismo código dos veces avisa, y con «enviar igual» entra como otro pedido', async () => {
  const repeated = await order('v1.7.no1x2-pe0x1-pa2x1');
  assert.equal(repeated.status, 409);
  assert.equal((await repeated.json()).number, 1);
  assert.equal((await (await order('v1.7.no1x2-pe0x1-pa2x1', true)).json()).number, 2);
  assert.equal((await order('v1.7.zz9x1')).status, 422);
});

test('la cocina avisa «Listo» solo desde su grupo y el salón se entera', async () => {
  nowMs += 17 * 60 * 1000;
  await tap(CHATS.house, 'ready:1-1:pizzas', 'Otro');
  assert.match(lastAnswer(), /otra cocina/);
  assert.deepEqual(service.state.nights[0].orders[0].ready, {});

  await tap(CHATS.pizzas, 'ready:1-1:pizzas', 'Juan');
  assert.equal(service.state.nights[0].orders[0].ready.pizzas.by, 'Juan');
  const alert = sentTo(CHATS.salon).at(-1).params;
  assert.match(alert.text, /Listo para retirar<\/b> · Mesa 7 · #1\n1 × Pizza especial · Entera/);
  assert.ok(alert.reply_parameters.message_id);
  assert.match(sentTo(CHATS.owner).at(-1).params.text, /Listo · Mesa 7 · #1 · \$ 74\.000 · 17 min/);
  assert.ok(calls.some((call) => call.method === 'editMessageText' && /listo 22:27/.test(call.params.text)));

  await tap(CHATS.pizzas, 'ready:1-1:pizzas', 'Juan');
  assert.match(lastAnswer(), /Ya estaba avisado/);
});

test('si la red se corta un momento, el «Listo» llega igual al salón y una sola vez', async (t) => {
  t.after(() => {
    downUntil = 0;
  });
  const before = calls.length;
  cutNetwork(2500);
  await tap(CHATS.house, 'ready:1-1:house', 'Marta');
  assert.equal(service.state.nights[0].orders[0].ready.house.by, 'Marta');

  const sent = calls.slice(before).filter((call) => call.method === 'sendMessage');
  assert.equal(sent.filter((call) => call.params.chat_id === CHATS.salon && /Listo para retirar<\/b> · Mesa 7 · #1\n1 × Papas · Yankee/.test(call.params.text)).length, 1);
  assert.equal(sent.filter((call) => call.params.chat_id === CHATS.owner && /Listo · Mesa 7 · #1/.test(call.params.text)).length, 1);
  assert.deepEqual(waits, [1000, 2000]);
  assert.deepEqual(logs.filter((entry) => /^telegram_(send|edit)_failed$/.test(entry.event)), []);
});

test('cobrar y anular se hacen solo desde el salón, y anular pide confirmación', async () => {
  await tap(CHATS.pizzas, 'charge:1-1');
  assert.equal(service.state.nights[0].orders[0].status, 'open');
  await tap(CHATS.salon, 'charge:1-1');
  assert.equal(service.state.nights[0].orders[0].status, 'charged');
  await tap(CHATS.salon, 'uncharge:1-1');
  assert.equal(service.state.nights[0].orders[0].status, 'open');
  await tap(CHATS.salon, 'charge:1-1');

  await tap(CHATS.salon, 'void:1-2');
  assert.equal(service.state.nights[0].orders[1].status, 'open');
  await tap(CHATS.salon, 'voidyes:1-2');
  assert.equal(service.state.nights[0].orders[1].status, 'voided');
  assert.ok(calls.some((call) => call.method === 'editMessageText' && /no lo preparen/.test(call.params.text)));
  await tap(CHATS.salon, 'charge:1-2');
  assert.equal(service.state.nights[0].orders[1].status, 'voided');
});

test('el cierre avisa lo que falta cobrar, manda el reporte al dueño y abre otra noche', async () => {
  nowMs += 40 * 60 * 1000;
  await order('v1.3.he0x1-em1x1');
  await command(CHATS.pizzas, '/cierre');
  assert.match(sentTo(CHATS.pizzas).at(-1).params.text, /grupo del salón o el del dueño/);

  await command(CHATS.salon, '/cierre');
  const question = sentTo(CHATS.salon).at(-1).params;
  assert.match(question.text, /Quedan sin cobrar:<\/b>\n• Mesa 3 · #3 · \$ 33\.000/);
  assert.equal(question.reply_markup.inline_keyboard[0][0].text, 'Cerrar igual y armar reporte');

  await tap(CHATS.salon, 'close:1', 'Septi');
  const report = sentTo(CHATS.owner, 'sendDocument').at(-1).params;
  assert.equal(report.fileName, 'cierre-verdel-2026-11-14-noche-1.html');
  assert.match(report.html, /Noche del sábado 14\/11/);
  assert.match(report.html, /<p class="big">\$ 74\.000<\/p>/);
  assert.match(report.html, /Quedó 1 sin marcar como cobrado \(\$ 33\.000\)/);
  assert.match(report.html, /Se anuló 1 \(\$ 74\.000\)/);
  assert.match(report.html, /<td>Cocina de pizzas y empanadas<\/td><td>2<\/td><td>2<\/td><td>1<\/td><td>1<\/td><td>17 min<\/td>/);
  assert.match(sentTo(CHATS.salon).at(-1).params.text, /Vendido: <b>\$ 107\.000<\/b>\nCobrado en caja: \$ 74\.000 \(1\)\nSin cobrar: \$ 33\.000 \(1\)\nAnulados: 1/);

  assert.equal(service.state.nights.length, 2);
  assert.equal((await (await order('v1.5.fe0x2')).json()).number, 1);
  assert.equal(service.state.nights[1].orders[0].id, '2-1');
  await tap(CHATS.salon, 'close:1', 'Septi');
  assert.match(lastAnswer(), /ya estaba cerrada/);
});

test('el registro alcanza para reconstruir todo el estado', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(replay(store.events))), JSON.parse(JSON.stringify(service.state)));
});

test('el servidor sirve la carta, su configuración y nada fuera de la carpeta', async () => {
  assert.match(await (await fetch(`${base}/`)).text(), /<title>Carta Verdel<\/title>/);
  assert.match(await (await fetch(`${base}/config.js`)).text(), /apiBase: ''/);
  assert.equal((await fetch(`${base}/%2e%2e/server/main.js`)).status, 404);
  const health = await (await fetch(`${base}/api/health`, { headers: { origin: 'https://carta.test' } })).json();
  assert.deepEqual(health, { ok: true, ready: true });
  assert.equal((await fetch(`${base}/api/health`, { headers: { origin: 'https://carta.test' } })).headers.get('access-control-allow-origin'), 'https://carta.test');
  assert.equal((await fetch(`${base}/api/health`, { headers: { origin: 'https://otra.test' } })).headers.get('access-control-allow-origin'), null);
});

test('cinco PIN mal desde el mismo origen frenan los intentos', async () => {
  for (let attempt = 0; attempt < 5; attempt++) await post('/api/staff/sessions', { name: 'Caro', pin: '1111' });
  assert.equal((await post('/api/staff/sessions', { name: 'Caro', pin: 'birra-fria-26' })).status, 429);
});
