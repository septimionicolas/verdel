import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findSession, openSessions, replay } from '../server/night.js';

const at = (minutes) => new Date(Date.parse('2026-11-20T23:00:00Z') + minutes * 60000).toISOString();
const started = (sessionId, tokenHash, extra = {}) => ({ type: 'staff_session_started', sessionId, tokenHash, name: 'Ana', method: 'telegram', at: at(0), expiresAt: at(720), ...extra });

test('una sesión del log vale hasta su vencimiento y después no', () => {
  const state = replay([started('s1', 'h1')]);
  assert.equal(findSession(state, 'h1', Date.parse(at(60))).sessionId, 's1');
  assert.equal(findSession(state, 'h1', Date.parse(at(720))), null);
  assert.equal(findSession(state, 'otro', Date.parse(at(60))), null);
});

test('el cierre de la noche termina las sesiones abiertas antes y deja vivas las de después', () => {
  const state = replay([started('s1', 'h1'), { type: 'night_closed', at: at(300), by: 'Septi' }, started('s2', 'h2', { at: at(310), expiresAt: at(1000) })]);
  assert.equal(findSession(state, 'h1', Date.parse(at(301))), null);
  assert.equal(state.sessions.h1.endReason, 'night_closed');
  assert.equal(findSession(state, 'h2', Date.parse(at(320))).sessionId, 's2');
});

test('cerrar una sesión, cerrar todas y la reconstrucción las respeta', () => {
  const events = [started('s1', 'h1'), started('s2', 'h2', { name: 'Caro' }), started('s3', 'h3', { name: 'Lu' }), { type: 'staff_session_ended', sessionId: 's1', reason: 'revoked', by: 'Juan', at: at(10) }];
  const state = replay(events);
  assert.equal(findSession(state, 'h1', Date.parse(at(20))), null);
  assert.deepEqual(openSessions(state, Date.parse(at(20))).map((session) => session.name), ['Caro', 'Lu']);
  const all = replay([...events, { type: 'staff_sessions_ended_all', by: 'Juan', at: at(30) }]);
  assert.deepEqual(openSessions(all, Date.parse(at(31))), []);
  assert.equal(all.sessions.h2.endReason, 'all');
});

test('un events.jsonl viejo sin sesiones se sigue leyendo y sus pedidos quedan sin sessionId', () => {
  const state = replay([{ type: 'chat_bound', role: 'salon', chatId: -1, title: 'Salón', at: at(0) }, { type: 'order_confirmed', orderId: 'o1', number: 1, table: 3, lines: [], totalCents: 0, staff: 'Caro', code: 'v1.3.abcx1', at: at(1) }]);
  assert.deepEqual(state.sessions, {});
  assert.equal(state.nights[0].orders[0].sessionId, null);
  const signed = replay([{ type: 'order_confirmed', orderId: 'o2', number: 1, table: 3, lines: [], totalCents: 0, staff: 'Ana', sessionId: 's1', code: 'v1.3.abcx1', at: at(1) }]);
  assert.equal(signed.nights[0].orders[0].sessionId, 's1');
});
