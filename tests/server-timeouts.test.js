import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SERVER_TIMEOUTS, createAppServer } from '../server/http.js';

test('el servidor corta encabezados lentos y pedidos colgados, y mantiene viva la conexión entre consultas del seguimiento', () => {
  assert.deepEqual(SERVER_TIMEOUTS, { headersTimeout: 20000, requestTimeout: 30000, keepAliveTimeout: 15000 });
  const server = createAppServer(() => {});
  assert.equal(server.headersTimeout, 20000);
  assert.equal(server.requestTimeout, 30000);
  assert.equal(server.keepAliveTimeout, 15000);
  assert.ok(server.headersTimeout <= server.requestTimeout);
  assert.ok(server.keepAliveTimeout > 8000);
});
