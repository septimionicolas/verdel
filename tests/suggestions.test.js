import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAdvisor } from '../server/advisor.js';
import { createHttpHandler } from '../server/http.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';
import { createSuggester, parseSuggestion } from '../server/suggestions.js';

const optionIndex = buildOptionIndex();
const webDir = fileURLToPath(new URL('../web/', import.meta.url));
const config = { botToken: '', allowedOrigins: [], trustProxy: false };
let nowMs = Date.parse('2026-11-15T01:10:00Z');
let answer = () => ({ phrase: 'Dos Norte de 2 litros y una gaseosa para el que no toma.', lines: [{ key: 'no1', quantity: 2 }, { key: 'ga1', quantity: 1 }] });
const requests = [];
const logs = [];

async function fakeAnthropic(url, init) {
  requests.push(JSON.parse(init.body));
  const value = answer();
  if (value instanceof Promise) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Response.json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-fable-5-2', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
}

const service = createService({ store: memoryEventStore(() => new Date(nowMs)), telegram: null, optionIndex, venue: VENUE, now: () => nowMs });
const advisor = createAdvisor({ apiKey: 'clave-de-prueba', apiBase: 'http://anthropic.test', model: 'claude-fable-5-2', fetchImpl: fakeAnthropic });
const suggester = createSuggester({ advisor, optionIndex, nightLimit: 11, tableNightLimit: 11, nightNumber: () => service.state.nights.at(-1).number, timeoutMs: 40, log: (event, detail) => logs.push({ event, ...detail }) });
const servers = {
  on: createServer(createHttpHandler({ service, config, webDir, ready: true, advisor, suggester, now: () => nowMs })),
  off: createServer(createHttpHandler({ service, config, webDir, ready: true, now: () => nowMs })),
};
const bases = {};

const ask = async (text, which = 'on') => {
  const response = await fetch(`${bases[which]}/api/suggestions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  for (const [name, server] of Object.entries(servers)) {
    await new Promise((resolve) => server.listen(0, resolve));
    bases[name] = `http://127.0.0.1:${server.address().port}`;
  }
});
after(() => Object.values(servers).forEach((server) => server.close()));

test('la configuración servida dice si la ronda en texto libre está prendida, y health no cuenta nada más', async () => {
  const served = async (which) => (await import(`data:text/javascript,${encodeURIComponent(await (await fetch(`${bases[which]}/config.js`)).text())}`)).CONFIG;
  assert.equal((await served('on')).suggestions, true);
  assert.equal((await served('off')).suggestions, false);
  assert.deepEqual(await (await fetch(`${bases.on}/api/health`)).json(), { ok: true, ready: true });
});

test('una respuesta válida vuelve validada, sin precios y con el texto del cliente solo como mensaje del usuario', async () => {
  const text = 'somos 5, uno no toma, 40 lucas';
  const result = await ask(`  ${text}  `);
  assert.deepEqual(result, { status: 200, body: { phrase: 'Dos Norte de 2 litros y una gaseosa para el que no toma.', lines: [{ key: 'no1', quantity: 2 }, { key: 'ga1', quantity: 1 }] } });
  const sent = requests.at(-1);
  assert.deepEqual(sent.messages, [{ role: 'user', content: text }]);
  assert.ok(!sent.system.includes(text));
  assert.match(sent.system, /no1 — Norte · 2 litros — \$ 14\.000/);
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.ok(sent.output_config.format.schema.properties.lines.items.properties.key.enum.includes('ga1'));
  assert.ok(!JSON.stringify(logs).includes('lucas'));
});

test('una clave inventada, una cantidad fuera de rango o un JSON roto son ADVISOR_FAILED', async () => {
  for (const bad of [
    { phrase: 'Pedí esto.', lines: [{ key: 'zz9', quantity: 1 }] },
    { phrase: 'Pedí esto.', lines: [{ key: 'no0', quantity: 12 }] },
    { phrase: 'Pedí esto.', lines: [] },
    { phrase: '<b>Hola</b>', lines: [{ key: 'no0', quantity: 1 }] },
    { phrase: 'x'.repeat(161), lines: [{ key: 'no0', quantity: 1 }] },
    '{"phrase": "a", "lines": [',
  ]) {
    answer = () => bad;
    nowMs += 60 * 1000;
    assert.deepEqual(await ask('dos birras'), { status: 502, body: { error: 'ADVISOR_FAILED' } }, JSON.stringify(bad));
  }
});

test('si el modelo tarda más de lo permitido es ADVISOR_FAILED', async () => {
  answer = () => new Promise(() => {});
  nowMs += 60 * 1000;
  assert.deepEqual(await ask('dos birras'), { status: 502, body: { error: 'ADVISOR_FAILED' } });
});

test('sin clave responde ADVISOR_OFF y no llama a nadie', async () => {
  const before = requests.length;
  assert.deepEqual(await ask('dos birras', 'off'), { status: 503, body: { error: 'ADVISOR_OFF' } });
  assert.equal(requests.length, before);
});

test('un texto vacío o de más de 200 caracteres es TEXT_REQUIRED', async () => {
  nowMs += 60 * 1000;
  assert.deepEqual(await ask('   '), { status: 422, body: { error: 'TEXT_REQUIRED' } });
  assert.deepEqual(await ask('a'.repeat(201)), { status: 422, body: { error: 'TEXT_REQUIRED' } });
  assert.equal((await ask(123)).status, 422);
});

test('más de 3 por minuto desde la misma mesa es RATE_LIMITED', async () => {
  nowMs += 60 * 1000;
  answer = () => ({ phrase: 'Una Norte.', lines: [{ key: 'no0', quantity: 1 }] });
  for (let index = 0; index < 3; index += 1) assert.equal((await ask('una birra')).status, 200);
  assert.deepEqual(await ask('una birra'), { status: 429, body: { error: 'RATE_LIMITED' } });
});

test('al llegar al tope de la noche es RATE_LIMITED, y con otra noche vuelve a andar', async () => {
  nowMs += 60 * 1000;
  assert.deepEqual(await ask('una birra'), { status: 429, body: { error: 'RATE_LIMITED' } });
  assert.ok(logs.some((entry) => entry.outcome === 'night_limit'));
  await service.confirmOrder({ code: 'v2.aaaaaaaaaaaaaaaaaaaa.7.no0x1', staff: 'Caro' });
  await service.closeNight('Septi');
  assert.equal((await ask('una birra')).status, 200);
});

test('las líneas repetidas se suman y nunca pasan de 9', () => {
  assert.deepEqual(parseSuggestion('{"phrase":"Va.","lines":[{"key":"no0","quantity":2},{"key":"no0","quantity":3}]}', optionIndex).lines, [{ key: 'no0', quantity: 5 }]);
  assert.equal(parseSuggestion('{"phrase":"Va.","lines":[{"key":"no0","quantity":5},{"key":"no0","quantity":5}]}', optionIndex), null);
  assert.equal(parseSuggestion('{"phrase":"Va.","lines":[{"key":"no0","quantity":1.5}]}', optionIndex), null);
});
