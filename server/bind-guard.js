import { safeEqual } from './auth.js';
import { createLimiter } from './limiter.js';

const MINUTE = 60 * 1000;

export const BIND_LIMITS = {
  perAccount: 5,
  total: 20,
  windowMs: 60 * MINUTE,
  alertFailures: 3,
  alertWindowMs: 10 * MINUTE,
  logsPerMinute: 60,
  maxAccounts: 10000,
};

function createCounter(windowMs, maxKeys) {
  const windows = new Map();
  const current = (key, at) => {
    const entry = windows.get(key);
    return entry && at - entry.start < windowMs ? entry : null;
  };
  return {
    count: (key, at) => current(key, at)?.count || 0,
    add(key, at) {
      const entry = current(key, at) || { start: at, count: 0 };
      windows.delete(key);
      if (windows.size >= maxKeys) for (const [old, item] of windows) if (at - item.start >= windowMs) windows.delete(old);
      if (windows.size >= maxKeys) windows.delete(windows.keys().next().value);
      entry.count += 1;
      windows.set(key, entry);
      return entry;
    },
  };
}

export function createBindGuard({ setupKey, now = Date.now, notify = () => {}, log = () => {}, ...options }) {
  const limits = { ...BIND_LIMITS, ...options };
  const accounts = createCounter(limits.windowMs, limits.maxAccounts);
  const total = createCounter(limits.windowMs, 1);
  const logs = createLimiter({ limit: limits.logsPerMinute, now, maxKeys: 1 });
  let alert = null;

  function report(detail, account, at) {
    if (logs.take('bind')) log('bind_failed', detail);
    if (detail.reason !== 'key') return;
    if (!alert || at - alert.start >= limits.alertWindowMs) alert = { start: at, count: 0, accounts: new Set(), flagged: false };
    alert.count += 1;
    if (alert.accounts.size < limits.maxAccounts) alert.accounts.add(account);
    if (alert.flagged || alert.count < limits.alertFailures) return;
    alert.flagged = true;
    notify({ kind: 'bind', failures: alert.count, origins: alert.accounts.size, windowMinutes: limits.alertWindowMs / MINUTE });
  }

  return {
    check(candidate, { chatId, fromId, role }) {
      const at = now();
      const account = String(fromId ?? chatId);
      const detail = { chatId, fromId, role };
      if (accounts.count(account, at) >= limits.perAccount || total.count('all', at) >= limits.total) {
        report({ ...detail, reason: 'locked' }, account, at);
        return 'LOCKED';
      }
      if (setupKey && safeEqual(candidate, setupKey)) return 'OK';
      accounts.add(account, at);
      total.add('all', at);
      report({ ...detail, reason: 'key' }, account, at);
      return 'KEY_INVALID';
    },
  };
}
