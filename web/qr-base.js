function parse(value, base) {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

export function resolveQrBase(requested, pageHref, allowedOrigins) {
  const fallback = new URL('./', pageHref);
  fallback.search = '';
  fallback.hash = '';
  if (!requested) return { href: fallback.href, accepted: true };
  const allowed = new Set(allowedOrigins.map((origin) => parse(origin)?.origin).filter((origin) => origin && origin !== 'null'));
  allowed.add(fallback.origin);
  const target = parse(requested, pageHref);
  if (!target || !['https:', 'http:'].includes(target.protocol) || target.username || target.password || !allowed.has(target.origin)) return { href: fallback.href, accepted: false };
  target.search = '';
  target.hash = '';
  return { href: target.href, accepted: true };
}
