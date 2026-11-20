import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const digest = (text) => createHash('sha256').update(String(text)).digest();
export const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));

export function createAuth({ pin, secret, now = Date.now, maxAttempts = 5, lockMs = 5 * 60 * 1000, maxAgeMs = 30 * 24 * 60 * 60 * 1000, maxOrigins = 10000 }) {
  const attempts = new Map();
  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');

  function remember(origin, entry) {
    attempts.delete(origin);
    if (attempts.size >= maxOrigins) {
      for (const [key, old] of attempts) if (entry.at - old.at >= lockMs) attempts.delete(key);
    }
    if (attempts.size >= maxOrigins) attempts.delete(attempts.keys().next().value);
    attempts.set(origin, entry);
  }

  return {
    login(candidate, name, origin) {
      const entry = attempts.get(origin);
      if (entry && entry.count >= maxAttempts && now() - entry.at < lockMs) return { error: 'LOCKED' };
      if (!pin || !safeEqual(candidate, pin)) {
        const expired = entry && now() - entry.at >= lockMs;
        remember(origin, { count: entry && !expired ? entry.count + 1 : 1, at: now() });
        return { error: 'PIN_INVALID' };
      }
      attempts.delete(origin);
      const payload = Buffer.from(JSON.stringify({ name, issuedAt: now() })).toString('base64url');
      return { token: `${payload}.${sign(payload)}`, name };
    },
    verify(token) {
      const [payload, signature] = String(token || '').split('.');
      if (!payload || !signature || !secret || !safeEqual(signature, sign(payload))) return null;
      try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return now() - session.issuedAt < maxAgeMs ? session : null;
      } catch {
        return null;
      }
    },
  };
}
