import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createLimiter, clientOrigin } from './limiter.js';
import { cleanSuggestionText } from './suggestions.js';

const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const MAX_BODY_BYTES = 4096;
const PAGE_POLICY = "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";
const RESOURCE_POLICY = "default-src 'none'; frame-ancestors 'none'";
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};
const ERROR_STATUS = { ORDER_ALREADY_SENT: 409, ORDER_CODE_INVALID: 422, PRODUCT_UNKNOWN: 422, TABLE_UNKNOWN: 422 };
const STAFF_STATUS = { PIN_INVALID: 401, KEY_INVALID: 401, SESSION_INVALID: 401, LOCKED: 429, TOO_MANY_REQUESTS: 429, ASK_LIMIT: 429, RATE_LIMITED: 429, NAME_REQUIRED: 422, ALREADY_ASKED: 409, NO_GROUP: 409, REQUEST_DENIED: 403, EMERGENCY_DISABLED: 403, REQUEST_EXPIRED: 410, TELEGRAM_UNAVAILABLE: 503 };
const bearer = (request) => String(request.headers.authorization || '').replace(/^Bearer /, '');

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

export const HTTP_LIMITS = {
  apiPerOrigin: 2000,
  staticPerOrigin: 2000,
  statusPerOrigin: 1200,
  statusPerCode: 30,
  suggestionsPerOrigin: 5,
  ordersPerSession: 30,
  forcePerCode: 3,
  forceWindowMs: 10 * 60 * 1000,
  maxKeys: 10000,
};

export const SERVER_TIMEOUTS = { headersTimeout: 20000, requestTimeout: 30000, keepAliveTimeout: 15000 };

export function createAppServer(handler) {
  return Object.assign(createServer(handler), SERVER_TIMEOUTS);
}

export function createHttpHandler({ service, staff, config, webDir, ready, suggester = null, now = Date.now, limits = {} }) {
  const root = resolve(webDir);
  const servedConfig = `export const CONFIG = {\n  apiBase: '',\n  showCurrencySign: false,\n  suggestions: ${Boolean(suggester)},\n  allowedQrOrigins: ${JSON.stringify(config.allowedOrigins)},\n};\n`;
  const caps = { ...HTTP_LIMITS, ...limits };
  const limiter = (limit, windowMs) => createLimiter({ limit, windowMs, now, maxKeys: caps.maxKeys });
  const apiLimiter = limiter(caps.apiPerOrigin);
  const staticLimiter = limiter(caps.staticPerOrigin);
  const statusLimiter = limiter(caps.statusPerOrigin);
  const statusCodeLimiter = limiter(caps.statusPerCode);
  const suggestionLimiter = limiter(caps.suggestionsPerOrigin);
  const orderLimiter = limiter(caps.ordersPerSession);
  const forceLimiter = limiter(caps.forcePerCode, caps.forceWindowMs);
  const credentials = (body) => ({ requestId: body.requestId, claimSecret: body.claimSecret });
  const staffRoutes = {
    '/api/staff/sessions': (body, request, origin) => [202, staff.request({ name: body.name, pin: body.pin, origin, userAgent: request.headers['user-agent'] })],
    '/api/staff/sessions/claim': (body) => {
      const result = staff.claim(credentials(body));
      return [result.token ? 201 : 200, result];
    },
    '/api/staff/sessions/ask': async (body) => [202, await staff.ask(credentials(body))],
    '/api/staff/sessions/emergency': async (body, request, origin) => [201, await staff.emergency({ ...credentials(body), setupKey: body.setupKey, origin })],
    '/api/staff/sessions/end': (body, request) => (staff.end(bearer(request)) ? [204, null] : [401, { error: 'SESSION_INVALID' }]),
  };
  const limited = (response, headers) => send(response, 429, { error: 'RATE_LIMITED' }, { ...headers, 'cache-control': 'no-store' });

  function send(response, status, body, headers = {}) {
    const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    const merged = { 'content-type': 'application/json; charset=utf-8', ...headers };
    const policy = merged['content-type'].startsWith('text/html') ? PAGE_POLICY : RESOURCE_POLICY;
    response.writeHead(status, { ...merged, ...SECURITY_HEADERS, 'content-security-policy': policy });
    response.end(payload);
  }

  function corsHeaders(request) {
    const origin = request.headers.origin;
    if (!origin || !config.allowedOrigins.includes(origin)) return {};
    return { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'Origin' };
  }

  async function serveStatic(pathname, response) {
    if (pathname === '/config.js') return send(response, 200, servedConfig, { 'content-type': CONTENT_TYPES['.js'], 'cache-control': 'no-cache' });
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
    const origin = clientOrigin(request, config.trustProxy);
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        if (!staticLimiter.take(origin)) return limited(response);
        return await serveStatic(url.pathname, response);
      }
      if (!apiLimiter.take(origin)) return limited(response, cors);
      if (request.method === 'OPTIONS') return send(response, 204, '', cors);
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return send(response, 200, { ok: true, ready }, cors);
      }
      if (request.method === 'GET' && url.pathname === '/api/orders/status') {
        const code = url.searchParams.get('code') || '';
        if (!statusCodeLimiter.take(`${origin} ${code}`) || !statusLimiter.take(origin)) return limited(response, cors);
        try {
          return send(response, 200, service.orderStatus(code, url.searchParams.get('since') || ''), { ...cors, 'cache-control': 'no-store' });
        } catch {
          return send(response, 422, { error: 'ORDER_CODE_INVALID' }, cors);
        }
      }
      if (request.method !== 'POST') return send(response, 405, { error: 'METHOD_NOT_ALLOWED' }, cors);
      if (url.pathname === '/api/suggestions') {
        if (!suggester) return send(response, 503, { error: 'ADVISOR_OFF' }, cors);
        if (!suggestionLimiter.take(origin)) return limited(response, cors);
        const text = cleanSuggestionText((await readJson(request))?.text);
        if (!text) return send(response, 422, { error: 'TEXT_REQUIRED' }, cors);
        const result = await suggester.suggest(text);
        if (result.error) return send(response, result.error === 'RATE_LIMITED' ? 429 : 502, { error: result.error }, cors);
        return send(response, 200, result, { ...cors, 'cache-control': 'no-store' });
      }
      if (!ready) return send(response, 503, { error: 'NOT_CONFIGURED' }, cors);
      const body = await readJson(request);

      const staffRoute = staffRoutes[url.pathname];
      if (staffRoute) {
        const [status, result] = await staffRoute(body, request, origin);
        if (result?.error) return send(response, STAFF_STATUS[result.error] || 422, { error: result.error }, { ...cors, 'cache-control': 'no-store' });
        return send(response, status, status === 204 ? '' : result, { ...cors, 'cache-control': 'no-store' });
      }

      if (url.pathname === '/api/orders') {
        const token = bearer(request);
        const session = staff.verify(token);
        if (!session) return send(response, 401, { error: 'SESSION_INVALID' }, cors);
        const code = String(body.code || '');
        const force = body.force === true;
        if (!orderLimiter.take(token) || (force && !forceLimiter.take(code))) return limited(response, cors);
        const result = await service.confirmOrder({ code, staff: session.name, sessionId: session.sessionId, force });
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
