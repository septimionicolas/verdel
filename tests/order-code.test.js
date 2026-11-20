import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex, formatAmount } from '../web/menu.js';
import { MAX_LINES, contentKey, createNonceKeeper, decodeOrder, encodeOrder, newNonce, priceOrder, tableLabel } from '../web/order-code.js';
import { encodeQr } from '../web/qr.js';

const optionIndex = buildOptionIndex();
const NONCE = 'abcdefghij234567klmn';

test('un pedido se codifica, se lee y se valoriza con los precios de la carta', () => {
  const code = encodeOrder(7, [{ key: 'no1', quantity: 2 }, { key: 'pe0', quantity: 1 }, { key: 'cp0', quantity: 1 }], NONCE);
  assert.equal(code, `v2.${NONCE}.7.no1x2-pe0x1-cp0x1`);
  assert.equal(decodeOrder(code).nonce, NONCE);
  const order = priceOrder(optionIndex, decodeOrder(code), VENUE.tableCount);
  assert.equal(order.table, 7);
  assert.equal(order.totalCents, 6700000);
  assert.equal(formatAmount(order.totalCents), '67.000');
  assert.deepEqual(order.lines[2].kitchen, [{ station: 'pizzas', label: 'Pizza común' }]);
  assert.deepEqual(order.lines[0].kitchen, []);
});

test('las líneas repetidas se suman y la barra es la mesa 0', () => {
  assert.deepEqual(decodeOrder(`v2.${NONCE}.0.no0x1-no0x2`).lines, [{ key: 'no0', quantity: 3 }]);
  assert.equal(tableLabel(0), 'Barra');
  assert.equal(tableLabel(12), 'Mesa 12');
});

test('un código roto, un producto que no existe o una mesa de más se rechazan', () => {
  for (const code of ['', 'v2.7.no1x2', `v2.${NONCE}.7.`, `v2.${NONCE}.7.no1x0`, `v2.${NONCE}.7.no1x2;drop`, `v2.${NONCE}.777.no1x1`, 'v2.abcdefghij234567klm1.7.no1x1', 'v2.abcdefghij234567klm.7.no1x1', 'v1.7.', 'v1.7.no1x2;drop']) {
    assert.throws(() => decodeOrder(code), /ORDER_CODE_INVALID/, code);
  }
  assert.throws(() => priceOrder(optionIndex, decodeOrder(`v2.${NONCE}.7.zz9x1`), VENUE.tableCount), /PRODUCT_UNKNOWN/);
  assert.throws(() => priceOrder(optionIndex, decodeOrder(`v2.${NONCE}.31.no1x1`), VENUE.tableCount), /TABLE_UNKNOWN/);
});

test('cada promo cuesta menos que sus partes por separado', () => {
  for (const entry of optionIndex.values()) {
    if (entry.option.listCents !== undefined) assert.ok(entry.option.listCents > entry.option.priceCents, entry.name);
  }
  assert.equal(optionIndex.get('em1').option.listCents, 12 * optionIndex.get('em0').option.priceCents);
  assert.equal(optionIndex.get('no2').option.listCents, 3 * optionIndex.get('no0').option.priceCents);
  assert.equal(optionIndex.get('cp0').option.listCents, optionIndex.get('pc0').option.priceCents + optionIndex.get('no0').option.priceCents);
});

test('un código de la versión vieja se reconoce como viejo y no como roto', () => {
  for (const code of ['v1.7.no1x2-pe0x1', 'v1.0.fe0x2']) assert.throws(() => decodeOrder(code), /ORDER_CODE_OLD/);
});

test('cada nonce sale de 20 caracteres de a-z y 2-7, uniforme byte a byte, y sin generador al azar no hay código', () => {
  const bytes = (values) => ({ getRandomValues: (array) => { array.set(values); return array; } });
  assert.equal(newNonce(bytes(Array.from({ length: 20 }, (_, index) => index))), 'abcdefghijklmnopqrst');
  assert.equal(newNonce(bytes(Array.from({ length: 20 }, (_, index) => 224 + index + 12))), 'mnopqrstuvwxyz234567');
  assert.match(newNonce(), /^[a-z2-7]{20}$/);
  assert.notEqual(newNonce(), newNonce());
  assert.throws(() => newNonce(null), /NONCE_UNAVAILABLE/);
  assert.throws(() => newNonce({}), /NONCE_UNAVAILABLE/);
});

test('el celular reusa el nonce si muestra el mismo carrito y arma otro cuando el carrito cambia o se descarta', () => {
  const nonces = createNonceKeeper();
  const first = nonces.nonceFor('7.no1x2');
  assert.match(first, /^[a-z2-7]{20}$/);
  assert.equal(nonces.nonceFor('7.no1x2'), first);
  const changed = nonces.nonceFor('7.no1x3');
  assert.notEqual(changed, first);
  assert.notEqual(nonces.nonceFor('8.no1x3'), changed);
  const again = nonces.nonceFor('8.no1x3');
  nonces.forget();
  assert.notEqual(nonces.nonceFor('8.no1x3'), again);
  assert.notEqual(createNonceKeeper().nonceFor('7.no1x2'), first);
  assert.throws(() => createNonceKeeper(null).nonceFor('7.no1x2'), /NONCE_UNAVAILABLE/);
});

test('la misma mesa con las mismas líneas da el mismo contenido aunque cambien el nonce o el orden', () => {
  const first = decodeOrder(`v2.${NONCE}.7.no1x2-pe0x1`);
  const second = decodeOrder('v2.zzzzzzzzzzzzzzzzzzzz.7.pe0x1-no1x1-no1x1');
  assert.equal(contentKey(first), contentKey(second));
  assert.notEqual(contentKey(first), contentKey(decodeOrder(`v2.${NONCE}.8.no1x2-pe0x1`)));
  assert.notEqual(contentKey(first), contentKey(decodeOrder(`v2.${NONCE}.7.no1x3-pe0x1`)));
});

test('el código más largo posible entra en el QR junto con una dirección de moza.html de 74 caracteres', () => {
  const keys = [...optionIndex.keys()].slice(0, MAX_LINES);
  const longest = encodeOrder(99, keys.map((key) => ({ key, quantity: 99 })), 'z'.repeat(20));
  assert.equal(decodeOrder(longest).lines.length, MAX_LINES);
  const prefix = `https://${'x'.repeat(74 - 'https://'.length - '/moza.html'.length)}/moza.html`;
  assert.equal(prefix.length, 74);
  assert.doesNotThrow(() => encodeQr(`${prefix}#${longest}`));
  const tooMany = encodeOrder(7, [...optionIndex.keys()].slice(0, MAX_LINES + 1).map((key) => ({ key, quantity: 1 })), NONCE);
  assert.throws(() => decodeOrder(tooMany), /ORDER_CODE_INVALID/);
});
