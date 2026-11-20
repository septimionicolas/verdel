import { STATIONS } from '../web/menu.js';

export const ROLE_NAMES = { salon: 'Salón', pizzas: STATIONS.pizzas, house: STATIONS.house, owner: 'Dueño' };
export const ROLE_ALIASES = { salon: 'salon', pizzas: 'pizzas', cocina: 'house', dueno: 'owner' };
const HALF_HOUR_MS = 30 * 60 * 1000;

function newNight(number) {
  return { number, orders: [], closedAt: null, closedBy: null };
}

export function initialState() {
  return { bindings: {}, nights: [newNight(1)], sessions: {} };
}

function endSession(session, at, reason) {
  if (!session.endedAt) Object.assign(session, { endedAt: at, endReason: reason });
}

const endOpenSessions = (state, at, reason) => Object.values(state.sessions).forEach((session) => endSession(session, at, reason));

export function findSession(state, tokenHash, nowMs) {
  const session = Object.hasOwn(state.sessions, tokenHash) ? state.sessions[tokenHash] : null;
  return session && !session.endedAt && nowMs < Date.parse(session.expiresAt) ? session : null;
}

export const openSessions = (state, nowMs) => Object.values(state.sessions).filter((session) => !session.endedAt && nowMs < Date.parse(session.expiresAt));

const SESSION_EVENTS = {
  staff_session_started(state, event) {
    state.sessions[event.tokenHash] = {
      sessionId: event.sessionId,
      tokenHash: event.tokenHash,
      name: event.name,
      telegramUserId: event.telegramUserId ?? null,
      telegramName: event.telegramName ?? null,
      method: event.method,
      approvedBy: event.approvedBy ?? null,
      startedAt: event.at,
      expiresAt: event.expiresAt,
      endedAt: null,
      endReason: null,
    };
  },
  staff_session_ended(state, event) {
    const session = Object.values(state.sessions).find((candidate) => candidate.sessionId === event.sessionId);
    if (session) endSession(session, event.at, event.reason);
  },
  staff_sessions_ended_all(state, event) {
    endOpenSessions(state, event.at, 'all');
  },
};

export const currentNight = (state) => state.nights[state.nights.length - 1];

export function findOrder(state, orderId) {
  for (const night of state.nights) {
    const order = night.orders.find((candidate) => candidate.id === orderId);
    if (order) return order;
  }
  return null;
}

export function applyEvent(state, event) {
  if (event.type === 'chat_bound') {
    state.bindings[event.role] = { chatId: event.chatId, title: event.title };
    return state;
  }
  if (event.type === 'order_confirmed') {
    currentNight(state).orders.push({
      id: event.orderId,
      number: event.number,
      table: event.table,
      lines: event.lines,
      totalCents: event.totalCents,
      staff: event.staff,
      sessionId: event.sessionId ?? null,
      code: event.code,
      confirmedAt: event.at,
      status: 'open',
      chargedAt: null,
      chargedBy: null,
      voidedAt: null,
      voidedBy: null,
      ready: {},
      messages: {},
    });
    return state;
  }
  if (event.type === 'night_closed') {
    const night = currentNight(state);
    night.closedAt = event.at;
    night.closedBy = event.by;
    endOpenSessions(state, event.at, 'night_closed');
    state.nights.push(newNight(night.number + 1));
    return state;
  }
  if (Object.hasOwn(SESSION_EVENTS, event.type)) {
    SESSION_EVENTS[event.type](state, event);
    return state;
  }
  const order = findOrder(state, event.orderId);
  if (!order) return state;
  if (event.type === 'message_linked') order.messages[event.role] = { chatId: event.chatId, messageId: event.messageId };
  if (event.type === 'kitchen_ready') order.ready[event.station] = { at: event.at, by: event.by };
  if (event.type === 'order_charged') Object.assign(order, { status: 'charged', chargedAt: event.at, chargedBy: event.by });
  if (event.type === 'charge_reverted') Object.assign(order, { status: 'open', chargedAt: null, chargedBy: null });
  if (event.type === 'order_voided') Object.assign(order, { status: 'voided', voidedAt: event.at, voidedBy: event.by });
  return state;
}

export const replay = (events) => events.reduce(applyEvent, initialState());

export function stationsOf(order) {
  return [...new Set(order.lines.flatMap((line) => line.kitchen.map((part) => part.station)))];
}

export function kitchenLines(order, station) {
  return order.lines.flatMap((line) => line.kitchen.filter((part) => part.station === station).map((part) => ({ quantity: line.quantity, label: part.label })));
}

export function findDuplicate(state, code, nowMs, windowMs = 10 * 60 * 1000) {
  return currentNight(state).orders.find((order) => order.code === code && order.status !== 'voided' && nowMs - Date.parse(order.confirmedAt) < windowMs) || null;
}

