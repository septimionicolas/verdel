import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createService } from '../server/service.js';
import { createStaffLogin, deviceLabel } from '../server/staff-login.js';
import { memoryEventStore } from '../server/store.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', setupKey: 'clave-de-vincular-2026' };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MINUTE = 60 * 1000;

function setup({ bind = ['salon', 'owner'], members = { 7: 'member' }, events, clock, ...options } = {}) {
  const time = clock || { now: Date.parse('2026-11-21T00:04:00Z') };
  const sent = [];
  const telegram = {
    call: async (method, params) => {
      sent.push({ method, ...params });
      if (method === 'getChatMember') return { status: members[params.user_id] || 'left' };
      return { message_id: sent.length };
    },
  };
  const store = memoryEventStore(() => new Date(time.now));
  if (events) for (const event of events) store.append(event);
  const service = createService({ store, telegram, optionIndex: buildOptionIndex(), venue: VENUE, now: () => time.now });
  const ids = { salon: -1, owner: -4 };
  for (const role of bind) service.bind(role, ids[role], role, 'Septi');
  const auth = createAuth({ ...keys, now: () => time.now });
  const staff = createStaffLogin({ service, auth, telegram, timeZone: VENUE.timeZone, now: () => time.now, botUsername: () => 'verdel_bot', ...options });
  const ask = (name = 'Ana', origin = 'bar') => staff.request({ name, pin: keys.pin, origin, userAgent: IPHONE });
  const toOwner = () => sent.filter((call) => call.method === 'sendMessage' && call.chat_id === -4).map((call) => call.text);
  return { staff, service, store, sent, time, ask, toOwner };
}

const credentials = (request) => ({ requestId: request.requestId, claimSecret: request.claimSecret });

test('con PIN correcto vuelve el pedido de ingreso y no hay sesión hasta que alguien confirme', () => {
  const { staff, service, ask } = setup();
  const request = ask();
  assert.match(request.requestId, /^[A-Za-z0-9_-]{22}$/);
  assert.match(request.claimSecret, /^[A-Za-z0-9_-]{43}$/);
  assert.match(request.matchCode, /^\d{2}$/);
  assert.equal(request.botLink, `https://t.me/verdel_bot?start=in_${request.requestId}`);
  assert.equal(request.groupApproval, true);
  assert.equal(request.emergency, true);
  assert.deepEqual(staff.claim(credentials(request)), { state: 'pending' });
  assert.deepEqual(service.openStaffSessions(), []);
  assert.equal(staff.request({ name: 'Ana', pin: 'mal', origin: 'bar' }).error, 'PIN_INVALID');
  assert.equal(staff.request({ name: '  ', pin: keys.pin, origin: 'bar' }).error, 'NAME_REQUIRED');
});

test('confirmar en Telegram entrega el token una sola vez y el segundo pedido da vencido', async () => {
  const { staff, ask } = setup();
  const request = ask();
  const question = await staff.telegramStart(request.requestId, { id: 7, name: 'Ana Pérez' });
  assert.equal(question.text, `Hola Ana Pérez. ¿Sos vos la que está ingresando como «Ana» desde Safari en iPhone, con el número <b>${request.matchCode}</b>?`);
  assert.deepEqual(question.reply_markup.inline_keyboard[0].map((button) => button.callback_data), [`staffme:${request.requestId}`, `staffnotme:${request.requestId}`]);
  const done = await staff.telegramAnswer(request.requestId, { id: 7, name: 'Ana Pérez' }, true);
  assert.equal(done.edit, 'Listo, Ana. Volvé al navegador. Tu ingreso dura hasta el cierre de la noche (máximo 12 h).');
  const claimed = staff.claim(credentials(request));
  assert.equal(claimed.name, 'Ana');
  assert.equal(staff.verify(claimed.token).method, 'telegram');
  assert.equal(staff.claim(credentials(request)).error, 'REQUEST_EXPIRED');
});

