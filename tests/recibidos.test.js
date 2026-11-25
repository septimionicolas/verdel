import test from 'node:test';
import assert from 'node:assert/strict';
import { headline, partyDate, sourceTag, couponCode, groupMessage } from '../web/recibidos-text.js';

test('el cartel arma el título según el género elegido', () => {
  assert.equal(headline({ degree: 'lic', gender: 'f' }), '¡Soy licenciada!');
  assert.equal(headline({ degree: 'med', gender: 'm' }), '¡Soy médico!');
  assert.equal(headline({ degree: 'other', gender: 'x', other: '' }), '¡Me recibí!');
  assert.equal(headline({ degree: 'other', gender: 'f', other: '  Licenciada en   Nutrición ' }), '¡Soy licenciada en nutrición!');
});

test('la fecha del festejo sale con día de la semana y sin corrimiento de zona', () => {
  assert.equal(partyDate('2026-11-28'), 'sábado 28/11/2026');
  assert.equal(partyDate(''), '');
});

test('el código del cupón lleva el punto de reparto saneado', () => {
  assert.equal(sourceTag('?v=fa'), 'FA');
  assert.equal(sourceTag('?v=wa'), 'WA');
  assert.equal(sourceTag('?v=fac-med'), 'WEB');
  assert.equal(sourceTag('?v=<b>'), 'WEB');
  assert.equal(sourceTag(''), 'WEB');
  assert.match(couponCode('FA', new Uint8Array([0, 1, 2, 30])), /^VD-FA-[A-Z2-9]{4}$/);
});

test('el mensaje al grupo invita a Verdel con el enlace medido', () => {
  const text = groupMessage({ name: 'Sofi', date: '2026-11-28' }, 'https://x.test/recibidos.html?v=wa');
  assert.match(text, /Se recibe Sofi/);
  assert.match(text, /sábado 28\/11\/2026/);
  assert.match(text, /\?v=wa$/);
});
