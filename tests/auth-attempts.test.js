import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuth } from '../server/auth.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga' };
const lock = (auth, origin) => {
  for (let attempt = 0; attempt < 2; attempt++) auth.checkPin('0000', origin);
};

test('al llenarse, los intentos vencidos se barren antes de soltar un bloqueo vigente', () => {
  let now = 0;
  const auth = createAuth({ ...keys, now: () => now, maxAttempts: 2, lockMs: 1000, maxOrigins: 2 });
  lock(auth, 'vieja');
  now = 2000;
  lock(auth, 'vigente');
  lock(auth, 'nueva');
  assert.equal(auth.checkPin('0000', 'vigente').error, 'LOCKED');
  assert.equal(auth.checkPin('0000', 'nueva').error, 'LOCKED');
});

test('si todos siguen vigentes, se suelta el origen que falló hace más tiempo y no el último', () => {
  let now = 0;
  const auth = createAuth({ ...keys, now: () => now, maxAttempts: 2, lockMs: 1000, maxOrigins: 2 });
  lock(auth, 'primera');
  now = 10;
  lock(auth, 'segunda');
  now = 20;
  lock(auth, 'tercera');
  assert.equal(auth.checkPin('0000', 'segunda').error, 'LOCKED');
  assert.equal(auth.checkPin('0000', 'tercera').error, 'LOCKED');
  assert.equal(auth.checkPin('0000', 'primera').error, 'PIN_INVALID');
});

test('una inundación de orígenes frena los ingresos un rato y después la moza entra con el PIN', () => {
  let now = 0;
  const auth = createAuth({ ...keys, now: () => now });
  for (let index = 0; index < 30000; index++) auth.checkPin('0000', `10.${index >> 16}.${(index >> 8) & 255}.${index & 255}`);
  now += 15 * 60 * 1000;
  assert.ok(auth.checkPin('birra-fria-26', 'celular-de-caro').ok);
});