export function findLatestByCode(state, code, sinceMs = null) {
  const orders = currentNight(state).orders;
  for (let index = orders.length - 1; index >= 0; index -= 1) {
    const order = orders[index];
    if (order.code === code && (sinceMs === null || Date.parse(order.confirmedAt) >= sinceMs)) return order;
  }
  return null;
}

export function trackingState(order) {
  if (order.status === 'voided') return 'voided';
  const stations = stationsOf(order);
  if (!stations.length) return 'received';
  return stations.every((station) => order.ready[station]) ? 'ready' : 'cooking';
}

export function clockLabel(timeZone) {
  const formatter = new Intl.DateTimeFormat('es-AR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return (instant) => formatter.format(new Date(instant));
}

export function nightStats(night, timeZone) {
  const time = clockLabel(timeZone);
  const valid = night.orders.filter((order) => order.status !== 'voided');
  const voided = night.orders.filter((order) => order.status === 'voided');
  const charged = valid.filter((order) => order.status === 'charged');
  const pending = valid.filter((order) => order.status === 'open');
  const sum = (orders) => orders.reduce((total, order) => total + order.totalCents, 0);
  const unitsOf = (order) => order.lines.reduce((total, line) => total + line.quantity, 0);

  const tables = new Map();
  const products = new Map();
  const staff = new Map();
  const buckets = new Map();
  for (const order of valid) {
    const table = tables.get(order.table) || { table: order.table, orders: 0, units: 0, totalCents: 0, chargedCents: 0, pendingCents: 0 };
    table.orders += 1;
    table.units += unitsOf(order);
    table.totalCents += order.totalCents;
    table[order.status === 'charged' ? 'chargedCents' : 'pendingCents'] += order.totalCents;
    tables.set(order.table, table);

    for (const line of order.lines) {
      const product = products.get(line.name) || { name: line.name, units: 0, cents: 0 };
      product.units += line.quantity;
      product.cents += line.quantity * line.unitCents;
      products.set(line.name, product);
    }

    const person = staff.get(order.staff) || { name: order.staff, orders: 0, cents: 0 };
    person.orders += 1;
    person.cents += order.totalCents;
    staff.set(order.staff, person);

    const start = Math.floor(Date.parse(order.confirmedAt) / HALF_HOUR_MS) * HALF_HOUR_MS;
    const bucket = buckets.get(start) || { start, label: time(start), orders: 0, cents: 0 };
    bucket.orders += 1;
    bucket.cents += order.totalCents;
    buckets.set(start, bucket);
  }

  const halfHours = [];
  const starts = [...buckets.keys()].sort((a, b) => a - b);
  if (starts.length) {
    for (let start = starts[0]; start <= starts[starts.length - 1]; start += HALF_HOUR_MS) {
      halfHours.push(buckets.get(start) || { start, label: time(start), orders: 0, cents: 0 });
    }
  }
  const peak = halfHours.reduce((best, bucket) => (!best || bucket.cents > best.cents ? bucket : best), null);

  const stations = Object.keys(STATIONS).map((station) => {
    const withStation = valid.filter((order) => stationsOf(order).includes(station));
    const done = withStation.filter((order) => order.ready[station]);
    const minutes = done.map((order) => (Date.parse(order.ready[station].at) - Date.parse(order.confirmedAt)) / 60000);
    return {
      station,
      name: STATIONS[station],
      orders: withStation.length,
      units: withStation.reduce((total, order) => total + kitchenLines(order, station).reduce((count, line) => count + line.quantity, 0), 0),
      readyCount: done.length,
      unmarkedCount: withStation.length - done.length,
      averageMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
    };
  }).filter((entry) => entry.orders > 0);

  const totalCents = sum(valid);
  const tableList = [...tables.values()].sort((a, b) => a.table - b.table);
  return {
    number: night.number,
    openedAt: night.orders.length ? night.orders[0].confirmedAt : null,
    lastOrderAt: night.orders.length ? night.orders[night.orders.length - 1].confirmedAt : null,
    closedAt: night.closedAt,
    orders: valid.length,
    totalCents,
    chargedCents: sum(charged),
    chargedOrders: charged.length,
    pendingCents: sum(pending),
    pendingOrders: pending.map((order) => ({ id: order.id, number: order.number, table: order.table, totalCents: order.totalCents, at: time(order.confirmedAt) })),
    voidedCount: voided.length,
    voidedCents: sum(voided),
    units: valid.reduce((total, order) => total + unitsOf(order), 0),
    tables: tableList,
    averageOrderCents: valid.length ? Math.round(totalCents / valid.length / 100) * 100 : 0,
    averageTableCents: tableList.length ? Math.round(totalCents / tableList.length / 100) * 100 : 0,
    halfHours,
    peak,
    products: [...products.values()].sort((a, b) => b.cents - a.cents || b.units - a.units),
    stations,
    staff: [...staff.values()].sort((a, b) => b.cents - a.cents),
  };
}
