import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isModestDevice } from '../web/device.js';

test('el fondo animado sigue en celulares comunes, aunque el navegador diga 4 núcleos o no diga la memoria', () => {
  assert.equal(isModestDevice({ hardwareConcurrency: 4 }), false);
  assert.equal(isModestDevice({ hardwareConcurrency: 8, deviceMemory: 4 }), false);
  assert.equal(isModestDevice({}), false);
});

test('el fondo se apaga en celulares de verdad modestos', () => {
  assert.equal(isModestDevice({ hardwareConcurrency: 2 }), true);
  assert.equal(isModestDevice({ hardwareConcurrency: 8, deviceMemory: 2 }), true);
  assert.equal(isModestDevice({ hardwareConcurrency: 4, deviceMemory: 1 }), true);
});
