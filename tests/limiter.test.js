import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientOrigin, createLimiter } from '../server/limiter.js';

const request = (forwarded, remoteAddress = '10.0.0.1') => ({ headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded }, socket: { remoteAddress } });

test('detrás del proxy, el origen es la última dirección que agregó el proxy y no la que manda el celular', () => {
  assert.equal(clientOrigin(request('190.1.1.1'), true), '190.1.1.1');
  assert.equal(clientOrigin(request('6.6.6.6, 190.1.1.1'), true), '190.1.1.1');
  assert.equal(clientOrigin(request('6.6.6.6,190.1.1.1 '), true), '190.1.1.1');
  assert.equal(clientOrigin(request(undefined), true), '10.0.0.1');
  assert.equal(clientOrigin(request('6.6.6.6, 190.1.1.1'), false), '10.0.0.1');
});

test('inventar direcciones adelante no saltea el límite', () => {
  const limiter = createLimiter({ limit: 2, now: () => 0 });
  const takes = ['1.1.1.1', '2.2.2.2', '3.3.3.3'].map((fake) => limiter.take(clientOrigin(request(`${fake}, 190.1.1.1`), true)));
  assert.deepEqual(takes, [true, true, false]);
  assert.equal(limiter.take(clientOrigin(request('190.2.2.2'), true)), true);
});
