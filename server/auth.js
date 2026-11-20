import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const digest = (text) => createHash('sha256').update(String(text)).digest();
export const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));
export const newToken = () => randomBytes(32).toString('base64url');

const MINUTE = 60 * 1000;

export const AUTH_DEFAULTS = {
  maxAttempts: 5,
  lockMs: 5 * MINUTE,
  maxLockMs: 60 * MINUTE,
  maxOrigins: 10000,
  alertFailures: 20,
  alertWindowMs: 10 * MINUTE,
  freezeFailures: 200,
  freezeWindowMs: 60 * MINUTE,
  freezeOrigins: 20,
  freezeMs: 15 * MINUTE,
};

function createWindow(windowMs, maxOrigins) {
  let current = null;
  return {
    add(at, origin) {
      if (!current || at - current.start >= windowMs) current = { start: at, count: 0, origins: new Set(), flagged: false };
      current.count += 1;
      if (current.origins.size < maxOrigins) current.origins.add(origin);
      return current;
    },
    reset() {
      current = null;
    },
  };
}

export function createAuth({ pin, secret, setupKey = '', now = Date.now, notify = () => {}, ...options }) {
  const limits = { ...AUTH_DEFAULTS, ...options };
  const attempts = new Map();
  const alertWindow = createWindow(limits.alertWindowMs, limits.maxOrigins);
  let freezeWindow = createWindow(limits.freezeWindowMs, limits.maxOrigins);
  let frozenUntil = 0;
  const forgotten = (entry, at) => at - Math.max(entry.at, entry.lockedUntil) >= limits.maxLockMs;

  function remember(origin, entry) {
    attempts.delete(origin);
    if (attempts.size >= limits.maxOrigins) {
      for (const [key, old] of attempts) if (forgotten(old, entry.at)) attempts.delete(key);
    }
    if (attempts.size >= limits.maxOrigins) attempts.delete(attempts.keys().next().value);
    attempts.set(origin, entry);
  }

  function countFailure(origin, at) {
    const previous = attempts.get(origin);
    const entry = previous && !forgotten(previous, at) ? previous : { count: 0, at, strikes: 0, lockedUntil: 0 };
    const running = entry.count < limits.maxAttempts && at - entry.at < limits.lockMs;
    const count = running ? entry.count + 1 : 1;
    const locking = count >= limits.maxAttempts;
    const strikes = locking ? entry.strikes + 1 : entry.strikes;
    const lockedUntil = locking ? at + Math.min(limits.lockMs * 2 ** (strikes - 1), limits.maxLockMs) : entry.lockedUntil;
    remember(origin, { count, at, strikes, lockedUntil });
  }

  function watch(origin, at) {
    const alert = alertWindow.add(at, origin);
    if (!alert.flagged && alert.count >= limits.alertFailures) {
      alert.flagged = true;
      notify({ kind: 'attempts', failures: alert.count, origins: alert.origins.size, windowMinutes: limits.alertWindowMs / MINUTE });
    }
    const freeze = freezeWindow.add(at, origin);
    if (freeze.count >= limits.freezeFailures && freeze.origins.size >= limits.freezeOrigins && frozenUntil <= at) {
      frozenUntil = at + limits.freezeMs;
      freezeWindow.reset();
      notify({ kind: 'frozen', failures: freeze.count, origins: freeze.origins.size, windowMinutes: limits.freezeWindowMs / MINUTE, frozenMinutes: limits.freezeMs / MINUTE });
    }
  }

  function guard(candidate, expected, origin, error) {
    const at = now();
    const entry = attempts.get(origin);
    if ((entry && entry.lockedUntil > at) || frozenUntil > at) return { error: 'LOCKED' };
    if (!expected || !safeEqual(candidate, expected)) {
      countFailure(origin, at);
      watch(origin, at);
      return { error };
    }
    attempts.delete(origin);
    return { ok: true };
  }

  return {
    checkPin: (candidate, origin) => guard(candidate, pin, origin, 'PIN_INVALID'),
    checkKey: (candidate, origin) => guard(candidate, setupKey, origin, 'KEY_INVALID'),
    hashToken: (token) => createHmac('sha256', secret).update(String(token)).digest('base64url'),
    unlockAll() {
      attempts.clear();
      freezeWindow = createWindow(limits.freezeWindowMs, limits.maxOrigins);
      frozenUntil = 0;
    },
  };
}
