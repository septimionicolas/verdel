import { CONFIG } from './config.js';
import { VENUE, SECTIONS, TABLE_SUGGESTIONS, buildOptionIndex, formatAmount } from './menu.js';
import { encodeOrder, tableLabel } from './order-code.js';
import { qrSvg } from './qr.js';
import { ART } from './art.js';

const select = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const price = (cents) => (CONFIG.showCurrencySign ? '$' : '') + formatAmount(cents);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const optionIndex = buildOptionIndex();
const STORAGE_KEY = 'verdel-order';

const tableParam = new URLSearchParams(location.search).get('mesa') || '';
let table = /^\d{1,2}$/.test(tableParam) && Number(tableParam) <= VENUE.tableCount ? Number(tableParam) : null;

function renderOption(key) {
  const { option, name } = optionIndex.get(key);
  const saving = option.listCents > option.priceCents ? `<span class="option-saving">Ahorrás ${formatAmount(option.listCents - option.priceCents)}</span>` : '';
  const label = option.label ? `<span class="option-label">${escapeHtml(option.label)}</span>` : '';
  return `<button type="button" class="option${option.featured ? ' option-featured' : ''}" data-key="${key}" aria-label="Sumar ${escapeHtml(name)}, ${formatAmount(option.priceCents)} pesos">${label}<span class="option-price">${price(option.priceCents)}</span>${saving}<span class="option-count" aria-hidden="true">+</span></button>`;
}

function renderRow(item) {
  const multiple = item.options.length > 1;
  const photo = item.photo ? `<img class="photo" src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.longName || item.name)}" loading="lazy">` : '';
  const note = item.note ? `<p>${escapeHtml(item.note)}</p>` : '';
  const options = item.options.map((_, position) => renderOption(`${item.code}${position}`)).join('');
  return `<article class="row${multiple ? ' row-multi' : ''}">${photo}<div><h3>${escapeHtml(item.name)}</h3>${note}</div><div class="options${item.options.length > 2 ? ' options-three' : ''}">${options}</div></article>`;
}

function renderSection(section) {
  return `<section class="menu-section" id="section-${section.id}" data-id="${section.id}"><header class="section-head"><div><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.hook)}</p></div>${ART[section.art] || ''}</header><div>${section.items.map(renderRow).join('')}</div></section>`;
}

function renderTableBuilder() {
  const tabs = TABLE_SUGGESTIONS.map((suggestion, position) => `<button type="button" data-suggestion="${position}" aria-pressed="${position === 0}">${escapeHtml(suggestion.label)}</button>`).join('');
  return `<section class="table-builder" aria-labelledby="table-builder-title"><h2 id="table-builder-title">¿Cuántos son en la mesa?</h2><p class="table-builder-note">Elegí y te armamos una ronda para arrancar.</p><div class="table-tabs" role="group" aria-label="Cantidad de personas">${tabs}</div><div class="suggestion" id="suggestion"></div></section>`;
}

function paintSuggestion(position) {
  const entries = TABLE_SUGGESTIONS[position].keys.map((key) => optionIndex.get(key));
  const totalCents = entries.reduce((sum, entry) => sum + entry.option.priceCents, 0);
  const rows = entries.map((entry) => `<li><span>${escapeHtml(entry.name)}</span><span class="numeric">${price(entry.option.priceCents)}</span></li>`).join('');
  select('#suggestion').innerHTML = `<ul>${rows}</ul><div class="suggestion-footer"><p>Total<strong class="numeric">${price(totalCents)}</strong></p><button type="button" class="button" data-add-suggestion="${position}">Sumar a mi pedido</button></div>`;
  document.querySelectorAll('[data-suggestion]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.suggestion) === position)));
}

const menu = select('#menu');
const nav = select('#section-nav');
const orderBar = select('#order-bar');
const sheet = select('#sheet');
const orderView = select('#order-view');
const qrView = select('#qr-view');

menu.innerHTML = renderTableBuilder() + SECTIONS.map(renderSection).join('');
nav.innerHTML = SECTIONS.map((section, position) => `<button type="button" class="nav-chip${position === 0 ? ' is-active' : ''}" data-go="${section.id}">${escapeHtml(section.shortTitle || section.title)}</button>`).join('');
paintSuggestion(0);

if (table !== null) {
  const chip = select('#table-chip');
  chip.textContent = tableLabel(table);
  chip.hidden = false;
}

const order = new Map();

function saveOrder() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...order]));
  } catch {}
}

