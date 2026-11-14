import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuth } from '../server/auth.js';

test('el PIN correcto da un ingreso que vence y no se puede falsificar', () => {
  let now = 1_000_000;
  const auth = createAuth({ pin: '4321', secret: 'secreto', now: () => now, maxAgeMs: 1000 });
  const session = auth.login('4321', 'Caro', 'ip');
  assert.equal(auth.verify(session.token).name, 'Caro');
  assert.equal(auth.verify(`${session.token}x`), null);
  assert.equal(createAuth({ pin: '4321', secret: 'otro' }).verify(session.token), null);
  now += 1001;
  assert.equal(auth.verify(session.token), null);
});

test('cinco PIN mal bloquean ese origen por cinco minutos', () => {
  let now = 0;
  const auth = createAuth({ pin: '4321', secret: 'secreto', now: () => now });
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(auth.login('0000', 'Caro', 'ip').error, 'PIN_INVALID');
  assert.equal(auth.login('4321', 'Caro', 'ip').error, 'LOCKED');
  assert.ok(auth.login('4321', 'Caro', 'otra-ip').token);
  now += 5 * 60 * 1000;
  assert.ok(auth.login('4321', 'Caro', 'ip').token);
});

test('sin PIN configurado nadie ingresa', () => {
  assert.equal(createAuth({ pin: '', secret: 'secreto' }).login('', 'Caro', 'ip').error, 'PIN_INVALID');
});
