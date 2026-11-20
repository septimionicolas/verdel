import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';

const MINUTE = 60 * 1000;
const v2 = (nonce, rest) => `v2.${nonce.padEnd(20, 'a')}.${rest}`;
const open = () => {
  const clock = { now: Date.parse('2026-11-15T01:10:00Z') };
  const store = memoryEventStore(() => new Date(clock.now));
  const service = createService({ store, telegram: null, optionIndex: buildOptionIndex(), venue: VENUE, now: () => clock.now });
  return { clock, store, service, confirm: (code, force = false) => service.confirmOrder({ code, staff: 'Caro', force }) };
};

test('el nonce de un pedido anulado no se puede usar de nuevo, ni con force ni en otra noche, ni después de reiniciar', async () => {
  const bar = open();
  const code = v2('anulado', '4.no1x1');
  const first = await bar.confirm(code);
  await bar.service.voidOrder(bar.service.state.nights[0].orders[0].id, 'Caro');
  assert.equal(bar.service.state.nights[0].orders[0].status, 'voided');
  assert.deepEqual(await bar.confirm(code, true), { error: 'ORDER_ALREADY_SENT', number: first.number, reason: 'same_code' });
  await bar.service.closeNight('Dueño');
  bar.clock.now += 24 * 60 * MINUTE;
  assert.equal((await bar.confirm(code, true)).reason, 'same_code');
  const restarted = createService({ store: bar.store, telegram: null, optionIndex: buildOptionIndex(), venue: VENUE, now: () => bar.clock.now });
  assert.equal((await restarted.confirmOrder({ code, staff: 'Caro', force: true })).reason, 'same_code');
});

test('otra ronda igual avisa durante diez minutos y a los once entra sin aviso', async () => {
  const bar = open();
  assert.equal((await bar.confirm(v2('rondauno', '4.no1x1-pe0x1'))).number, 1);
  bar.clock.now += 10 * MINUTE - 1000;
  assert.equal((await bar.confirm(v2('rondados', '4.pe0x1-no1x1'))).reason, 'similar');
  bar.clock.now += MINUTE + 1000;
  assert.equal((await bar.confirm(v2('rondados', '4.pe0x1-no1x1'))).number, 2);
});
