import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createHttpHandler } from '../server/http.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';

const webDir = fileURLToPath(new URL('../web/', import.meta.url));
const service = createService({ store: memoryEventStore(), telegram: null, optionIndex: buildOptionIndex(), venue: VENUE });
const auth = createAuth({ pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga' });
const config = { botToken: '', allowedOrigins: [], trustProxy: false };
const servers = { ready: createServer(createHttpHandler({ service, auth, config, webDir, ready: true })), off: createServer(createHttpHandler({ service, auth, config, webDir, ready: false })) };
const bases = {};

before(async () => {
  for (const [name, server] of Object.entries(servers)) {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    bases[name] = `http://127.0.0.1:${server.address().port}`;
  }
});
after(() => Object.values(servers).forEach((server) => server.close()));

const directives = (policy) => Object.fromEntries(policy.split(';').map((part) => part.trim().split(/\s+/)).filter(([name]) => name).map(([name, ...values]) => [name, values]));

function assertCommonHeaders(response, where) {
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains', where);
  assert.equal(response.headers.get('x-frame-options'), 'DENY', where);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', where);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer', where);
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin', where);
  assert.match(response.headers.get('permissions-policy'), /camera=\(\)/, where);
  assert.match(response.headers.get('permissions-policy'), /geolocation=\(\)/, where);
  const policy = directives(response.headers.get('content-security-policy'));
  assert.deepEqual(policy['frame-ancestors'], ["'none'"], where);
  return policy;
}

test('las páginas llevan una CSP estricta sin unsafe-inline', async () => {
  for (const path of ['/', '/index.html', '/moza.html', '/mesas.html', '/recibidos.html']) {
    const response = await fetch(`${bases.ready}${path}`);
    assert.equal(response.status, 200, path);
    const policy = assertCommonHeaders(response, path);
    assert.deepEqual(policy['default-src'], ["'none'"], path);
    assert.deepEqual(policy['script-src'], ["'self'"], path);
    assert.deepEqual(policy['style-src'], ["'self'", 'https://fonts.googleapis.com'], path);
    assert.deepEqual(policy['font-src'], ['https://fonts.gstatic.com'], path);
    assert.deepEqual(policy['connect-src'], ["'self'"], path);
    assert.deepEqual(policy['object-src'], ["'none'"], path);
    assert.deepEqual(policy['base-uri'], ["'none'"], path);
    assert.ok(!response.headers.get('content-security-policy').includes('unsafe'), path);
  }
});

test('las páginas no traen estilos ni código en línea que la CSP bloquearía', async () => {
  for (const path of ['/', '/moza.html', '/mesas.html', '/recibidos.html']) {
    const html = await (await fetch(`${bases.ready}${path}`)).text();
    assert.doesNotMatch(html, /\sstyle\s*=/i, path);
    assert.doesNotMatch(html, /<style/i, path);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, path);
    for (const tag of html.match(/<script[^>]*>/gi) || []) assert.match(tag, /\ssrc=/, `${path} ${tag}`);
  }
});

test('la API, los archivos y los errores también llevan las cabeceras, con default-src none', async () => {
  const requests = [
    ['ready', '/api/health'],
    ['ready', '/api/orders/status?code=v1.1.no1x1'],
    ['ready', '/api/nada'],
    ['ready', '/styles.css'],
    ['ready', '/config.js'],
    ['ready', '/no-existe.html'],
    ['off', '/api/staff/sessions', { method: 'POST', body: '{}' }],
    ['ready', '/api/health', { method: 'OPTIONS' }],
    ['ready', '/', { method: 'POST' }],
  ];
  for (const [which, path, init] of requests) {
    const where = `${init?.method || 'GET'} ${path}`;
    const response = await fetch(`${bases[which]}${path}`, init);
    const policy = assertCommonHeaders(response, where);
    assert.deepEqual(policy['default-src'], ["'none'"], where);
    if (!response.headers.get('content-type')?.startsWith('text/html')) assert.equal(policy['script-src'], undefined, where);
  }
});
