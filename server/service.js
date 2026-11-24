import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeOrder, priceOrder } from '../web/order-code.js';
import { applyEvent, clockLabel, currentNight, findByNonce, findDuplicate, findOrder, findSession, nightStats, openSessions, replay, stationsOf, trackingState } from './night.js';
import { createLimiter } from './limiter.js';
import { kitchenKeyboard, kitchenText, orderKeyboard, orderText, ownerLine, readyAlert, securityText, summaryText } from './messages.js';
import { NARRATIVE_INSTRUCTIONS, narrativeFacts, narrativeMessage } from './narrative.js';
import { nightTitle, renderReport } from './report.js';

export function createService({ store, telegram, stationTelegrams = {}, advisor = null, optionIndex, venue, reportsDir = null, now = Date.now, log = () => {}, alertsPerHour = 6 }) {
  const state = replay(store.events);
  const alertLimiter = createLimiter({ limit: alertsPerHour, windowMs: 60 * 60 * 1000, now, maxKeys: 1 });
  const time = clockLabel(venue.timeZone);
  const record = (event) => applyEvent(state, store.append(event));
  const chatOf = (role) => state.bindings[role]?.chatId;
  const clientOf = (role) => stationTelegrams[role] || telegram;

  async function send(role, text, extra = {}) {
    const chatId = chatOf(role);
    const client = clientOf(role);
    if (!client || !chatId) return null;
    try {
      return await client.call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
    } catch (error) {
      log('telegram_send_failed', { role, message: error.message });
      return null;
    }
  }

  async function refresh(order, askingVoid = false) {
    const edits = [];
    const salon = order.messages.salon;
    if (salon) edits.push({ ...salon, client: clientOf('salon'), text: orderText(order, time), reply_markup: orderKeyboard(order, askingVoid) });
    for (const station of stationsOf(order)) {
      const message = order.messages[station];
      if (message) edits.push({ ...message, client: clientOf(station), text: kitchenText(order, station, time), reply_markup: kitchenKeyboard(order, station) });
    }
    for (const edit of edits.filter((item) => item.client)) {
      await edit.client.call('editMessageText', { chat_id: edit.chatId, message_id: edit.messageId, text: edit.text, parse_mode: 'HTML', reply_markup: edit.reply_markup }).catch((error) => log('telegram_edit_failed', { message: error.message }));
    }
  }

  async function confirmOrder({ code, staff, sessionId = null, force = false }) {
    let decoded;
    let priced;
    try {
      decoded = decodeOrder(code);
      priced = priceOrder(optionIndex, decoded, venue.tableCount);
    } catch (error) {
      return { error: error.message };
    }
    const used = findByNonce(state, decoded.nonce);
    if (used) return { error: 'ORDER_ALREADY_SENT', number: used.number, reason: 'same_code' };
    const duplicate = force ? null : findDuplicate(state, decoded, now());
    if (duplicate) return { error: 'ORDER_ALREADY_SENT', number: duplicate.number, reason: 'similar' };

    const night = currentNight(state);
    const number = night.orders.length + 1;
    const orderId = `${night.number}-${number}`;
    record({ type: 'order_confirmed', orderId, number, table: priced.table, lines: priced.lines, totalCents: priced.totalCents, staff, sessionId, code, nonce: decoded.nonce });
    const order = findOrder(state, orderId);

    const sent = await send('salon', orderText(order, time), { reply_markup: orderKeyboard(order) });
    if (sent) record({ type: 'message_linked', orderId, role: 'salon', chatId: chatOf('salon'), messageId: sent.message_id });
    for (const station of stationsOf(order)) {
      const kitchen = await send(station, kitchenText(order, station, time), { reply_markup: kitchenKeyboard(order, station) });
      if (kitchen) record({ type: 'message_linked', orderId, role: station, chatId: chatOf(station), messageId: kitchen.message_id });
    }
    await send('owner', ownerLine('confirmed', order, `confirmó ${staff}`));
    return { number, totalCents: priced.totalCents, telegram: sent ? 'sent' : chatOf('salon') ? 'failed' : 'unbound' };
  }

  async function markReady(orderId, station, by) {
    const order = findOrder(state, orderId);
    if (!order || order.status === 'voided' || order.ready[station] || !stationsOf(order).includes(station)) return false;
    record({ type: 'kitchen_ready', orderId, station, by });
    await refresh(order);
    const reply = order.messages.salon ? { reply_parameters: { message_id: order.messages.salon.messageId, allow_sending_without_reply: true } } : {};
    await send('salon', readyAlert(order, station), reply);
    const minutes = Math.round((Date.parse(order.ready[station].at) - Date.parse(order.confirmedAt)) / 60000);
    await send('owner', ownerLine('ready', order, `${minutes} min`));
    return true;
  }

  async function transition(orderId, from, type, kind, by) {
    const order = findOrder(state, orderId);
    if (!order || order.status !== from) return false;
    record({ type, orderId, by });
    await refresh(order);
    await send('owner', ownerLine(kind, order, by));
    return true;
  }

  async function askVoid(orderId, asking) {
    const order = findOrder(state, orderId);
    if (!order || order.status !== 'open') return false;
    await refresh(order, asking);
    return true;
  }

  function bind(role, chatId, title, by) {
    record({ type: 'chat_bound', role, chatId, title, by });
  }

  function orderStatus(code) {
    const at = new Date(now()).toISOString();
    let decoded;
    try {
      decoded = decodeOrder(code);
    } catch (error) {
      if (error.message === 'ORDER_CODE_OLD') return { state: 'unknown', at };
      throw error;
    }
    const order = findByNonce(state, decoded.nonce);
    return order && order.code === code ? { state: trackingState(order), number: order.number, at } : { state: 'waiting', at };
  }

  async function securityAlert(alarm) {
    const sent = alertLimiter.take('owner') ? await send('owner', securityText(alarm)) : null;
    log('security_alert', { kind: alarm.kind, failures: alarm.failures, origins: alarm.origins, delivered: Boolean(sent) });
  }

  function startStaffSession({ tokenHash, name, method, hours, telegramUserId = null, telegramName = null, approvedBy = null }) {
    const nowMs = now();
    if (telegramUserId !== null) {
      for (const old of openSessions(state, nowMs).filter((session) => session.telegramUserId === telegramUserId)) {
        record({ type: 'staff_session_ended', sessionId: old.sessionId, reason: 'replaced', by: name });
      }
    }
    const sessionId = randomBytes(8).toString('hex');
    const expiresAt = new Date(nowMs + hours * 60 * 60 * 1000).toISOString();
    const optional = Object.fromEntries(Object.entries({ telegramUserId, telegramName, approvedBy }).filter(([, value]) => value !== null));
    record({ type: 'staff_session_started', sessionId, tokenHash, name, ...optional, method, expiresAt });
    return state.sessions[tokenHash];
  }

  function endStaffSession(sessionId, reason, by) {
    const session = openSessions(state, now()).find((candidate) => candidate.sessionId === sessionId);
    if (!session) return false;
    record({ type: 'staff_session_ended', sessionId, reason, by });
    return true;
  }

  function endAllStaffSessions(by) {
    const count = openSessions(state, now()).length;
    record({ type: 'staff_sessions_ended_all', by });
    return count;
  }

  const stats = () => nightStats(currentNight(state), venue.timeZone);

  async function tellNight(closing, role) {
    if (!advisor || !telegram) return;
    try {
      const paragraph = narrativeMessage(await advisor.ask(NARRATIVE_INSTRUCTIONS, narrativeFacts(closing, venue.name), { maxTokens: 2000 }));
      if (!paragraph) return;
      await send('salon', paragraph);
      if (role === 'owner') await send('owner', paragraph);
    } catch (error) {
      log('advisor_failed', { message: error.message });
    }
  }

  async function closeNight(by) {
    const night = currentNight(state);
    if (!night.orders.length) return null;
    const closing = nightStats({ ...night, closedAt: new Date(now()).toISOString() }, venue.timeZone);
    const html = renderReport(closing, venue, time);
    const fileName = `cierre-${venue.name.toLowerCase()}-${nightTitle(closing, venue.timeZone).isoDate}-noche-${closing.number}.html`;
    if (reportsDir) {
      mkdirSync(reportsDir, { recursive: true });
      writeFileSync(join(reportsDir, fileName), html);
    }
    record({ type: 'night_closed', night: night.number, by });
    const summary = `${summaryText(closing, venue.name)}\nCerró ${by}.`;
    const role = chatOf('owner') ? 'owner' : 'salon';
    if (telegram && chatOf(role)) {
      await telegram.sendDocument(chatOf(role), fileName, html, 'Reporte de cierre: abrilo y usá «Imprimir → Guardar como PDF».').catch((error) => log('telegram_document_failed', { message: error.message }));
    }
    await send('salon', summary);
    if (role === 'owner') await send('owner', summary);
    await tellNight(closing, role);
    return { stats: closing, html, fileName };
  }

  return {
    state,
    time,
    stats,
    confirmOrder,
    orderStatus,
    markReady,
    askVoid,
    bind,
    closeNight,
    securityAlert,
    send,
    chatOf,
    startStaffSession,
    endStaffSession,
    endAllStaffSessions,
    staffSession: (tokenHash) => findSession(state, tokenHash, now()),
    openStaffSessions: () => openSessions(state, now()),
    denyStaffLogin: ({ name, by, reason }) => record({ type: 'staff_login_denied', name, by, reason }),
    recordEmergencyLogin: (sessionId, name) => record({ type: 'staff_login_emergency', sessionId, name }),
    recordUnlock: (by) => record({ type: 'login_unlocked', by }),
    charge: (orderId, by) => transition(orderId, 'open', 'order_charged', 'charged', by),
    revertCharge: (orderId, by) => transition(orderId, 'charged', 'charge_reverted', 'uncharged', by),
    voidOrder: (orderId, by) => transition(orderId, 'open', 'order_voided', 'voided', by),
  };
}
