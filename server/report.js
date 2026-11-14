import { tableLabel } from '../web/order-code.js';
import { escapeHtml, money } from './messages.js';

const STYLE = `
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#111;font:14px/1.5 "Archivo",Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
main{max-width:820px;margin:0 auto;padding:32px 24px 48px}
.eyebrow{margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#444}
.big{margin:0 0 14px;font-family:"Archivo","Archivo Black","Arial Black",sans-serif;font-stretch:125%;font-weight:900;font-size:58px;line-height:1;font-variant-numeric:tabular-nums}
.lead{margin:0;max-width:60ch;color:#333}
.rule{border:0;border-top:3px solid #111;margin:28px 0 22px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #d9d9d4;border-right:0;border-bottom:0}
.tile{padding:12px 12px 14px;border-right:1px solid #d9d9d4;border-bottom:1px solid #d9d9d4}
.tile span{display:block;font-size:12px;color:#444}
.tile b{display:block;margin:2px 0;font-family:"Archivo","Archivo Black",sans-serif;font-stretch:112%;font-weight:900;font-size:19px;font-variant-numeric:tabular-nums}
.tile small{display:block;font-size:11.5px;color:#555}
h2{margin:34px 0 12px;font-family:"Archivo","Archivo Black",sans-serif;font-stretch:125%;font-weight:900;font-size:17px}
table{width:100%;border-collapse:collapse;border:1px solid #d9d9d4;font-size:12.5px;font-variant-numeric:tabular-nums}
th{padding:8px 10px;text-align:right;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#444;border-bottom:1px solid #d9d9d4;background:#f6f6f3}
td{padding:7px 10px;text-align:right;border-bottom:1px solid #ecece8}
th:first-child,td:first-child{text-align:left}
tr.total td{font-weight:800;border-top:2px solid #111;border-bottom:0}
.chart{display:flex;align-items:flex-end;gap:6px;height:150px;padding:22px 12px 0;border:1px solid #d9d9d4;border-bottom:0}
.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;font-size:10.5px;color:#444}
.bar i{display:block;width:100%;background:#14382B;min-height:2px}
.bar.peak i{background:#D97E14}
.axis{display:flex;gap:6px;padding:6px 12px 8px;border:1px solid #d9d9d4;border-top:0;font-size:10.5px;color:#444}
.axis span{flex:1;text-align:center}
.products{border:1px solid #d9d9d4;padding:12px}
.product{display:grid;grid-template-columns:210px 1fr 96px;gap:12px;align-items:center;padding:5px 0;font-size:12.5px}
.track{height:10px;background:#e9e9e4}
.track i{display:block;height:100%;background:#14382B}
.product:nth-child(-n+3) .track i{background:#D97E14}
.product b{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;padding:1px 9px;border:1px solid currentColor;border-radius:999px;font-size:11px;font-weight:700}
.pill.ok{color:#17703f}
.pill.warning{color:#b25a00}
ol{margin:0;padding-left:20px;max-width:64ch}
li{margin:0 0 8px}
.foot{margin:30px 0 0;padding-top:12px;border-top:1px solid #d9d9d4;font-size:11.5px;color:#555;max-width:none}
@media (max-width:640px){.tiles{grid-template-columns:repeat(2,1fr)}.big{font-size:42px}.product{grid-template-columns:130px 1fr 84px}}
`;

