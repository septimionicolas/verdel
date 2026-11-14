import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { encodeQr, qrSvg } from '../web/qr.js';

const fingerprint = (qr) => createHash('sha256').update(qr.modules.map((row) => row.map((dark) => (dark ? 1 : 0)).join('')).join('\n')).digest('hex');

test('el QR de una mesa no cambia: es el que se verificó con un lector real', () => {
  const qr = encodeQr('https://verdel.panelpro.tech/?mesa=7');
  assert.equal(qr.version, 3);
  assert.equal(qr.size, 29);
  assert.equal(fingerprint(qr), '496974804947ee1e509addda4c1d4faf9df2536bb48f4ca4403432efe86afbd8');
});

test('el tamaño crece con el texto y cada esquina lleva su patrón de búsqueda', () => {
  const small = encodeQr('HOLA');
  assert.equal(small.size, 21);
  for (const [x, y] of [[0, 0], [14, 0], [0, 14]]) {
    assert.equal(small.modules[y][x], true);
    assert.equal(small.modules[y + 1][x + 1], false);
    assert.equal(small.modules[y + 3][x + 3], true);
  }
  assert.equal(encodeQr('y'.repeat(200)).version, 10);
  assert.throws(() => encodeQr('y'.repeat(400)), /QR_TEXT_TOO_LONG/);
});

test('el SVG lleva el margen y los colores pedidos', () => {
  const svg = qrSvg('HOLA', { dark: '#0E2B21', light: '#F7EFDD', margin: 3 });
  assert.match(svg, /viewBox="0 0 27 27"/);
  assert.match(svg, /fill="#0E2B21"/);
});
