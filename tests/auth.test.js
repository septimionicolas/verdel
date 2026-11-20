import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuth } from '../server/auth.js';

test('el PIN correcto da un ingreso que vence y no se puede falsificar', () => {
  let now = 1_000_000;
  const auth = createAuth({ pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', now: () => now, maxAgeMs: 1000 });
  const session = auth.login('birra-fria-26', 'Caro', 'ip');
  assert.equal(auth.verify(session.token).name, 'Caro');
  assert.equal(auth.verify(`${session.token}x`), null);
  assert.equal(createAuth({ pin: 'birra-fria-26', secret: 'otra-firma-de-prueba-0123456789abcdef' }).verify(session.token), null);
  now += 1001;
  assert.equal(auth.verify(session.token), null);
});

test('cinco PIN mal bloquean ese origen por cinco minutos', () => {
  let now = 0;
  const auth = createAuth({ pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', now: () => now });
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(auth.login('0000', 'Caro', 'ip').error, 'PIN_INVALID');
  assert.equal(auth.login('birra-fria-26', 'Caro', 'ip').error, 'LOCKED');
  assert.ok(auth.login('birra-fria-26', 'Caro', 'otra-ip').token);
  now += 5 * 60 * 1000;
  assert.ok(auth.login('birra-fria-26', 'Caro', 'ip').token);
});

test('sin PIN configurado nadie ingresa', () => {
  assert.equal(createAuth({ pin: '', secret: 'firma-de-prueba-0123456789abcdef-larga' }).login('', 'Caro', 'ip').error, 'PIN_INVALID');
});
