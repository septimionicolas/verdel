export function clientOrigin(request, trustProxy) {
  const forwarded = trustProxy ? String(request.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return forwarded || request.socket.remoteAddress || 'unknown';
}

export function createLimiter({ limit, windowMs = 60 * 1000, now = Date.now, maxKeys = 10000 }) {
  const windows = new Map();

  function sweep(at) {
    for (const [key, entry] of windows) if (at - entry.start >= windowMs) windows.delete(key);
  }

  return {
    take(key) {
      const at = now();
      let entry = windows.get(key);
      if (!entry || at - entry.start >= windowMs) {
        if (windows.size >= maxKeys) sweep(at);
        entry = { start: at, count: 0 };
        windows.set(key, entry);
      }
      entry.count += 1;
      return entry.count <= limit;
    },
  };
}
