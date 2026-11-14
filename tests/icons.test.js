import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const web = new URL('../web/', import.meta.url);

for (const [page, name] of [['index.html', 'Verdel'], ['moza.html', 'Salón Verdel'], ['mesas.html', 'Mesas Verdel']]) {
  test(`${page} lleva el vaso de Verdel como ícono al agregarlo a la pantalla de inicio`, () => {
    const html = readFileSync(new URL(page, web), 'utf8');
    const touch = html.match(/<link rel="apple-touch-icon" href="([^"]+)">/);
    const icon = html.match(/<link rel="icon" href="([^"]+)" type="image\/svg\+xml">/);
    assert.ok(touch && existsSync(new URL(touch[1], web)));
    assert.ok(icon && existsSync(new URL(icon[1], web)));
    assert.match(html, new RegExp(`<meta name="apple-mobile-web-app-title" content="${name}">`));
  });
}

test('el ícono para iPhone es un PNG de 180 por 180', () => {
  const png = readFileSync(new URL('apple-touch-icon.png', web));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [180, 180]);
});