test('quien no está en ningún grupo no crea sesión y otra persona no puede tocar el botón ajeno', async () => {
  const { staff, service, ask } = setup();
  const request = ask();
  assert.match((await staff.telegramStart(request.requestId, { id: 99, name: 'Extraño' })).text, /^No te encuentro en el grupo del salón/);
  await staff.telegramStart(request.requestId, { id: 7, name: 'Ana Pérez' });
  assert.equal((await staff.telegramAnswer(request.requestId, { id: 99, name: 'Extraño' }, true)).answer, 'Este ingreso ya no está vigente.');
  assert.deepEqual(service.openStaffSessions(), []);
  assert.deepEqual(staff.claim(credentials(request)), { state: 'pending' });
});

test('«No fui yo» rechaza el pedido y le avisa al dueño', async () => {
  const { staff, ask, toOwner, store } = setup();
  const request = ask();
  await staff.telegramStart(request.requestId, { id: 7, name: 'Ana Pérez' });
  await staff.telegramAnswer(request.requestId, { id: 7, name: 'Ana Pérez' }, false);
  assert.equal(staff.claim(credentials(request)).error, 'REQUEST_DENIED');
  assert.deepEqual(toOwner(), ['Alguien con el PIN intentó ingresar como «Ana» y Ana Pérez dijo que no fue ella. Si se repite, cambiá STAFF_PIN.']);
  assert.equal(store.events.at(-1).type, 'staff_login_denied');
  assert.equal(store.events.at(-1).reason, 'not_me');
});

test('con un claimSecret incorrecto el claim falla aunque el pedido esté aprobado', async () => {
  const { staff, ask } = setup();
  const request = ask();
  await staff.telegramStart(request.requestId, { id: 7, name: 'Ana Pérez' });
  await staff.telegramAnswer(request.requestId, { id: 7, name: 'Ana Pérez' }, true);
  assert.equal(staff.claim({ requestId: request.requestId, claimSecret: 'otro' }).error, 'REQUEST_EXPIRED');
  assert.equal(staff.claim({ requestId: request.requestId }).error, 'REQUEST_EXPIRED');
  assert.ok(staff.claim(credentials(request)).token);
});

test('el ask publica en el salón una sola vez y la aprobación entra con quien aprobó', async () => {
  const { staff, ask, sent } = setup();
  const request = ask();
  assert.deepEqual(await staff.ask(credentials(request)), { asked: true });
  assert.equal((await staff.ask(credentials(request))).error, 'ALREADY_ASKED');
  const posts = sent.filter((call) => call.method === 'sendMessage' && call.chat_id === -1);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].text, `Ana pide entrar desde un celular nuevo (Safari en iPhone). Número de control: <b>${request.matchCode}</b>. Antes de aprobar, pedile que te muestre el número en su pantalla.`);
  await staff.groupAnswer(request.requestId, 'Juan', true);
  assert.equal(sent.at(-1).text, 'Ana entró. Aprobó Juan a las 21:04.');
  assert.deepEqual(sent.at(-1).reply_markup, { inline_keyboard: [] });
  const claimed = staff.claim(credentials(request));
  assert.equal(staff.verify(claimed.token).approvedBy, 'Juan');
});

test('sin grupos vinculados solo queda la emergencia y con solo el dueño se verifica en el dueño', async () => {
  const none = setup({ bind: [] });
  const request = none.ask();
  assert.equal(request.botLink, null);
  assert.equal(request.groupApproval, false);
  assert.equal((await none.staff.ask(credentials(request))).error, 'NO_GROUP');
  const owner = setup({ bind: ['owner'] });
  const ownerRequest = owner.ask();
  assert.ok(ownerRequest.botLink);
  await owner.staff.ask(credentials(ownerRequest));
  assert.match(owner.toOwner()[0], /^Ana pide entrar/);
  const off = setup({ groupApproval: false });
  assert.equal(off.ask().groupApproval, false);
});

