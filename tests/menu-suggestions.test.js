import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRINK_SECTIONS, FOOD_SECTIONS, PAIRINGS, ROUNDS, ROUND_QUESTIONS, SECTIONS, buildOptionIndex, pickRound } from '../web/menu.js';

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

test('las rondas cubren las 18 combinaciones de respuestas con productos de la carta', () => {
  const [people, hunger, taste] = ['people', 'hunger', 'taste'].map((id) => ROUND_QUESTIONS.find((question) => question.id === id).choices.map((choice) => choice.value));
  let combinations = 0;
  for (const p of people) {
    for (const h of hunger) {
      for (const t of taste) {
        const round = pickRound({ people: p, hunger: h, taste: t });
        assert.ok(round, `${p}/${h}/${t}`);
        assert.ok(round.phrase.trim());
        assert.ok(round.keys.length > 0);
        for (const key of round.keys) assert.ok(optionIndex.has(key), `${key} en ${p}/${h}/${t}`);
        combinations += 1;
      }
    }
  }
  assert.equal(combinations, 18);
});

test('una respuesta incompleta o inventada no elige ronda', () => {
  assert.equal(pickRound({ people: '2', hunger: 'snack' }), null);
  assert.equal(pickRound({ people: '2', hunger: 'phrase', taste: 'soft' }), null);
  assert.equal(pickRound({ people: '9', hunger: 'snack', taste: 'soft' }), null);
  assert.equal(pickRound(), null);
  assert.deepEqual(pickRound({ people: '2', hunger: 'snack', taste: 'soft' }), { phrase: ROUNDS.soft.phrase, keys: ['no0', 'pa2'] });
});
