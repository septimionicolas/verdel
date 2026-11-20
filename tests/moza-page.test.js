import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../web/config.js';
import { encodeOrder } from '../web/order-code.js';

let visit = 0;

async function openPage(hash) {
  const content = { innerHTML: '' };
  const quiet = { addEventListener() {}, value: '' };
  globalThis.document = { querySelector: (selector) => (selector === '#content' ? content : quiet) };
  globalThis.location = { hash };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  CONFIG.apiBase = 'https://verdel.example';
  visit += 1;
  await import(`../web/moza.js?visita=${visit}`);
  return content.innerHTML;
}

const pinInput = (html) => html.match(/<input id="staff-pin"[^>]*>/)[0];

test('el campo del PIN acepta letras y no corta claves largas', async () => {
  const html = await openPage(`#${encodeOrder(3, [{ key: 'no1', quantity: 1 }])}`);
  const input = pinInput(html);
  assert.doesNotMatch(input, /maxlength/);
  assert.doesNotMatch(input, /inputmode="numeric"/);
  assert.match(input, /type="password"/);
  assert.match(input, /autocapitalize="off"/);
});
