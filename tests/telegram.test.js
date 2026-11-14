import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTelegram } from '../server/telegram.js';

const networkDown = () => new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
const ok = () => Response.json({ ok: true, result: { message_id: 1 } });

function setup(answers, options = {}) {
  const calls = [];
  const waits = [];
  const fetchImpl = async (url) => {
    calls.push(url.split('/').pop());
    const answer = answers.length > 1 ? answers.shift() : answers[0];
    if (answer instanceof Error) throw answer;
    return answer();
  };
  const telegram = createTelegram({ token: 'T', apiBase: 'http://telegram.test', fetchImpl, sleep: async (ms) => waits.push(ms), ...options });
  return { telegram, calls, waits };
}

test('un 400 de Telegram no se reintenta', async () => {
  const notModified = () => Response.json({ ok: false, error_code: 400, description: 'Bad Request: message is not modified' }, { status: 400 });
  const { telegram, calls, waits } = setup([notModified]);
  await assert.rejects(telegram.call('editMessageText', {}), { message: 'TELEGRAM_editMessageText_400' });
  assert.equal(calls.length, 1);
  assert.deepEqual(waits, []);
});

test('si la red falla y vuelve, el mensaje sale una sola vez', async () => {
  const { telegram, calls, waits } = setup([networkDown(), ok]);
  assert.deepEqual(await telegram.call('sendMessage', {}), { message_id: 1 });
  assert.deepEqual(calls, ['sendMessage', 'sendMessage']);
  assert.deepEqual(waits, [1000]);
});

test('un 502 se reintenta aunque la respuesta no sea JSON', async () => {
  const badGateway = () => new Response('<html>502</html>', { status: 502 });
  const { telegram, waits } = setup([badGateway, ok]);
  assert.deepEqual(await telegram.call('sendMessage', {}), { message_id: 1 });
  assert.deepEqual(waits, [1000]);
});

test('si el corte sigue, se rinde al cuarto intento y por un rato no espera, hasta que la red vuelve', async () => {
  let nowMs = 0;
  const answers = [networkDown()];
  const { telegram, calls, waits } = setup(answers, { now: () => nowMs });
  await assert.rejects(telegram.call('sendMessage', {}), { message: 'fetch failed' });
  assert.equal(calls.length, 4);
  assert.deepEqual(waits, [1000, 2000, 4000]);

  nowMs += 5000;
  await assert.rejects(telegram.call('sendMessage', {}));
  assert.equal(calls.length, 5);

  answers.splice(0, 1, ok);
  await telegram.call('sendMessage', {});
  answers.splice(0, 1, networkDown(), ok);
  await telegram.call('sendMessage', {});
  assert.equal(calls.length, 8);
  assert.deepEqual(waits, [1000, 2000, 4000, 1000]);
});

test('getUpdates no se reintenta adentro: el polling tiene su propia espera', async () => {
  const { telegram, calls } = setup([networkDown()]);
  await assert.rejects(telegram.call('getUpdates', {}, { retry: false }));
  assert.equal(calls.length, 1);
});

test('la espera de verdad anda sin señal de apagado', async () => {
  const answers = [networkDown(), ok];
  const telegram = createTelegram({ token: 'T', apiBase: 'http://telegram.test', retryDelaysMs: [1], fetchImpl: async () => {
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer();
  } });
  assert.deepEqual(await telegram.call('sendMessage', {}), { message_id: 1 });
});

test('apagar el servidor corta la espera y queda el error del corte', async () => {
  const stopper = new AbortController();
  const telegram = createTelegram({ token: 'T', apiBase: 'http://telegram.test', retryDelaysMs: [60000], signal: stopper.signal, fetchImpl: async () => {
    throw networkDown();
  } });
  const pending = telegram.call('sendMessage', {});
  setImmediate(() => stopper.abort());
  await assert.rejects(pending, { message: 'fetch failed' });
});
