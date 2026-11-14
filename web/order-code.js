const PATTERN = /^v1\.(\d{1,2})\.([a-z0-9]{3}x\d{1,2}(?:-[a-z0-9]{3}x\d{1,2}){0,39})$/;

export function encodeOrder(table, lines) {
  return `v1.${table}.${lines.map((line) => `${line.key}x${line.quantity}`).join('-')}`;
}

export function decodeOrder(code) {
  const match = PATTERN.exec(String(code));
  if (!match) throw new Error('ORDER_CODE_INVALID');
  const merged = new Map();
  for (const part of match[2].split('-')) {
    const key = part.slice(0, 3);
    const quantity = Number(part.slice(4));
    if (quantity < 1) throw new Error('ORDER_CODE_INVALID');
    merged.set(key, (merged.get(key) || 0) + quantity);
  }
  return { table: Number(match[1]), lines: [...merged].map(([key, quantity]) => ({ key, quantity })) };
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
