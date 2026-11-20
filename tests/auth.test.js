import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuth, newToken } from '../server/auth.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', setupKey: 'clave-de-vincular-2026' };

test('el token es azar sin punto y en el log solo queda su huella, que cambia con SESSION_SECRET', () => {
  const token = newToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(newToken(), token);
  const auth = createAuth(keys);
  assert.equal(auth.hashToken(token), auth.hashToken(token));
  assert.notEqual(auth.hashToken(token), token);
  assert.notEqual(createAuth({ ...keys, secret: 'otra-firma-de-prueba-0123456789abcdef' }).hashToken(token), auth.hashToken(token));
});

test('cinco PIN mal bloquean ese origen por cinco minutos', () => {
  let now = 0;
  const auth = createAuth({ ...keys, now: () => now });
  for (let attempt = 0; attempt < 5; attempt++) assert.equal(auth.checkPin('0000', 'ip').error, 'PIN_INVALID');
  assert.equal(auth.checkPin(keys.pin, 'ip').error, 'LOCKED');
  assert.ok(auth.checkPin(keys.pin, 'otra-ip').ok);
  now += 5 * 60 * 1000;
  assert.ok(auth.checkPin(keys.pin, 'ip').ok);
});

test('la clave de instalación mal suma al mismo bloqueo que el PIN', () => {
  const auth = createAuth({ ...keys, now: () => 0 });
  for (let attempt = 0; attempt < 3; attempt++) auth.checkPin('0000', 'ip');
  assert.equal(auth.checkKey('mala', 'ip').error, 'KEY_INVALID');
  assert.equal(auth.checkKey('mala', 'ip').error, 'KEY_INVALID');
  assert.equal(auth.checkKey(keys.setupKey, 'ip').error, 'LOCKED');
  assert.equal(auth.checkPin(keys.pin, 'ip').error, 'LOCKED');
  assert.ok(auth.checkKey(keys.setupKey, 'otra-ip').ok);
});

test('desbloquear levanta los bloqueos por origen y el freno general', () => {
  const auth = createAuth({ ...keys, now: () => 0, freezeFailures: 6, freezeOrigins: 2 });
  for (let attempt = 0; attempt < 6; attempt++) auth.checkPin('0000', `ip-${attempt % 2}`);
  assert.equal(auth.checkPin(keys.pin, 'celular-nuevo').error, 'LOCKED');
  auth.unlockAll();
  assert.ok(auth.checkPin(keys.pin, 'celular-nuevo').ok);
  auth.checkPin('0000', 'ip-2');
  assert.ok(auth.checkPin(keys.pin, 'celular-nuevo').ok);
  for (let attempt = 0; attempt < 5; attempt++) auth.checkPin('0000', 'bar');
  auth.unlockAll();
  assert.ok(auth.checkPin(keys.pin, 'bar').ok);
});

test('sin PIN o sin clave configurada nadie ingresa', () => {
  const auth = createAuth({ pin: '', secret: keys.secret, setupKey: '' });
  assert.equal(auth.checkPin('', 'ip').error, 'PIN_INVALID');
  assert.equal(auth.checkKey('', 'ip').error, 'KEY_INVALID');
});
