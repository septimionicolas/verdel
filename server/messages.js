import { formatAmount } from '../web/menu.js';
import { tableLabel } from '../web/order-code.js';
import { ROLE_NAMES, kitchenLines, stationsOf } from './night.js';

export const escapeHtml = (text) => String(text).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
export const money = (cents) => `$ ${formatAmount(cents)}`;
const title = (order) => `<b>${tableLabel(order.table)}</b> · Pedido #${order.number}`;
const shortTitle = (order) => `${tableLabel(order.table)} · #${order.number}`;

export function orderText(order, time) {
  const lines = order.lines.map((line) => `${line.quantity} × ${escapeHtml(line.name)} — ${money(line.quantity * line.unitCents)}`);
  const kitchens = stationsOf(order).map((station) => {
    const ready = order.ready[station];
    return ready ? `✅ ${ROLE_NAMES[station]}: listo ${time(ready.at)}` : `⏳ ${ROLE_NAMES[station]}: en preparación`;
  });
  const closing = [];
  if (order.status === 'charged') closing.push(`💵 Cobrado en caja · ${time(order.chargedAt)} · ${escapeHtml(order.chargedBy)}`);
  if (order.status === 'voided') closing.push(`✖️ Anulado · ${time(order.voidedAt)} · ${escapeHtml(order.voidedBy)}`);
  return [`🧾 ${title(order)}`, ...lines, `<b>Total ${money(order.totalCents)}</b>`, `Confirmó ${escapeHtml(order.staff)} · ${time(order.confirmedAt)}`, ...kitchens, ...closing].join('\n');
}

export function orderKeyboard(order, askingVoid = false) {
  if (order.status === 'voided') return { inline_keyboard: [] };
  if (order.status === 'charged') return { inline_keyboard: [[{ text: '↩️ Deshacer cobrado', callback_data: `uncharge:${order.id}` }]] };
  if (askingVoid) return { inline_keyboard: [[{ text: 'Sí, anular', callback_data: `voidyes:${order.id}` }, { text: 'No', callback_data: `voidno:${order.id}` }]] };
  return { inline_keyboard: [[{ text: '💵 Cobrado en caja', callback_data: `charge:${order.id}` }], [{ text: '✖️ Anular pedido', callback_data: `void:${order.id}` }]] };
}

const kitchenItems = (order, station) => kitchenLines(order, station).map((line) => `${line.quantity} × ${escapeHtml(line.label)}`);

export function kitchenText(order, station, time) {
  const ready = order.ready[station];
  const closing = [];
  if (ready) closing.push(`✅ Listo · ${time(ready.at)} · ${escapeHtml(ready.by)}`);
  if (order.status === 'voided') closing.push('✖️ Pedido anulado: no lo preparen.');
  return [`🔔 ${title(order)}`, ...kitchenItems(order, station), `Pidió ${escapeHtml(order.staff)} · ${time(order.confirmedAt)}`, ...closing].join('\n');
}

export function kitchenKeyboard(order, station) {
  if (order.ready[station] || order.status === 'voided') return { inline_keyboard: [] };
  return { inline_keyboard: [[{ text: '✅ Listo', callback_data: `ready:${order.id}:${station}` }]] };
}

export function readyAlert(order, station) {
  return [`🍕 <b>Listo para retirar</b> · ${shortTitle(order)}`, ...kitchenItems(order, station)].join('\n');
}

export function ownerLine(kind, order, detail = '') {
  const labels = { confirmed: '🧾 Pedido', ready: '✅ Listo', charged: '💵 Cobrado', uncharged: '↩️ Cobrado deshecho', voided: '✖️ Anulado' };
  return `${labels[kind]} · ${shortTitle(order)} · ${money(order.totalCents)}${detail ? ` · ${escapeHtml(detail)}` : ''}`;
}

export function summaryText(stats, venueName) {
  const lines = [
    `<b>${escapeHtml(venueName)} · noche ${stats.number}</b>`,
    `Pedidos: ${stats.orders} en ${stats.tables.length} mesas · ${stats.units} unidades`,
    `Vendido: <b>${money(stats.totalCents)}</b>`,
    `Cobrado en caja: ${money(stats.chargedCents)} (${stats.chargedOrders})`,
    `Sin cobrar: ${money(stats.pendingCents)} (${stats.pendingOrders.length})`,
  ];
  if (stats.voidedCount) lines.push(`Anulados: ${stats.voidedCount} (${money(stats.voidedCents)})`);
  if (stats.peak) lines.push(`Pico: ${stats.peak.label} con ${money(stats.peak.cents)}`);
  return lines.join('\n');
}

export function securityText(alarm) {
  const count = `${alarm.failures} ingresos fallidos al salón en ${alarm.windowMinutes} minutos, desde ${alarm.origins} direcciones.`;
  if (alarm.kind === 'frozen') return [`🛑 <b>Ingresos frenados ${alarm.frozenMinutes} minutos</b>`, count, 'Nadie puede entrar de nuevo hasta que pase; las mozas que ya entraron siguen tomando pedidos.', 'Si no fueron ustedes, cambiá STAFF_PIN.'].join('\n');
  return ['⚠️ <b>Intentos de ingreso</b>', count, 'Si no fueron ustedes, cambiá STAFF_PIN.'].join('\n');
}

export function pendingText(stats) {
  return stats.pendingOrders.map((order) => `• ${tableLabel(order.table)} · #${order.number} · ${money(order.totalCents)} · ${order.at}`).join('\n');
}