test('el ask sin Telegram da TELEGRAM_UNAVAILABLE y se puede probar de nuevo', async () => {
  const { staff, service, ask } = setup();
  const request = ask();
  service.bind('salon', -1, 'salon', 'Septi');
  const broken = setup();
  const brokenRequest = broken.ask();
  broken.service.send = async () => null;
  assert.equal((await broken.staff.ask(credentials(brokenRequest))).error, 'TELEGRAM_UNAVAILABLE');
  assert.deepEqual(await staff.ask(credentials(request)), { asked: true });
});

test('un pedido de ingreso vence a los 3 minutos y el mensaje del grupo dice que venció', async () => {
  const { staff, ask, time, sent } = setup();
  const request = ask();
  await staff.ask(credentials(request));
  time.now += 3 * MINUTE - 1;
  assert.deepEqual(staff.claim(credentials(request)), { state: 'pending' });
  time.now += 1;
  assert.equal(staff.claim(credentials(request)).error, 'REQUEST_EXPIRED');
  assert.equal(sent.at(-1).method, 'editMessageText');
  assert.equal(sent.at(-1).text, 'Venció sin respuesta.');
  assert.equal((await staff.telegramStart(request.requestId, { id: 7, name: 'Ana Pérez' })).text, 'Ese ingreso ya venció o ya se usó. Volvé al navegador y probá de nuevo.');
});

test('la emergencia con la clave entra y avisa al dueño, con clave mal suma al bloqueo y apagada da 403', async () => {
  const { staff, ask, toOwner, store } = setup();
  const request = ask();
  const done = await staff.emergency({ ...credentials(request), setupKey: keys.setupKey, origin: 'bar' });
  assert.equal(staff.verify(done.token).method, 'setup_key');
  assert.deepEqual(toOwner(), ['Ingreso de emergencia de «Ana» a las 21:04.']);
  assert.ok(store.events.some((event) => event.type === 'staff_login_emergency' && event.sessionId === staff.verify(done.token).sessionId));
  const second = ask('Caro');
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await staff.emergency({ ...credentials(second), setupKey: 'mala', origin: 'bar' })).error, 'KEY_INVALID');
  assert.equal((await staff.emergency({ ...credentials(second), setupKey: keys.setupKey, origin: 'bar' })).error, 'LOCKED');
  assert.equal(staff.request({ name: 'Lu', pin: keys.pin, origin: 'bar' }).error, 'LOCKED');
  const off = setup({ emergencyLogin: false });
  const offRequest = off.ask();
  assert.equal(offRequest.emergency, false);
  assert.equal((await off.staff.emergency({ ...credentials(offRequest), setupKey: keys.setupKey, origin: 'bar' })).error, 'EMERGENCY_DISABLED');
});

test('la sesión dura STAFF_SESSION_HOURS y sobrevive a un reinicio, el pedido pendiente no', async () => {
  const clock = { now: Date.parse('2026-11-21T00:04:00Z') };
  const first = setup({ clock, sessionHours: 8 });
  const done = await first.staff.emergency({ ...credentials(first.ask()), setupKey: keys.setupKey, origin: 'bar' });
  const waiting = first.ask('Caro');
  const again = setup({ clock, bind: [], events: first.store.events });
  assert.equal(again.staff.verify(done.token).name, 'Ana');
  assert.equal(again.staff.claim(credentials(waiting)).error, 'REQUEST_EXPIRED');
  clock.now += 8 * 60 * MINUTE - 1;
  assert.ok(again.staff.verify(done.token));
  clock.now += 1;
  assert.equal(again.staff.verify(done.token), null);
});

