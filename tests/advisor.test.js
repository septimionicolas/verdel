import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAdvisor } from '../server/advisor.js';
import { NARRATIVE_MAX_CHARS, narrativeMessage } from '../server/narrative.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';

const reply = (text, extra = {}) => Response.json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-fable-5-2', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 }, ...extra });

function fakeApi(respond) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return respond(requests.at(-1), init);
  };
  return { requests, fetchImpl };
}

test('el asistente manda el pedido con la forma de la API de mensajes y devuelve el texto', async () => {
  const api = fakeApi(() => reply('  Linda noche.  '));
  const advisor = createAdvisor({ apiKey: 'clave-de-prueba', apiBase: 'http://anthropic.test/', model: 'claude-fable-5-2', fetchImpl: api.fetchImpl });
  assert.equal(await advisor.ask('Instrucciones', 'Datos'), 'Linda noche.');
  const [request] = api.requests;
  assert.equal(request.url, 'http://anthropic.test/v1/messages');
  assert.equal(request.headers['x-api-key'], 'clave-de-prueba');
  assert.equal(request.headers['anthropic-version'], '2026-10-21');
  assert.equal(request.headers['content-type'], 'application/json');
  assert.equal(request.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.deepEqual(request.body.messages, [{ role: 'user', content: 'Datos' }]);
  assert.equal(request.body.system, 'Instrucciones');
  assert.equal(request.body.model, 'claude-fable-5-2');
  assert.equal(request.body.fallbacks, 'default');
  assert.equal(request.body.output_config.effort, 'low');
  assert.equal('thinking' in request.body || 'temperature' in request.body, false);
});

test('con un modelo sin respaldo de servidor no manda fallbacks', async () => {
  const api = fakeApi(() => reply('Hola.'));
  await createAdvisor({ apiKey: 'k', model: 'claude-haiku-5-5', fetchImpl: api.fetchImpl }).ask('i', 't');
  assert.equal(api.requests[0].body.fallbacks, undefined);
  assert.equal(api.requests[0].headers['anthropic-beta'], undefined);
});

test('errores, rechazos, respuestas rotas, cortes y demoras devuelven null sin lanzar', async () => {
  const logs = [];
  const log = (event, detail) => logs.push({ event, ...detail });
  const cases = [
    async () => Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }, { status: 529 }),
    async () => reply('No.', { stop_reason: 'refusal' }),
    async () => reply('Cortado', { stop_reason: 'max_tokens' }),
    async () => new Response('no es json', { status: 200 }),
    async () => reply('   '),
    async () => {
      throw new TypeError('fetch failed');
    },
    () => new Promise(() => {}),
  ];
  for (const respond of cases) {
    const advisor = createAdvisor({ apiKey: 'k', model: 'claude-fable-5-2', fetchImpl: respond, timeoutMs: 30, log });
    assert.equal(await advisor.ask('i', 't'), null);
  }
  assert.equal(logs.length, cases.length);
  assert.ok(logs.every((entry) => entry.event === 'advisor_failed'));
  assert.ok(logs.some((entry) => entry.timeoutMs === 30));
});

test('el párrafo se recorta, queda en una línea y se escapa para HTML', () => {
  assert.equal(narrativeMessage('Pizza <b>&</b>\n\nbirra'), 'Pizza &lt;b&gt;&amp;&lt;/b&gt; birra');
  const long = narrativeMessage('palabra '.repeat(200));
  assert.ok(long.length <= NARRATIVE_MAX_CHARS);
  assert.ok(long.endsWith('palabra…'));
  assert.equal(narrativeMessage(null), null);
});

