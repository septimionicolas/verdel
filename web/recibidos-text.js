export const DEGREES = [
  { id: 'lic', f: 'Licenciada', m: 'Licenciado', x: 'Licenciade' },
  { id: 'ing', f: 'Ingeniera', m: 'Ingeniero', x: 'Ingeniere' },
  { id: 'abo', f: 'Abogada', m: 'Abogado', x: 'Abogade' },
  { id: 'med', f: 'Médica', m: 'Médico', x: 'Médique' },
  { id: 'cont', f: 'Contadora', m: 'Contador', x: 'Contadore' },
  { id: 'arq', f: 'Arquitecta', m: 'Arquitecto', x: 'Arquitecte' },
  { id: 'odo', f: 'Odontóloga', m: 'Odontólogo', x: 'Odontólogue' },
  { id: 'psi', f: 'Psicóloga', m: 'Psicólogo', x: 'Psicólogue' },
  { id: 'prof', f: 'Profesora', m: 'Profesor', x: 'Profesore' },
  { id: 'tec', f: 'Técnica', m: 'Técnico', x: 'Técnique' },
  { id: 'other', f: 'Otro título', m: 'Otro título', x: 'Otro título' },
];

const GRADUATED = { f: 'recibida', m: 'recibido', x: 'recibide' };
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SOURCES = ['FA', 'CA', 'BA', 'WA'];
export const PROMO_END = '28/02/2027';
export const PROMO_TERMS = `Mesa de 4 o más · una promo por recibido · solo el día del festejo, hasta la 1 de la mañana · válida hasta el ${PROMO_END} o hasta agotar stock`;
export const LEGAL = 'Beber con moderación. Prohibida su venta a menores de 18 años.';

export function degreeTitle({ degree, gender, other }) {
  if (degree === 'other') return clean(other) || GRADUATED[gender] || GRADUATED.f;
  const found = DEGREES.find((item) => item.id === degree) || DEGREES[0];
  return found[gender] || found.f;
}

export function headline(fields) {
  const title = degreeTitle(fields);
  return title === GRADUATED[fields.gender] ? '¡Me recibí!' : `¡Soy ${title.toLowerCase()}!`;
}

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

export function groupMessage(fields, url) {
  const name = clean(fields.name) || 'alguien del grupo';
  const when = partyDate(fields.date);
  return [
    `🎓 ¡Se recibe ${name}! Festejamos en Verdel (Chacabuco y Las Piedras)${when ? ` el ${when}` : ''}.`,
    'Llevamos el cartel y la mesa se lleva 2 litros de Norte de regalo 🍺',
    `Hacé el tuyo: ${url}`,
  ].join('\n');
}

export function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}
