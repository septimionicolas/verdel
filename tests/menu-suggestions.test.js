import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRINK_SECTIONS, FOOD_SECTIONS, PAIRINGS, SECTIONS, buildOptionIndex } from '../web/menu.js';

const optionIndex = buildOptionIndex();
const sectionOf = new Map(SECTIONS.flatMap((section) => section.items.map((item) => [item.code, section.id])));

test('cada sección de la carta es comida o bebida, nunca las dos', () => {
  for (const section of SECTIONS) {
    assert.equal(FOOD_SECTIONS.includes(section.id) + DRINK_SECTIONS.includes(section.id), 1, section.id);
  }
});

test('cada maridaje sale de una comida de la carta y apunta a una bebida que existe', () => {
  assert.ok(Object.keys(PAIRINGS).length > 0);
  for (const [code, pairing] of Object.entries(PAIRINGS)) {
    assert.ok(FOOD_SECTIONS.includes(sectionOf.get(code)), `${code} no es una comida`);
    assert.ok(optionIndex.has(pairing.drink), `${pairing.drink} no está en la carta`);
    assert.ok(DRINK_SECTIONS.includes(sectionOf.get(optionIndex.get(pairing.drink).item.code)), `${pairing.drink} no es una bebida`);
    assert.ok(pairing.food.trim(), code);
  }
});
