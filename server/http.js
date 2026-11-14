import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createLimiter, clientOrigin } from './limiter.js';
import { currentNight } from './night.js';
import { cleanSuggestionText } from './suggestions.js';

const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const SERVED_CONFIG = "export const CONFIG = {\n  apiBase: '',\n  showCurrencySign: false,\n};\n";
const MAX_BODY_BYTES = 4096;
const ERROR_STATUS = { ORDER_ALREADY_SENT: 409, ORDER_CODE_INVALID: 422, PRODUCT_UNKNOWN: 422, TABLE_UNKNOWN: 422 };

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export function createHttpHandler({ service, auth, config, webDir, ready, advisor = null, suggester = null, now = Date.now }) {
  const root = resolve(webDir);
  const statusLimiter = createLimiter({ limit: 40, now });
  const suggestionLimiter = createLimiter({ limit: 5, now });

  function send(response, status, body, headers = {}) {
    const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...headers });
    response.end(payload);
  }

  function corsHeaders(request) {
    const origin = request.headers.origin;
    if (!origin || !config.allowedOrigins.includes(origin)) return {};
    return { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'Origin' };
  }

  async function serveStatic(pathname, response) {
    if (pathname === '/config.js') return send(response, 200, SERVED_CONFIG, { 'content-type': CONTENT_TYPES['.js'], 'cache-control': 'no-cache' });
    const relative = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    const file = join(root, relative);
    if (file !== root && !file.startsWith(root + sep)) return send(response, 404, { error: 'NOT_FOUND' });
    try {
      const content = await readFile(file);
      return send(response, 200, content, { 'content-type': CONTENT_TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    } catch {
      return send(response, 404, { error: 'NOT_FOUND' });
    }
  }

  return async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost');
    const cors = corsHeaders(request);
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return await serveStatic(url.pathname, response);
      }
      if (request.method === 'OPTIONS') return send(response, 204, '', cors);
      if (request.method === 'GET' && url.pathname === '/api/health') {
        const night = currentNight(service.state);
        return send(response, 200, { ok: true, ready, telegram: Boolean(config.botToken), advisor: Boolean(advisor), bound: Object.keys(service.state.bindings), night: night.number, orders: night.orders.length }, cors);
      }
      if (request.method === 'GET' && url.pathname === '/api/orders/status') {
        if (!statusLimiter.take(clientOrigin(request, config.trustProxy))) return send(response, 429, { error: 'RATE_LIMITED' }, { ...cors, 'cache-control': 'no-store' });
        try {
          return send(response, 200, service.orderStatus(url.searchParams.get('code') || '', url.searchParams.get('since') || ''), { ...cors, 'cache-control': 'no-store' });
        } catch {
          return send(response, 422, { error: 'ORDER_CODE_INVALID' }, cors);
        }
      }
      if (request.method !== 'POST') return send(response, 405, { error: 'METHOD_NOT_ALLOWED' }, cors);
      if (url.pathname === '/api/suggestions') {
        if (!suggester) return send(response, 503, { error: 'ADVISOR_OFF' }, cors);
        if (!suggestionLimiter.take(clientOrigin(request, config.trustProxy))) return send(response, 429, { error: 'RATE_LIMITED' }, cors);
        const text = cleanSuggestionText((await readJson(request))?.text);
        if (!text) return send(response, 422, { error: 'TEXT_REQUIRED' }, cors);
        const result = await suggester.suggest(text);
        if (result.error) return send(response, result.error === 'RATE_LIMITED' ? 429 : 502, { error: result.error }, cors);
        return send(response, 200, result, { ...cors, 'cache-control': 'no-store' });
      }
      if (!ready) return send(response, 503, { error: 'NOT_CONFIGURED' }, cors);
      const body = await readJson(request);

      if (url.pathname === '/api/staff/sessions') {
        const name = String(body.name || '').trim().slice(0, 24);
        if (!name) return send(response, 422, { error: 'NAME_REQUIRED' }, cors);
        const result = auth.login(String(body.pin || ''), name, clientOrigin(request, config.trustProxy));
        if (result.error) return send(response, result.error === 'LOCKED' ? 429 : 401, { error: result.error }, cors);
        return send(response, 201, result, cors);
      }

      if (url.pathname === '/api/orders') {
        const session = auth.verify(String(request.headers.authorization || '').replace(/^Bearer /, ''));
        if (!session) return send(response, 401, { error: 'SESSION_INVALID' }, cors);
        const result = await service.confirmOrder({ code: String(body.code || ''), staff: session.name, force: body.force === true });
        if (result.error) return send(response, ERROR_STATUS[result.error] || 422, result, cors);
        return send(response, 201, result, cors);
      }
      return send(response, 404, { error: 'NOT_FOUND' }, cors);
    } catch (error) {
      const status = error.message === 'BODY_TOO_LARGE' ? 413 : error instanceof SyntaxError ? 400 : 500;
      return send(response, status, { error: status === 500 ? 'INTERNAL' : 'BAD_REQUEST' }, cors);
    }
  };
}