const tile = (label, value, detail = '') => `<div class="tile"><span>${label}</span><b>${value}</b><small>${detail}</small></div>`;
const row = (cells, className = '') => `<tr${className ? ` class="${className}"` : ''}>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
const head = (cells) => `<tr>${cells.map((cell) => `<th>${cell}</th>`).join('')}</tr>`;
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');
const thousands = (cents) => `${Math.round(cents / 100000)}k`;

export function nightTitle(stats, timeZone) {
  const instant = new Date(stats.openedAt || stats.closedAt || Date.now());
  const weekday = new Intl.DateTimeFormat('es-AR', { timeZone, weekday: 'long' }).format(instant);
  const date = new Intl.DateTimeFormat('es-AR', { timeZone, day: '2-digit', month: '2-digit' }).format(instant);
  const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  return { weekday, date, isoDate };
}

export function renderReport(stats, venue, time) {
  const { weekday, date } = nightTitle(stats, venue.timeZone);
  const span = stats.openedAt ? `entre las ${time(stats.openedAt)} y las ${time(stats.lastOrderAt)}` : '';
  const pendingCount = stats.pendingOrders.length;
  const pendingNote = pendingCount ? `${pendingCount === 1 ? 'Quedó 1 sin marcar como cobrado' : `Quedaron ${pendingCount} sin marcar como cobrados`} (${money(stats.pendingCents)}).` : 'Todos quedaron marcados como cobrados.';
  const voidedNote = stats.voidedCount ? ` ${stats.voidedCount === 1 ? 'Se anuló 1' : `Se anularon ${stats.voidedCount}`} (${money(stats.voidedCents)}), fuera de todos los totales.` : ' No hubo pedidos anulados.';
  const kitchen = stats.stations.find((entry) => entry.averageMinutes !== null);
  const peakShare = stats.peak ? percent(stats.peak.cents, stats.totalCents) : '';
  const maxBucket = Math.max(1, ...stats.halfHours.map((bucket) => bucket.cents));
  const maxProduct = Math.max(1, ...stats.products.map((product) => product.cents));
  const tableTotals = stats.tables.reduce((total, table) => ({ orders: total.orders + table.orders, units: total.units + table.units }), { orders: 0, units: 0 });

  const tiles = [
    tile('Ticket promedio', money(stats.averageOrderCents), `${stats.orders} pedidos`),
    tile('Unidades vendidas', String(stats.units), stats.orders ? `${(stats.units / stats.orders).toFixed(1).replace('.', ',')} por pedido` : ''),
    tile('Mesas atendidas', String(stats.tables.length), `${money(stats.averageTableCents)} por mesa`),
    tile('Vendido', money(stats.totalCents), 'cobrado más pendiente'),
    tile('Sin cobrar', money(stats.pendingCents), `${stats.pendingOrders.length} pedidos · ${percent(stats.pendingCents, stats.totalCents)} de lo vendido`),
    tile('Anulados', String(stats.voidedCount), stats.voidedCount ? `${money(stats.voidedCents)} fuera de los totales` : 'ninguno'),
    tile('Pico de la noche', stats.peak ? stats.peak.label : '—', stats.peak ? `${money(stats.peak.cents)} en 30 minutos` : ''),
    tile('Demora de cocina', kitchen ? `${kitchen.averageMinutes} min` : '—', kitchen ? kitchen.name : 'sin avisos de «Listo»'),
  ].join('');

  const tableRows = stats.tables.map((table) => row([tableLabel(table.table), table.orders, table.units, money(table.chargedCents), money(table.pendingCents), `<b>${money(table.totalCents)}</b>`, table.pendingCents ? '<span class="pill warning">Falta cobrar</span>' : '<span class="pill ok">Cobrada</span>'])).join('');
  const bars = stats.halfHours.map((bucket) => `<div class="bar${bucket === stats.peak ? ' peak' : ''}"><span>${bucket.cents ? thousands(bucket.cents) : ''}</span><i style="height:${Math.round((bucket.cents / maxBucket) * 100)}%"></i></div>`).join('');
  const axis = stats.halfHours.map((bucket) => `<span>${bucket.label}</span>`).join('');
  const productBars = stats.products.slice(0, 7).map((product) => `<div class="product"><span>${escapeHtml(product.name)} · ${product.units}</span><div class="track"><i style="width:${Math.round((product.cents / maxProduct) * 100)}%"></i></div><b>${money(product.cents)}</b></div>`).join('');
  const productRows = stats.products.map((product) => row([escapeHtml(product.name), product.units, money(product.cents), percent(product.cents, stats.totalCents)])).join('');
  const stationRows = stats.stations.map((entry) => row([escapeHtml(entry.name), entry.orders, entry.units, entry.readyCount, entry.unmarkedCount, entry.averageMinutes === null ? '—' : `${entry.averageMinutes} min`])).join('');
  const staffRows = stats.staff.map((person) => row([escapeHtml(person.name), person.orders, money(person.cents)])).join('');
  const pending = stats.pendingOrders.length
    ? `<ol>${stats.pendingOrders.map((order) => `<li><b>${tableLabel(order.table)} · pedido #${order.number}</b> de las ${order.at}, por ${money(order.totalCents)}: cobrarlo en la caja del bar y tocar «Cobrado en caja» en el grupo del salón, o anularlo si no se sirvió.</li>`).join('')}</ol>`
    : '<p class="lead">Nada: todos los pedidos de la noche están cobrados o anulados.</p>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cierre ${escapeHtml(venue.name)} ${date}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<main>
<p class="eyebrow">${escapeHtml(venue.name)} · Noche del ${weekday} ${date} · Pedidos por QR</p>
<p class="eyebrow">Cobrado en caja (lo que marcó el salón)</p>
<p class="big">${money(stats.chargedCents)}</p>
<p class="lead">${stats.orders} pedidos en ${stats.tables.length} mesas, confirmados por el salón ${span}. ${pendingNote}${voidedNote} Este sistema no cobra: «cobrado» es lo que el salón marcó después de cobrar en la caja del bar.</p>
<hr class="rule">
<div class="tiles">${tiles}</div>
<h2>Vendido por mesa</h2>
<table>${head(['Mesa', 'Pedidos', 'Unidades', 'Cobrado', 'Sin cobrar', 'Total', 'Estado'])}${tableRows}${row(['Total', tableTotals.orders, tableTotals.units, money(stats.chargedCents), money(stats.pendingCents), money(stats.totalCents), ''], 'total')}</table>
<h2>Vendido por media hora</h2>
<div class="chart">${bars}</div>
<div class="axis">${axis}</div>
${stats.peak ? `<p class="lead" style="margin-top:12px">La media hora más fuerte fue la de las ${stats.peak.label}: ${money(stats.peak.cents)}, el ${peakShare} de la noche.</p>` : ''}
<h2>Productos estrella</h2>
<div class="products">${productBars}</div>
<h2>Consumo por producto</h2>
<table>${head(['Producto', 'Unidades', 'Vendido', 'Parte de la noche'])}${productRows}${row(['Total', stats.units, money(stats.totalCents), '100%'], 'total')}</table>
<h2>Cocinas</h2>
${stationRows ? `<table>${head(['Cocina', 'Pedidos', 'Unidades', 'Avisó «Listo»', 'Sin aviso', 'Demora promedio'])}${stationRows}</table>` : '<p class="lead">No hubo pedidos de cocina.</p>'}
<h2>Salón</h2>
<table>${head(['Quién confirmó', 'Pedidos', 'Vendido'])}${staffRows}</table>
<h2>Qué falta para dar la noche por cerrada</h2>
${pending}
<p class="foot">Datos del registro de pedidos de ${escapeHtml(venue.name)}, noche ${stats.number}. Horario de Argentina. «Vendido» suma los pedidos confirmados por el salón a precio de carta; los anulados quedan afuera. La demora de cocina va desde que el salón confirma el pedido hasta que la cocina toca «Listo».</p>
</main>
</body>
</html>
`;
}