function loadOrder() {
  try {
    for (const [key, quantity] of JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')) {
      if (optionIndex.has(key) && quantity > 0) order.set(key, quantity);
    }
  } catch {}
}

function totals() {
  let units = 0;
  let cents = 0;
  for (const [key, quantity] of order) {
    units += quantity;
    cents += quantity * optionIndex.get(key).option.priceCents;
  }
  return { units, cents };
}

function changeQuantity(key, delta) {
  const quantity = Math.min(99, (order.get(key) || 0) + delta);
  if (quantity <= 0) order.delete(key);
  else order.set(key, quantity);
  saveOrder();
  paint();
}

function paintOrderList() {
  select('#order-list').innerHTML = [...order].map(([key, quantity]) => {
    const entry = optionIndex.get(key);
    const name = escapeHtml(entry.name);
    return `<li><div class="line"><b>${name}</b><span class="numeric">$${formatAmount(quantity * entry.option.priceCents)}</span></div><div class="stepper"><button type="button" data-step="-1" data-key="${key}" aria-label="Quitar uno de ${name}">−</button><span>${quantity}</span><button type="button" data-step="1" data-key="${key}" aria-label="Sumar uno de ${name}">+</button></div></li>`;
  }).join('');
  select('#sheet-total').textContent = `$${formatAmount(totals().cents)}`;
}

function paintQr() {
  const box = select('#qr-box');
  select('#table-picker').hidden = tableParam !== '' && table !== null;
  select('#qr-total').textContent = `$${formatAmount(totals().cents)}`;
  if (table === null) {
    box.className = 'qr-box is-empty';
    box.textContent = 'Elegí tu mesa para ver el código.';
    select('#qr-table').textContent = '';
    return;
  }
  const lines = [...order].map(([key, quantity]) => ({ key, quantity }));
  const target = new URL('moza.html', location.href);
  target.search = '';
  target.hash = encodeOrder(table, lines);
  box.className = 'qr-box';
  box.innerHTML = qrSvg(target.href, { dark: '#0E2B21', light: '#F7EFDD', margin: 3 });
  select('#qr-table').textContent = tableLabel(table);
}

function showView(name) {
  orderView.hidden = name !== 'order';
  qrView.hidden = name !== 'qr';
  select('#sheet-title').textContent = name === 'qr' ? 'Mostrale este código' : 'Mi pedido';
  if (name === 'qr') paintQr();
  else paintOrderList();
}

function paint() {
  const { units, cents } = totals();
  document.querySelectorAll('.option').forEach((button) => {
    const quantity = order.get(button.dataset.key) || 0;
    button.classList.toggle('in-order', quantity > 0);
    button.querySelector('.option-count').textContent = quantity > 0 ? quantity : '+';
  });
  orderBar.hidden = units === 0;
  document.body.classList.toggle('has-order-bar', units > 0);
  select('#order-bar-units').textContent = units === 1 ? '1 producto' : `${units} productos`;
  select('#order-bar-total').textContent = `$${formatAmount(cents)}`;
  if (sheet.hidden) return;
  if (units === 0) closeSheet();
  else showView('order');
}

function openSheet() {
  sheet.hidden = false;
  showView('order');
  select('#sheet-close').focus();
}

function closeSheet() {
  sheet.hidden = true;
  if (!orderBar.hidden) orderBar.focus();
}

let toastTimer = 0;
function notify(text) {
  const toast = select('#toast');
  toast.textContent = text;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2000);
}

