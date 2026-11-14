import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientOrigin, createLimiter } from '../server/limiter.js';

const request = (forwarded, remoteAddress = '100.64.0.1') => ({ headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded }, socket: { remoteAddress } });

test('en Railway el origen es la primera dirección: el borde la pisa con la del celular y agrega la suya, que cambia', () => {
  assert.equal(clientOrigin(request('181.110.212.29, 46.151.194.130'), true), '181.110.212.29');
  assert.equal(clientOrigin(request('181.110.212.29, 46.151.194.129'), true), '181.110.212.29');
  assert.equal(clientOrigin(request('190.1.1.1'), true), '190.1.1.1');
  assert.equal(clientOrigin(request(undefined), true), '100.64.0.1');
  assert.equal(clientOrigin(request('181.110.212.29, 46.151.194.130'), false), '100.64.0.1');
});

test('el mismo celular cuenta para un solo límite aunque entre por bordes distintos, y otro celular tiene el suyo', () => {
  const limiter = createLimiter({ limit: 2, now: () => 0 });
  const takes = ['46.151.194.129', '46.151.194.130', '46.151.194.129'].map((edge) => limiter.take(clientOrigin(request(`181.110.212.29, ${edge}`), true)));
  assert.deepEqual(takes, [true, true, false]);
  assert.equal(limiter.take(clientOrigin(request('190.2.2.2, 46.151.194.130'), true)), true);
});
