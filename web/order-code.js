export const MAX_LINES = 16;
const NONCE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const LINES = `[a-z0-9]{3}x\\d{1,2}(?:-[a-z0-9]{3}x\\d{1,2}){0,${MAX_LINES - 1}}`;
const PATTERN = new RegExp(`^v2\\.([a-z2-7]{20})\\.(\\d{1,2})\\.(${LINES})$`);
const OLD_PATTERN = /^v1\.(\d{1,2})\.([a-z0-9]{3}x\d{1,2}(?:-[a-z0-9]{3}x\d{1,2}){0,39})$/;

export function newNonce(source = globalThis.crypto) {
  if (!source || typeof source.getRandomValues !== 'function') throw new Error('NONCE_UNAVAILABLE');
  return [...source.getRandomValues(new Uint8Array(20))].map((byte) => NONCE_ALPHABET[byte & 31]).join('');
}

export function encodeOrder(table, lines, nonce) {
  return `v2.${nonce}.${table}.${lines.map((line) => `${line.key}x${line.quantity}`).join('-')}`;
}

export function decodeOrder(code) {
  const text = String(code);
  const match = PATTERN.exec(text);
  if (!match) throw new Error(OLD_PATTERN.test(text) ? 'ORDER_CODE_OLD' : 'ORDER_CODE_INVALID');
  const merged = new Map();
  for (const part of match[3].split('-')) {
    const key = part.slice(0, 3);
    const quantity = Number(part.slice(4));
    if (quantity < 1) throw new Error('ORDER_CODE_INVALID');
    merged.set(key, (merged.get(key) || 0) + quantity);
  }
  return { nonce: match[1], table: Number(match[2]), lines: [...merged].map(([key, quantity]) => ({ key, quantity })) };
}

export function contentKey(decoded) {
  const lines = [...decoded.lines].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return `${decoded.table}.${lines.map((line) => `${line.key}x${line.quantity}`).join('-')}`;
}

export function priceOrder(optionIndex, decoded, tableCount) {
  if (decoded.table > tableCount) throw new Error('TABLE_UNKNOWN');
  const lines = decoded.lines.map(({ key, quantity }) => {
    const entry = optionIndex.get(key);
    if (!entry) throw new Error('PRODUCT_UNKNOWN');
    return { key, name: entry.name, quantity, unitCents: entry.option.priceCents, kitchen: entry.kitchen };
  });
  const totalCents = lines.reduce((sum, line) => sum + line.quantity * line.unitCents, 0);
  return { table: decoded.table, lines, totalCents };
}

export const tableLabel = (table) => (table === 0 ? 'Barra' : `Mesa ${table}`);