function replay(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

const tableSelect = select('#table-select');
tableSelect.innerHTML = '<option value="">Elegí tu mesa</option>' + Array.from({ length: VENUE.tableCount }, (_, position) => `<option value="${position + 1}">Mesa ${position + 1}</option>`).join('') + '<option value="0">Barra</option>';
tableSelect.addEventListener('change', () => {
  table = tableSelect.value === '' ? null : Number(tableSelect.value);
  paintQr();
});

document.addEventListener('click', (event) => {
  const option = event.target.closest('.option');
  if (option) {
    changeQuantity(option.dataset.key, 1);
    replay(option, 'pulse');
    replay(orderBar, 'bump');
    return;
  }
  const go = event.target.closest('[data-go]');
  if (go) {
    document.getElementById(`section-${go.dataset.go}`).scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  const suggestion = event.target.closest('[data-suggestion]');
  if (suggestion) {
    paintSuggestion(Number(suggestion.dataset.suggestion));
    return;
  }
  const addSuggestion = event.target.closest('[data-add-suggestion]');
  if (addSuggestion) {
    TABLE_SUGGESTIONS[Number(addSuggestion.dataset.addSuggestion)].keys.forEach((key) => changeQuantity(key, 1));
    replay(orderBar, 'bump');
    notify('Sumado a tu pedido');
    return;
  }
  const step = event.target.closest('[data-step]');
  if (step) {
    changeQuantity(step.dataset.key, Number(step.dataset.step));
    return;
  }
  if (event.target.closest('[data-close]')) closeSheet();
  else if (event.target.closest('#order-bar')) openSheet();
  else if (event.target.closest('#confirm-order')) showView('qr');
  else if (event.target.closest('#back-to-order')) showView('order');
  else if (event.target.closest('#clear-order') || event.target.closest('#order-done')) {
    const confirmed = Boolean(event.target.closest('#order-done'));
    order.clear();
    saveOrder();
    paint();
    notify(confirmed ? 'Pedido confirmado. ¡Salud!' : 'Pedido vaciado');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !sheet.hidden) closeSheet();
});

loadOrder();
paint();

function activate(id) {
  nav.querySelectorAll('.nav-chip').forEach((chip) => {
    const active = chip.dataset.go === id;
    chip.classList.toggle('is-active', active);
    if (active) nav.scrollTo({ left: chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2, behavior: reducedMotion ? 'auto' : 'smooth' });
  });
}

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && activate(entry.target.dataset.id)), { rootMargin: '-70px 0px -65% 0px' });
  document.querySelectorAll('.menu-section').forEach((section) => observer.observe(section));
}

const brand = select('#brand');
if (!reducedMotion) {
  brand.classList.add('is-pouring');
  brand.addEventListener('click', () => replay(brand, 'is-pouring'));
}

const canvas = select('#bubbles');
const context = canvas.getContext('2d');
let bubbles = [];
let width = 0;
let height = 0;
let frame = 0;
let running = false;

function measure() {
  const box = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = box.width;
  height = box.height;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function createBubble(y) {
  return { x: Math.random() * width, y: y === undefined ? height + 10 : y, radius: 1.5 + Math.random() * 4.5, speed: 0.25 + Math.random() * 0.6, phase: Math.random() * 6.28, alpha: 0.1 + Math.random() * 0.2 };
}

function draw() {
  context.clearRect(0, 0, width, height);
  for (const bubble of bubbles) {
    bubble.y -= bubble.speed;
    bubble.phase += 0.02;
    context.beginPath();
    context.arc(bubble.x + Math.sin(bubble.phase) * 6, bubble.y, bubble.radius, 0, 6.283);
    context.strokeStyle = `rgba(244,174,37,${bubble.alpha})`;
    context.lineWidth = 1.4;
    context.stroke();
    if (bubble.y < -10) Object.assign(bubble, createBubble());
  }
  frame = requestAnimationFrame(draw);
}

if (!reducedMotion && context) {
  measure();
  bubbles = Array.from({ length: 24 }, () => createBubble(Math.random() * height));
  window.addEventListener('resize', measure);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) {
        running = true;
        draw();
      } else if (!entry.isIntersecting && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
    }).observe(canvas);
  } else {
    running = true;
    draw();
  }
}
