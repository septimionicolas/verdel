import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createTelegram } from '../server/telegram.js';

async function startTelegram(answer) {
  const hits = [];
  const server = createServer((request, response) => {
    hits.push(request.url.split('/').pop());
    answer(hits.length, response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const apiBase = `http://127.0.0.1:${server.address().port}`;
  return { apiBase, hits, close: () => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); } };
}

const reply = (response) => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, result: { message_id: 1 } }));

test('si Telegram no contesta, el aviso se rinde a tiempo en vez de quedar colgado', { timeout: 5000 }, async (t) => {
  const telegram$ = await startTelegram(() => {});
  t.after(telegram$.close);
  const telegram = createTelegram({ token: 'T', apiBase: telegram$.apiBase, timeoutMs: 200, retryDelaysMs: [] });
  const started = Date.now();
  await assert.rejects(telegram.call('sendMessage', {}));
  assert.ok(Date.now() - started < 2000);
});

test('una llamada que se quedó sin respuesta se reintenta y el aviso sale', { timeout: 5000 }, async (t) => {
  const telegram$ = await startTelegram((hit, response) => { if (hit > 1) reply(response); });
  t.after(telegram$.close);
  const telegram = createTelegram({ token: 'T', apiBase: telegram$.apiBase, timeoutMs: 200, retryDelaysMs: [10] });
  assert.deepEqual(await telegram.call('sendMessage', {}), { message_id: 1 });
  assert.deepEqual(telegram$.hits, ['sendMessage', 'sendMessage']);
});

test('si Telegram manda los encabezados y se cuelga con el cuerpo, también se reintenta', { timeout: 5000 }, async (t) => {
  const telegram$ = await startTelegram((hit, response) => {
    if (hit > 1) return reply(response);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.write('{"ok":');
  });
  t.after(telegram$.close);
  const telegram = createTelegram({ token: 'T', apiBase: telegram$.apiBase, timeoutMs: 200, retryDelaysMs: [10] });
  assert.deepEqual(await telegram.call('sendMessage', {}), { message_id: 1 });
  assert.equal(telegram$.hits.length, 2);
});

test('el long poll de getUpdates tiene la espera de Telegram más el margen', { timeout: 5000 }, async (t) => {
  const telegram$ = await startTelegram((hit, response) => setTimeout(() => reply(response), 600));
  t.after(telegram$.close);
  const telegram = createTelegram({ token: 'T', apiBase: telegram$.apiBase, timeoutMs: 200 });
  assert.deepEqual(await telegram.call('getUpdates', { timeout: 1 }, { retry: false }), { message_id: 1 });
});
