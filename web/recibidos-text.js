// WhatsApp de Verdel en formato internacional, solo dígitos (ej.: 5493815551234). Vacío = falta el dato.
export const PHONE = '';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SOURCES = ['FA', 'CA', 'BA', 'WA'];
export const PROMO_END = '28/02/2027';
export const MIN_PEOPLE = 4;
export const PROMO_TERMS = `Mesa de ${MIN_PEOPLE} o más · una promo por recibido · solo el día del festejo, hasta la 1 de la mañana · válida hasta el ${PROMO_END} o hasta agotar stock`;
export const LEGAL = 'Beber con moderación. Prohibida su venta a menores de 18 años.';

export function partyDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return `${WEEKDAYS[date.getDay()]} ${match[3]}/${match[2]}/${match[1]}`;
}

export function sourceTag(search) {
  const tag = (new URLSearchParams(search).get('v') || '').toUpperCase();
  return SOURCES.includes(tag) ? tag : 'WEB';
}

export function couponCode(source, random) {
  const letters = Array.from(random, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  return `VD-${source}-${letters.slice(0, 4)}`;
}

export function reservationMessage(fields, code) {
  const people = Number.parseInt(fields.people, 10);
  const lines = [
    '🎓 Hola Verdel, quiero reservar para festejar una recibida.',
    `Nombre: ${clean(fields.name)}`,
    clean(fields.degree) && `Se recibe de: ${clean(fields.degree)}`,
    `Día: ${partyDate(fields.date)}${clean(fields.time) ? ` a las ${clean(fields.time)}` : ''}`,
    people > 0 && `Somos: ${people}`,
    clean(fields.note) && `Comentario: ${clean(fields.note)}`,
    `Código de la promo: ${code}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function questionMessage(code) {
  return `Hola Verdel, tengo una consulta sobre la promo de recibidos (código ${code}).`;
}

export function groupMessage(fields, url) {
  const name = clean(fields.name) || 'alguien del grupo';
  const when = partyDate(fields.date);
  return [
    `🎓 ¡Se recibe ${name}! Festejamos en Verdel (Chacabuco y Las Piedras)${when ? ` el ${when}` : ''}.`,
    `Si somos ${MIN_PEOPLE} o más, la mesa se lleva 2 litros de Norte de regalo 🍺`,
    `Mirá la promo: ${url}`,
  ].join('\n');
}

export function whatsappLink(phone, text) {
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null;
}

export function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}
