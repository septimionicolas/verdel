import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuth } from '../server/auth.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga' };
const minutes = (count) => count * 60 * 1000;
const fail = (auth, origin, times = 1) => {
  for (let attempt = 0; attempt < times; attempt++) auth.checkPin('0000', origin);
};

test('cada bloqueo seguido del mismo origen dura el doble, con techo de una hora', () => {
  let now = 0;
  const auth = createAuth({ ...keys, now: () => now });
  const lengths = [];
  fail(auth, 'bar', 5);
  for (let lock = 0; lock < 7; lock++) {
    const start = now;
    while (auth.checkPin('0000', 'bar').error === 'LOCKED') now += minutes(1);
    lengths.push((now - start) / minutes(1));
    fail(auth, 'bar', 4);
  }
  assert.deepEqual(lengths, [5, 10, 20, 40, 60, 60, 60]);
});

test('entrar bien desde ese origen vuelve el bloqueo a cinco minutos', () => {
  let now = 0;
  const auth = createAuth({ ...keys, now: () => now });
  fail(auth, 'bar', 5);
  now += minutes(5);
  fail(auth, 'bar', 5);
  now += minutes(10);
  assert.ok(auth.checkPin(keys.pin, 'bar').ok);
  fail(auth, 'bar', 5);
  now += minutes(5);
  assert.ok(auth.checkPin(keys.pin, 'bar').ok);
});

test('veinte ingresos fallidos en diez minutos avisan una sola vez por ventana, con cuántos y desde cuántas direcciones', () => {
  let now = 0;
  const alarms = [];
  const auth = createAuth({ ...keys, now: () => now, notify: (alarm) => alarms.push(alarm) });
  for (let origin = 0; origin < 10; origin++) fail(auth, `10.0.0.${origin}`, 2);
  assert.deepEqual(alarms, [{ kind: 'attempts', failures: 20, origins: 10, windowMinutes: 10 }]);
  for (let origin = 10; origin < 15; origin++) fail(auth, `10.0.0.${origin}`, 2);
  assert.equal(alarms.length, 1);
  now += minutes(10);
  for (let origin = 0; origin < 20; origin++) fail(auth, `10.0.1.${origin}`);
  assert.equal(alarms.length, 2);
  assert.deepEqual(alarms[1], { kind: 'attempts', failures: 20, origins: 20, windowMinutes: 10 });
});

test('doscientos fallidos en una hora frenan los ingresos nuevos quince minutos', () => {
  let now = 0;
  const alarms = [];
  const auth = createAuth({ ...keys, now: () => now, notify: (alarm) => alarms.push(alarm) });
  for (let origin = 0; origin < 100; origin++) {
    fail(auth, `10.1.0.${origin}`, 2);
    now += 30 * 1000;
  }
  assert.deepEqual(alarms.at(-1), { kind: 'frozen', failures: 200, origins: 100, windowMinutes: 60, frozenMinutes: 15 });
  assert.equal(alarms.filter((alarm) => alarm.kind === 'frozen').length, 1);
  assert.equal(auth.checkPin(keys.pin, 'celular-de-marta').error, 'LOCKED');
  now += minutes(15);
  assert.ok(auth.checkPin(keys.pin, 'celular-de-marta').ok);
});

test('bloqueado o frenado, el PIN correcto y uno mal reciben la misma respuesta y no cuentan', () => {
  let now = 0;
  const alarms = [];
  const auth = createAuth({ ...keys, now: () => now, notify: (alarm) => alarms.push(alarm), alertFailures: 6 });
  fail(auth, 'bar', 5);
  assert.deepEqual(auth.checkPin(keys.pin, 'bar'), auth.checkPin('0000', 'bar'));
  for (let attempt = 0; attempt < 20; attempt++) auth.checkPin('0000', 'bar');
  assert.equal(alarms.length, 0);
});