test('el log guarda la huella del token y nunca el token ni el claimSecret', async () => {
  const { staff, store, ask } = setup();
  const request = ask();
  await staff.telegramStart(request.requestId, { id: 7, name: 'Ana Pérez' });
  await staff.telegramAnswer(request.requestId, { id: 7, name: 'Ana Pérez' }, true);
  const { token } = staff.claim(credentials(request));
  const log = JSON.stringify(store.events);
  assert.ok(log.includes('tokenHash'));
  assert.ok(!log.includes(token));
  assert.ok(!log.includes(request.claimSecret));
});

test('un token con el formato viejo o vacío no vale y cerrar la propia sesión la invalida', async () => {
  const { staff, ask } = setup();
  assert.equal(staff.verify('eyJuYW1lIjoiQW5hIn0.firma'), null);
  assert.equal(staff.verify(''), null);
  const done = await staff.emergency({ ...credentials(ask()), setupKey: keys.setupKey, origin: 'bar' });
  assert.equal(staff.end(done.token), true);
  assert.equal(staff.verify(done.token), null);
  assert.equal(staff.end(done.token), false);
});

test('una sesión nueva de la misma persona de Telegram cierra la anterior', async () => {
  const { staff, ask } = setup();
  const tokens = [];
  for (const name of ['Ana', 'Ana']) {
    const request = ask(name);
    await staff.telegramStart(request.requestId, { id: 7, name: 'Ana Pérez' });
    await staff.telegramAnswer(request.requestId, { id: 7, name: 'Ana Pérez' }, true);
    tokens.push(staff.claim(credentials(request)).token);
  }
  assert.equal(staff.verify(tokens[0]), null);
  assert.ok(staff.verify(tokens[1]));
});

test('tope de 5 pendientes por origen y 30 en total, y pasado el límite de ask el dueño recibe un solo aviso', async () => {
  const { staff, ask, toOwner } = setup();
  for (let index = 0; index < 5; index++) ask(`Moza ${index}`);
  assert.equal(ask('Sexta').error, 'TOO_MANY_REQUESTS');
  for (let index = 5; index < 30; index++) assert.ok(ask(`Moza ${index}`, `ip-${index}`).requestId);
  assert.equal(ask('Otra', 'ip-nueva').error, 'TOO_MANY_REQUESTS');
  const flood = setup();
  const requests = Array.from({ length: 9 }, (_, index) => flood.ask(`Moza ${index}`, `ip-${index}`));
  const results = [];
  for (const request of requests) results.push(await flood.staff.ask(credentials(request)));
  assert.equal(results.filter((result) => result.asked).length, 6);
  assert.deepEqual(results.slice(6).map((result) => result.error), ['ASK_LIMIT', 'ASK_LIMIT', 'ASK_LIMIT']);
  assert.deepEqual(flood.toOwner(), ['Hay muchos pedidos de ingreso con el PIN correcto. Si no son de ustedes, cambiá STAFF_PIN.']);
  assert.equal(toOwner().length, 1);
  assert.match(toOwner()[0], /30 pedidos de ingreso pendientes/);
});

test('rechazar en el grupo deja el pedido rechazado y le avisa al dueño', async () => {
  const { staff, ask, toOwner } = setup();
  const request = ask();
  await staff.ask(credentials(request));
  await staff.groupAnswer(request.requestId, 'Juan', false);
  assert.equal(staff.claim(credentials(request)).error, 'REQUEST_DENIED');
  assert.match(toOwner()[0], /Juan rechazó en el grupo el ingreso de «Ana»/);
});

test('el claim tiene un tope de 60 por minuto por pedido', () => {
  const { staff, ask } = setup();
  const request = ask();
  for (let index = 0; index < 60; index++) staff.claim(credentials(request));
  assert.equal(staff.claim(credentials(request)).error, 'RATE_LIMITED');
});

test('el celular se describe con navegador y sistema, o queda genérico', () => {
  assert.equal(deviceLabel(IPHONE), 'Safari en iPhone');
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-A146M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'), 'Chrome en Android');
  assert.equal(deviceLabel(''), 'un navegador');
});
