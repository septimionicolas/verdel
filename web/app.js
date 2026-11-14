import { CONFIG } from './config.js';
import { VENUE, SECTIONS, TABLE_SUGGESTIONS, buildOptionIndex, formatAmount } from './menu.js';
import { encodeOrder, tableLabel } from './order-code.js';
import { qrSvg } from './qr.js';
import { ART } from './art.js';

const select = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const price = (cents) => (CONFIG.showCurrencySign ? '$' : '') + formatAmount(cents);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const viewTransitions = !reducedMotion && typeof document.startViewTransition === 'function';
const modestDevice = navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 2;
const FULL_GLASS_UNITS = 8;
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

if (viewTransitions) document.body.classList.add('has-view-transitions');

const order = new Map();
let sheetOpen = false;
let view = 'order';

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

function transition(update) {
  if (!viewTransitions) {
    update();
    return;
  }
  try {
    document.startViewTransition(update).updateCallbackDone.catch(() => {});
  } catch {
    update();
  }
}

function renderSheet() {
  sheet.hidden = !sheetOpen;
  orderView.hidden = view !== 'order';
  qrView.hidden = view !== 'qr';
  select('#sheet-title').textContent = view === 'qr' ? 'Mostrale este código' : 'Mi pedido';
  if (!sheetOpen) return;
  if (view === 'qr') paintQr();
  else paintOrderList();
}

function showView(name) {
  view = name;
  transition(renderSheet);
}

function paint() {
  const { units, cents } = totals();
  document.querySelectorAll('.option').forEach((button) => {
    const quantity = order.get(button.dataset.key) || 0;
    button.classList.toggle('in-order', quantity > 0);
    button.querySelector('.option-count').textContent = quantity > 0 ? quantity : '+';
  });
  orderBar.hidden = units === 0;
  orderBar.style.setProperty('--fill', String(Math.min(1, units / FULL_GLASS_UNITS)));
  document.body.classList.toggle('has-order-bar', units > 0);
  select('#order-bar-units').textContent = units === 1 ? '1 producto' : `${units} productos`;
  select('#order-bar-total').textContent = `$${formatAmount(cents)}`;
  if (!sheetOpen) return;
  if (units === 0) closeSheet();
  else if (view === 'order') paintOrderList();
}

function openSheet() {
  sheetOpen = true;
  view = 'order';
  transition(() => {
    renderSheet();
    select('#sheet-close').focus({ preventScroll: true });
  });
}

function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen = false;
  transition(() => {
    renderSheet();
    if (!orderBar.hidden) orderBar.focus({ preventScroll: true });
  });
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

let burstBubbles = () => {};

