import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig, settingsState, weakSettings } from '../server/config.js';

const strong = { STAFF_PIN: 'mate-con-burbujas', SETUP_KEY: 'vincular-grupos-del-bar', SESSION_SECRET: 'firma-larga-de-prueba-0123456789abcdef' };
const configWith = (overrides) => readConfig({ ...strong, ...overrides });

test('con claves fuertes no hay ninguna débil y el salón queda listo', () => {
  const config = configWith({});
  assert.deepEqual(weakSettings(config), []);
  assert.deepEqual(settingsState(config), { missing: [], weak: [], ready: true, setupKey: strong.SETUP_KEY });
});

test('un PIN de fábrica, corto, repetido, en escalera o de pocos números es débil', () => {
  for (const pin of ['1234', '0000', '12345678', 'password', 'admin', 'verdel', 'changeme', 'Password', 'VERDEL2026', 'aaaaaaaaaa', 'abcdefgh', '87654321', '1357913579', 'corto']) {
    assert.deepEqual(weakSettings(configWith({ STAFF_PIN: pin })), ['STAFF_PIN'], pin);
  }
  assert.deepEqual(weakSettings(configWith({ STAFF_PIN: '482915736041' })), []);
  assert.deepEqual(weakSettings(configWith({ STAFF_PIN: 'birra-fria' })), []);
});

test('SETUP_KEY pide 16 caracteres y SESSION_SECRET 32', () => {
  assert.deepEqual(weakSettings(configWith({ SETUP_KEY: 'clave-de-15-car' })), ['SETUP_KEY']);
  assert.deepEqual(weakSettings(configWith({ SETUP_KEY: 'clave-de-16-cara' })), []);
  assert.deepEqual(weakSettings(configWith({ SESSION_SECRET: 'x'.repeat(10) + 'firma-de-31-caracter' })), ['SESSION_SECRET']);
  assert.deepEqual(weakSettings(configWith({ SESSION_SECRET: 'b'.repeat(40) })), ['SESSION_SECRET']);
});

test('dos claves iguales son débiles las dos', () => {
  const same = 'una-sola-clave-para-todo-el-bar-2026';
  assert.deepEqual(weakSettings(configWith({ SETUP_KEY: same, SESSION_SECRET: same })), ['SETUP_KEY', 'SESSION_SECRET']);
  assert.deepEqual(weakSettings(configWith({ STAFF_PIN: same, SETUP_KEY: same, SESSION_SECRET: same })), ['STAFF_PIN', 'SETUP_KEY', 'SESSION_SECRET']);
});

test('con una clave débil el salón no queda listo y /vincular queda sin clave', () => {
  const state = settingsState(configWith({ STAFF_PIN: '1234' }));
  assert.deepEqual(state, { missing: [], weak: ['STAFF_PIN'], ready: false, setupKey: '' });
  const missing = settingsState(configWith({ SESSION_SECRET: '' }));
  assert.deepEqual(missing, { missing: ['SESSION_SECRET'], weak: [], ready: false, setupKey: '' });
});