function night({ advisor }) {
  let nowMs = Date.parse('2026-11-15T01:10:00Z');
  const calls = [];
  let messageId = 0;
  const telegram = {
    call: async (method, params) => {
      calls.push({ method, params });
      return { message_id: ++messageId };
    },
    sendDocument: async (chatId, fileName) => {
      calls.push({ method: 'sendDocument', params: { chat_id: chatId, fileName } });
      return { message_id: ++messageId };
    },
  };
  const service = createService({ store: memoryEventStore(() => new Date(nowMs)), telegram, advisor, optionIndex: buildOptionIndex(), venue: VENUE, now: () => nowMs });
  service.bind('salon', -1, 'Salón', 'Septimio');
  service.bind('owner', -4, 'Dueño', 'Septimio');
  return {
    service,
    calls,
    async play() {
      await service.confirmOrder({ code: 'v2.aaaaaaaaaaaaaaaaaaaa.7.no1x2-pe0x1', staff: 'Carolina Pérez' });
      nowMs += 20 * 60 * 1000;
      await service.markReady('1-1', 'pizzas', 'Juan Gómez');
      await service.confirmOrder({ code: 'v2.bbbbbbbbbbbbbbbbbbbb.3.fe0x2', staff: 'Martina' });
      await service.voidOrder('1-2', 'Martina');
      nowMs += 60 * 60 * 1000;
      await service.closeNight('Septimio Nicolás');
    },
  };
}

const texts = (calls, chat) => calls.filter((call) => call.method === 'sendMessage' && call.params.chat_id === chat).map((call) => call.params.text);

test('con clave, el cierre trae un párrafo aparte después del resumen, en el salón y en el dueño', async () => {
  const api = fakeApi(() => reply('Noche tranquila: 1 pedido y <la> pizza especial salió en 20 min.'));
  const run = night({ advisor: createAdvisor({ apiKey: 'k', model: 'claude-fable-5-2', fetchImpl: api.fetchImpl }) });
  await run.play();
  assert.equal(api.requests.length, 1);
  for (const chat of [-1, -4]) {
    const sent = texts(run.calls, chat);
    assert.match(sent.at(-2), /Vendido: <b>\$ 61\.000<\/b>/);
    assert.equal(sent.at(-1), 'Noche tranquila: 1 pedido y &lt;la&gt; pizza especial salió en 20 min.');
  }
});

test('al modelo le van solo números y productos, nunca nombres del personal', async () => {
  const api = fakeApi(() => reply('Bien.'));
  const run = night({ advisor: createAdvisor({ apiKey: 'k', model: 'claude-fable-5-2', fetchImpl: api.fetchImpl }) });
  await run.play();
  const sent = JSON.stringify(api.requests[0].body);
  for (const name of ['Carolina', 'Pérez', 'Juan', 'Gómez', 'Martina', 'Septimio', 'Nicolás']) assert.ok(!sent.includes(name), name);
  const facts = api.requests[0].body.messages[0].content;
  assert.match(facts, /Total vendido: \$ 61\.000\./);
  assert.match(facts, /Norte · 3 litros \(2\)/);
  assert.match(facts, /Cocina de pizzas y empanadas: 1 pedido, 20 min en promedio/);
  assert.match(facts, /Anulados: 1 \(\$ 12\.000\)\./);
});

test('sin clave no hay llamada y el cierre sale como siempre', async () => {
  const run = night({ advisor: null });
  await run.play();
  const sent = texts(run.calls, -1);
  assert.match(sent.at(-1), /Cerró Septimio Nicolás\./);
  assert.equal(run.calls.filter((call) => call.method === 'sendDocument').length, 1);
});

test('si el modelo falla o tarda, el cierre sale igual y sin párrafo', async () => {
  for (const respond of [async () => Response.json({ type: 'error' }, { status: 500 }), () => new Promise(() => {})]) {
    const run = night({ advisor: createAdvisor({ apiKey: 'k', model: 'claude-fable-5-2', fetchImpl: respond, timeoutMs: 20 }) });
    await run.play();
    assert.match(texts(run.calls, -1).at(-1), /Cerró Septimio Nicolás\./);
    assert.match(texts(run.calls, -4).at(-1), /Cerró Septimio Nicolás\./);
    assert.equal(run.service.state.nights.length, 2);
  }
});