function celebrateAdd() {
  replay(orderBar, 'bump');
  burstBubbles();
  try {
    if (navigator.vibrate) navigator.vibrate(10);
  } catch {}
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
    celebrateAdd();
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
    celebrateAdd();
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
  if (event.key === 'Escape' && sheetOpen) closeSheet();
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

const MAX_PIXEL_RATIO = 1.5;
const scenes = [];
let frame = 0;

function createScene(canvas) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const scene = { canvas, context, width: 0, height: 0, bubbles: [], active: true };
  scene.measure = () => {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    scene.width = box.width;
    scene.height = box.height;
    canvas.width = Math.round(scene.width * ratio);
    canvas.height = Math.round(scene.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  scene.measure();
  return scene;
}

function createHeroBubble(scene, y) {
  return { x: Math.random() * scene.width, y: y === undefined ? scene.height + 10 : y, radius: 1.5 + Math.random() * 4.5, speed: 0.25 + Math.random() * 0.6, phase: Math.random() * 6.28, alpha: 0.1 + Math.random() * 0.2 };
}

function drawHero(scene) {
  const { context } = scene;
  context.clearRect(0, 0, scene.width, scene.height);
  for (const bubble of scene.bubbles) {
    bubble.y -= bubble.speed;
    bubble.phase += 0.02;
    context.beginPath();
    context.arc(bubble.x + Math.sin(bubble.phase) * 6, bubble.y, bubble.radius, 0, 6.283);
    context.strokeStyle = `rgba(244,174,37,${bubble.alpha})`;
    context.lineWidth = 1.4;
    context.stroke();
    if (bubble.y < -10) Object.assign(bubble, createHeroBubble(scene));
  }
}

function createAmbientBubble(scene, y, burst) {
  return {
    x: burst ? scene.width / 2 + (Math.random() - 0.5) * scene.width * 0.8 : Math.random() * scene.width,
    y,
    radius: 2 + Math.random() * (burst ? 5 : 8),
    speed: burst ? 2.4 + Math.random() * 3 : 0.18 + Math.random() * 0.5,
    depth: 0.12 + Math.random() * 0.5,
    phase: Math.random() * 6.28,
    alpha: burst ? 0.25 + Math.random() * 0.25 : 0.06 + Math.random() * 0.14,
    burst,
  };
}

let lastScroll = window.scrollY;

function drawAmbient(scene) {
  const { context, width, height } = scene;
  const scroll = window.scrollY;
  const drift = Math.max(-60, Math.min(60, scroll - lastScroll));
  lastScroll = scroll;
  context.clearRect(0, 0, width, height);
  for (const bubble of scene.bubbles) {
    bubble.y -= bubble.speed + drift * bubble.depth;
    bubble.phase += 0.015;
    if (bubble.burst) {
      bubble.speed = Math.max(0.6, bubble.speed * 0.988);
      bubble.alpha *= 0.996;
    } else if (bubble.y < -20) {
      bubble.y = height + 20;
      bubble.x = Math.random() * width;
    } else if (bubble.y > height + 30) {
      bubble.y = -20;
      bubble.x = Math.random() * width;
    }
    const x = bubble.x + Math.sin(bubble.phase) * 10 * bubble.depth;
    context.beginPath();
    context.arc(x, bubble.y, bubble.radius, 0, 6.283);
    context.strokeStyle = `rgba(244,174,37,${bubble.alpha})`;
    context.lineWidth = 1.4;
    context.stroke();
    context.beginPath();
    context.arc(x - bubble.radius * 0.3, bubble.y - bubble.radius * 0.3, bubble.radius * 0.22, 0, 6.283);
    context.fillStyle = `rgba(247,239,221,${bubble.alpha * 0.9})`;
    context.fill();
  }
  scene.bubbles = scene.bubbles.filter((bubble) => !bubble.burst || bubble.y > -20);
}

function tick() {
  for (const scene of scenes) if (scene.active) scene.draw(scene);
  frame = requestAnimationFrame(tick);
}

function startLoop() {
  cancelAnimationFrame(frame);
  if (!document.hidden && scenes.some((scene) => scene.active)) frame = requestAnimationFrame(tick);
}

if (!reducedMotion) {
  try {
    const hero = createScene(select('#bubbles'));
    if (hero) {
      hero.draw = drawHero;
      hero.bubbles = Array.from({ length: 24 }, () => createHeroBubble(hero, Math.random() * hero.height));
      scenes.push(hero);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
          hero.active = entry.isIntersecting;
          startLoop();
        }).observe(hero.canvas);
      }
    }
    const backdrop = select('#backdrop');
    if (!modestDevice) backdrop.classList.add('is-live');
    const ambient = modestDevice ? null : createScene(select('#ambient'));
    if (!ambient) backdrop.classList.remove('is-live');
    if (ambient) {
      ambient.draw = drawAmbient;
      ambient.bubbles = Array.from({ length: 28 }, () => createAmbientBubble(ambient, Math.random() * ambient.height, false));
      scenes.push(ambient);
      burstBubbles = () => {
        if (ambient.bubbles.length > 120) return;
        for (let count = 0; count < 16; count += 1) ambient.bubbles.push(createAmbientBubble(ambient, ambient.height + 10 + Math.random() * 40, true));
      };
    }
    window.addEventListener('resize', () => scenes.forEach((scene) => scene.measure()));
    document.addEventListener('visibilitychange', startLoop);
    startLoop();
  } catch {}
}
