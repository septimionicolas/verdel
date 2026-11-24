import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { formatAmount } from '../web/menu.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SEND_HOUR = 6;
const LAST_SEND_HOUR = 12;
const VISITOR_ID = /^[A-Za-z0-9_-]{22}$/;
const KEPT_DAYS = 90;

function localParts(ms, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) };
}

// The bar's day runs 06:00 → 06:00: a visit at 02:00 belongs to the night that started the evening before.
export function businessDay(ms, timeZone) {
  return localParts(ms - SEND_HOUR * HOUR_MS, timeZone).date;
}

export function reportWindow(ms, timeZone) {
  const local = localParts(ms, timeZone);
  const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - Math.floor(ms / 60000) * 60000;
  const to = Date.UTC(local.year, local.month - 1, local.day, SEND_HOUR) - offset;
  return { from: to - DAY_MS, to, sendDate: local.date };
}

function readJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

// Counts distinct phones per day with an anonymous random cookie. Only today's random ids are kept (so a restart
// does not count a phone twice); past days keep just the number.
export function createVisits({ file, timeZone, now = Date.now, maxPerDay = 20000 }) {
  const saved = readJson(file, {});
  const data = { counts: saved.counts || {}, day: saved.day || null };
  const seen = new Set(Array.isArray(saved.ids) ? saved.ids : []);

  function rollTo(day) {
    if (day === data.day) return;
    data.day = day;
    seen.clear();
    const days = Object.keys(data.counts).sort();
    for (const old of days.slice(0, Math.max(0, days.length - KEPT_DAYS))) delete data.counts[old];
  }

  function record(id) {
    rollTo(businessDay(now(), timeZone));
    if (seen.has(id) || seen.size >= maxPerDay) return;
    seen.add(id);
    data.counts[data.day] = seen.size;
    writeJson(file, { counts: data.counts, day: data.day, ids: [...seen] });
  }

  return {
    // Returns the cookie to set when the visitor had none (or a malformed one).
    visit(cookieId) {
      const id = VISITOR_ID.test(cookieId || '') ? cookieId : randomBytes(16).toString('base64url');
      record(id);
      return id === cookieId ? null : id;
    },
    count: (day) => data.counts[day] || 0,
  };
}

const pesos = (cents) => `$${formatAmount(cents)}`;

export function dailyStats(state, from, to) {
  const orders = state.nights.flatMap((night) => night.orders.map((order) => ({ ...order, night: night.number }))).filter((order) => {
    const at = Date.parse(order.confirmedAt);
    return at >= from && at < to && order.status !== 'voided';
  });
  const sum = (list) => list.reduce((total, order) => total + order.totalCents, 0);
  const charged = orders.filter((order) => order.status === 'charged');
  return {
    orders: orders.length,
    tables: new Set(orders.map((order) => `${order.night}:${order.table}`)).size,
    totalCents: sum(orders),
    chargedCents: sum(charged),
    pendingCents: sum(orders) - sum(charged),
  };
}

export function dailyText({ venueName, timeZone, from, to, visits, stats }) {
  const weekday = (ms) => new Intl.DateTimeFormat('es-AR', { timeZone, weekday: 'long' }).format(new Date(ms));
  const dayMonth = new Intl.DateTimeFormat('es-AR', { timeZone, day: '2-digit', month: '2-digit' }).format(new Date(to));
  return [
    `📊 <b>${venueName}</b> · ${weekday(to)} ${dayMonth}`,
    `(de 06:00 del ${weekday(from)} a 06:00 del ${weekday(to)})`,
    '',
    `Visitas a la carta: ${visits} (personas distintas)`,
    `Mesas atendidas: ${stats.tables}`,
    `Pedidos: ${stats.orders}`,
    `Ventas totales: ${pesos(stats.totalCents)}`,
    `  Cobrado: ${pesos(stats.chargedCents)} · Sin cobrar: ${pesos(stats.pendingCents)}`,
  ].join('\n');
}

// Sends once per day between 06:00 and 12:00 (a late deploy still delivers; an afternoon bind does not
// dump yesterday's numbers). The last delivered date is saved so a restart never sends twice.
export function createDailyReport({ service, visits, venue, file, now = Date.now, log = () => {} }) {
  let lastSent = readJson(file, {}).lastSent || null;
  let running = false;

  async function tick() {
    const ms = now();
    const { from, to, sendDate } = reportWindow(ms, venue.timeZone);
    const hour = localParts(ms, venue.timeZone).hour;
    if (running || lastSent === sendDate || hour < SEND_HOUR || hour >= LAST_SEND_HOUR || !service.state.bindings.socios) return null;
    running = true;
    try {
      const text = dailyText({ venueName: venue.name, timeZone: venue.timeZone, from, to, visits: visits.count(businessDay(from, venue.timeZone)), stats: dailyStats(service.state, from, to) });
      if (!(await service.send('socios', text))) return null;
      lastSent = sendDate;
      writeJson(file, { lastSent });
      log('daily_report_sent', { date: sendDate });
      return text;
    } finally {
      running = false;
    }
  }

  return { tick };
}
