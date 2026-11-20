import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createHttpHandler } from '../server/http.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';
import { createSuggester } from '../server/suggestions.js';

const MINUTE = 60 * 1000;
const optionIndex = buildOptionIndex();
const webDir = fileURLToPath(new URL('../web/', import.meta.url));

async function open({ nightLimit = 300 } = {}) {
  const clock = { now: Date.parse('2026-11-15T01:10:00Z') };
  const now = () => clock.now;
  const logs = [];
  const advisor = { ask: async () => JSON.stringify({ phrase: 'Una Norte.', lines: [{ key: 'no0', quantity: 1 }] }) };
  const service = createService({ store: memoryEventStore(() => new Date(clock.now)), telegram: null, optionIndex, venue: VENUE, now });
  const suggester = createSuggester({ advisor, optionIndex, nightLimit, nightNumber: () => 1, log: (event, detail) => logs.push({ event, ...detail }) });
  const config = { botToken: '', allowedOrigins: [], trustProxy: true };
  const server = createServer(createHttpHandler({ service, staff: null, config, webDir, ready: true, suggester, now }));
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ask = async (body, from = '200.1.1.1') => {
    const response = await fetch(`${base}/api/suggestions`, { method: 'POST', headers: { 'x-forwarded-for': from, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  return { clock, logs, ask, close: () => server.close() };
}

test('doce mesas detrás del wifi del bar arman su ronda en el mismo minuto', async (t) => {
  const bar = await open();
  t.after(bar.close);
  const statuses = new Set();
  for (let table = 1; table <= 12; table++) {
    for (let round = 0; round < 2; round++) statuses.add((await bar.ask({ text: 'somos 4', table })).status);
  }
  assert.deepEqual([...statuses], [200]);
});

test('una mesa que pide de más se frena sola y la de al lado sigue', async (t) => {
  const bar = await open();
  t.after(bar.close);
  for (let round = 0; round < 3; round++) assert.equal((await bar.ask({ text: 'una birra', table: 4 })).status, 200);
  assert.deepEqual(await bar.ask({ text: 'una birra', table: 4 }), { status: 429, body: { error: 'RATE_LIMITED' } });
  assert.equal((await bar.ask({ text: 'una birra', table: 5 })).status, 200);
  bar.clock.now += MINUTE;
  assert.equal((await bar.ask({ text: 'una birra', table: 4 })).status, 200);
});

test('una mesa que no existe es TABLE_UNKNOWN; sin mesa todavía se puede pedir', async (t) => {
  const bar = await open();
  t.after(bar.close);
  for (const table of [VENUE.tableCount + 1, -1, 1.5, '3']) {
    assert.deepEqual(await bar.ask({ text: 'una birra', table }), { status: 422, body: { error: 'TABLE_UNKNOWN' } });
  }
  assert.equal((await bar.ask({ text: 'una birra', table: 0 })).status, 200);
  assert.equal((await bar.ask({ text: 'una birra' })).status, 200);
  assert.equal((await bar.ask({ text: 'una birra', table: null })).status, 200);
});

test('una mesa sola no se gasta el tope de la noche: cada una tiene su parte', async (t) => {
  const bar = await open({ nightLimit: 20 });
  t.after(bar.close);
  for (let round = 0; round < 2; round++) assert.equal((await bar.ask({ text: 'una birra', table: 7 })).status, 200);
  bar.clock.now += MINUTE;
  assert.deepEqual(await bar.ask({ text: 'una birra', table: 7 }), { status: 429, body: { error: 'RATE_LIMITED' } });
  assert.ok(bar.logs.some((entry) => entry.outcome === 'table_limit' && entry.table === 7));
  assert.equal((await bar.ask({ text: 'una birra', table: 8 })).status, 200);
});
