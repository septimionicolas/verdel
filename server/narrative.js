import { escapeHtml, money } from './messages.js';

export const NARRATIVE_MAX_CHARS = 500;

export const NARRATIVE_INSTRUCTIONS = [
  'Le contás al dueño de una cervecería cómo fue la noche que acaba de cerrar.',
  'Escribí un solo párrafo de hasta 400 caracteres, en español rioplatense y con voseo, en tono cálido y concreto.',
  'Usá solo los datos que vienen en el mensaje, con los números tal cual aparecen. No calcules cifras nuevas ni inventes nada que no esté en los datos.',
  'No nombres personas. Sin títulos, listas, emojis ni formato: solo texto.',
].join(' ');

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export function narrativeFacts(stats, venueName) {
  const lines = [
    `Lugar: ${venueName}, noche ${stats.number}.`,
    `Pedidos: ${stats.orders}, en ${plural(stats.tables.length, 'mesa', 'mesas')}, con ${plural(stats.units, 'unidad', 'unidades')}.`,
    `Total vendido: ${money(stats.totalCents)}.`,
    `Ticket promedio por pedido: ${money(stats.averageOrderCents)}.`,
  ];
  const top = stats.products.slice(0, 5).map((product) => `${product.name} (${product.units})`);
  if (top.length) lines.push(`Productos que más vendieron: ${top.join(', ')}.`);
  if (stats.peak) lines.push(`Media hora pico: desde las ${stats.peak.label}, con ${plural(stats.peak.orders, 'pedido', 'pedidos')} y ${money(stats.peak.cents)}.`);
  for (const station of stats.stations) {
    const timing = station.averageMinutes === null ? 'sin tiempos marcados' : `${station.averageMinutes} min en promedio hasta «Listo»`;
    lines.push(`${station.name}: ${plural(station.orders, 'pedido', 'pedidos')}, ${timing}.`);
  }
  lines.push(`Anulados: ${stats.voidedCount}${stats.voidedCount ? ` (${money(stats.voidedCents)})` : ''}.`);
  return lines.join('\n');
}

export function narrativeMessage(answer) {
  const flat = String(answer || '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  const cut = flat.length > NARRATIVE_MAX_CHARS ? `${flat.slice(0, NARRATIVE_MAX_CHARS - 1).replace(/\s+\S*$/, '')}…` : flat;
  return escapeHtml(cut);
}
