import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { CONFIG } from '../web/config.js';
import { createHttpHandler } from '../server/http.js';
import { createService } from '../server/service.js';
import { memoryEventStore } from '../server/store.js';
import { resolveQrBase } from '../web/qr-base.js';

const page = 'https://verdel.example/mesas.html?base=x#arriba';

test('sin base, los QR apuntan a la carpeta de la página', () => {
  assert.deepEqual(resolveQrBase(null, page, []), { href: 'https://verdel.example/', accepted: true });
  assert.deepEqual(resolveQrBase('', page, []), { href: 'https://verdel.example/', accepted: true });
});

test('una base del mismo origen se acepta sin consulta ni ancla', () => {
  assert.deepEqual(resolveQrBase('https://verdel.example/carta/?x=1#y', page, []), { href: 'https://verdel.example/carta/', accepted: true });
  assert.deepEqual(resolveQrBase('/carta/', page, []), { href: 'https://verdel.example/carta/', accepted: true });
});

test('una base de la lista corta se acepta', () => {
  const allowed = ['https://verdel.panelpro.tech', 'https://otro.example/'];
  assert.deepEqual(resolveQrBase('https://verdel.panelpro.tech/', page, allowed), { href: 'https://verdel.panelpro.tech/', accepted: true });
  assert.deepEqual(resolveQrBase('https://otro.example/carta/', page, allowed), { href: 'https://otro.example/carta/', accepted: true });
});

test('cualquier otro origen se rechaza y vuelve a la carpeta de la página', () => {
  const fallback = { href: 'https://verdel.example/', accepted: false };
  const allowed = ['https://verdel.panelpro.tech'];
  for (const requested of ['https://trampa.example/', 'http://verdel.panelpro.tech/', 'https://verdel.panelpro.tech.trampa.example/', '//trampa.example/', 'javascript:alert(1)', 'data:text/html,hola', 'https://verdel.example@trampa.example/', 'http://[::1', 'https://verdel.panelpro.tech:8443/']) {
    assert.deepEqual(resolveQrBase(requested, page, allowed), fallback, requested);
  }
  assert.deepEqual(resolveQrBase('https://verdel.panelpro.tech/', page, ['no es una dirección']), fallback);
});

test('la lista corta sale de ALLOWED_ORIGINS en la configuración servida y viene vacía en la estática', async () => {
  assert.deepEqual(CONFIG.allowedQrOrigins, []);
  const service = createService({ store: memoryEventStore(), telegram: null, optionIndex: buildOptionIndex(), venue: VENUE });
  const webDir = fileURLToPath(new URL('../web/', import.meta.url));
  const config = { botToken: '', allowedOrigins: ['https://verdel.panelpro.tech'], trustProxy: false };
  const server = createServer(createHttpHandler({ service, config, webDir, ready: true }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const source = await (await fetch(`http://127.0.0.1:${server.address().port}/config.js`)).text();
  server.close();
  const served = (await import(`data:text/javascript,${encodeURIComponent(source)}`)).CONFIG;
  assert.deepEqual(served.allowedQrOrigins, ['https://verdel.panelpro.tech']);
});
