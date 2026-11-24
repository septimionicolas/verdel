import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex, formatAmount } from '../web/menu.js';
import { decodeOrder, encodeOrder, priceOrder, tableLabel } from '../web/order-code.js';

const optionIndex = buildOptionIndex();

test('un pedido se codifica, se lee y se valoriza con los precios de la carta', () => {
  const code = encodeOrder(7, [{ key: 'no1', quantity: 2 }, { key: 'pe0', quantity: 1 }, { key: 'cp0', quantity: 1 }]);
  assert.equal(code, 'v1.7.no1x2-pe0x1-cp0x1');
  const order = priceOrder(optionIndex, decodeOrder(code), VENUE.tableCount);
  assert.equal(order.table, 7);
  assert.equal(order.totalCents, 8100000);
  assert.equal(formatAmount(order.totalCents), '81.000');
  assert.deepEqual(order.lines[2].kitchen, [{ station: 'pizzas', label: 'Pizza común' }]);
  assert.deepEqual(order.lines[0].kitchen, []);
});

test('las líneas repetidas se suman y la barra es la mesa 0', () => {
  assert.deepEqual(decodeOrder('v1.0.no0x1-no0x2').lines, [{ key: 'no0', quantity: 3 }]);
  assert.equal(tableLabel(0), 'Barra');
  assert.equal(tableLabel(12), 'Mesa 12');
});

test('un código roto, un producto que no existe o una mesa de más se rechazan', () => {
  for (const code of ['', 'v2.7.no1x2', 'v1.7.', 'v1.7.no1x0', 'v1.7.no1x2;drop', 'v1.777.no1x1']) {
    assert.throws(() => decodeOrder(code), /ORDER_CODE_INVALID/);
  }
  assert.throws(() => priceOrder(optionIndex, decodeOrder('v1.7.zz9x1'), VENUE.tableCount), /PRODUCT_UNKNOWN/);
  assert.throws(() => priceOrder(optionIndex, decodeOrder('v1.31.no1x1'), VENUE.tableCount), /TABLE_UNKNOWN/);
});

test('cada promo cuesta menos que sus partes por separado', () => {
  for (const entry of optionIndex.values()) {
    if (entry.option.listCents !== undefined) assert.ok(entry.option.listCents > entry.option.priceCents, entry.name);
  }
  assert.equal(optionIndex.get('em1').option.listCents, 12 * optionIndex.get('em0').option.priceCents);
  assert.equal(optionIndex.get('no1').option.listCents, 3 * optionIndex.get('no0').option.priceCents);
  assert.equal(optionIndex.get('cp0').option.listCents, optionIndex.get('pc0').option.priceCents + optionIndex.get('no0').option.priceCents);
});
