import { CONFIG } from './config.js';
import { VENUE } from './menu.js';
import { tableLabel } from './order-code.js';
import { qrSvg } from './qr.js';
import { resolveQrBase } from './qr-base.js';

const resolved = resolveQrBase(new URLSearchParams(location.search).get('base'), location.href, CONFIG.allowedQrOrigins || []);
const base = new URL(resolved.href);
const glass = document.querySelector('#glass').innerHTML;
const tables = [...Array.from({ length: VENUE.tableCount }, (_, position) => position + 1), 0];

document.querySelector('#base-note').textContent = `${resolved.accepted ? '' : 'La dirección pedida en ?base= no es de esta carta ni de la lista de config.js, así que no se usó. '}Cada código abre ${base.href} con su número de mesa. Imprimilos recién cuando la carta esté en su dirección definitiva.`;
document.querySelector('#cards').innerHTML = tables.map((table) => {
  const target = new URL(base);
  target.searchParams.set('mesa', String(table));
  return `<article class="table-card"><p class="brand" aria-label="${VENUE.name}">${glass}<span aria-hidden="true">ERDEL</span></p><h2>${tableLabel(table)}</h2><div class="qr-box">${qrSvg(target.href, { dark: '#0E2B21', light: '#F7EFDD', margin: 3 })}</div><p>Escaneá, elegí y mostrale el pedido a la moza.</p></article>`;
}).join('');
document.querySelector('#print').addEventListener('click', () => window.print());
