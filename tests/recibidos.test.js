import test from 'node:test';
import assert from 'node:assert/strict';
import { partyDate, sourceTag, couponCode, groupMessage, reservationMessage, whatsappLink } from '../web/recibidos-text.js';

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

test('la reserva lleva día, cantidad y código, y omite lo que quedó vacío', () => {
  const text = reservationMessage({ name: ' Sofi ', degree: '', date: '2026-11-28', time: '21:30', people: '6', note: '' }, 'VD-FA-ABCD');
  assert.match(text, /Nombre: Sofi\n/);
  assert.match(text, /Día: sábado 28\/11\/2026 a las 21:30/);
  assert.match(text, /Somos: 6/);
  assert.match(text, /Código de la promo: VD-FA-ABCD$/);
  assert.doesNotMatch(text, /Se recibe de|Comentario/);
});

test('sin teléfono cargado no se arma un enlace de WhatsApp roto', () => {
  assert.equal(whatsappLink('', 'hola'), null);
  assert.equal(whatsappLink('5493815551234', 'a b'), 'https://wa.me/5493815551234?text=a%20b');
});
