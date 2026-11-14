import { CONFIG } from './config.js';
import { VENUE, SECTIONS, ROUND_QUESTIONS, pickRound, PAIRINGS, FOOD_SECTIONS, DRINK_SECTIONS, buildOptionIndex, formatAmount } from './menu.js';
import { decodeOrder, encodeOrder, priceOrder, tableLabel } from './order-code.js';
import { qrSvg } from './qr.js';
import { ART } from './art.js';

const select = (selector) => document.querySelector(selector);
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const price = (cents) => (CONFIG.showCurrencySign ? '$' : '') + formatAmount(cents);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const viewTransitions = !reducedMotion && typeof document.startViewTransition === 'function';
const modestDevice = navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 2;
const FULL_GLASS_UNITS = 8;
const PAIRING_SECONDS = 8;
const optionIndex = buildOptionIndex();
const STORAGE_KEY = 'verdel-order';
const WATCH_KEY = 'verdel-watch';
const WAITING_POLL_MS = 5000;
const TRACKING_POLL_MS = 8000;
const RATE_LIMITED_POLL_MS = 30000;
const WATCH_LIMIT_MS = 60 * 60 * 1000;
const tracking = CONFIG.apiBase !== null;
const sectionOf = new Map(SECTIONS.flatMap((section) => section.items.map((item) => [item.code, section.id])));

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

const DEFAULT_ANSWERS = { people: '2', hunger: 'snack', taste: 'soft' };
const answers = { ...DEFAULT_ANSWERS };

function renderRoundBuilder() {
  const questions = ROUND_QUESTIONS.map((question) => {
    const chips = question.choices.map((choice) => `<button type="button" data-question="${question.id}" data-value="${escapeHtml(choice.value)}" aria-pressed="false">${escapeHtml(choice.label)}</button>`).join('');
    return `<div class="round-question"><p id="question-${question.id}">${escapeHtml(question.label)}</p><div class="round-chips" role="group" aria-labelledby="question-${question.id}">${chips}</div></div>`;
  }).join('');
  return `<section class="round-builder" id="round-builder" aria-labelledby="round-builder-title"><h2 id="round-builder-title">¿Qué tomamos?</h2><p class="round-builder-note">Tres toques y te armamos la ronda.</p>${questions}<div class="round-out" id="round-out" aria-live="polite"></div></section>`;
}

function roundLines(keys) {
  const counts = new Map();
  for (const key of keys) if (optionIndex.has(key)) counts.set(key, (counts.get(key) || 0) + 1);
  return [...counts].map(([key, quantity]) => ({ key, quantity, entry: optionIndex.get(key) }));
}

function paintRound() {
  document.querySelectorAll('[data-question]').forEach((button) => button.setAttribute('aria-pressed', String(answers[button.dataset.question] === button.dataset.value)));
  const out = select('#round-out');
  const missing = ROUND_QUESTIONS.filter((question) => !answers[question.id]).length;
  if (missing) {
    out.innerHTML = `<p class="round-wait">${missing === ROUND_QUESTIONS.length ? 'Elegí una opción de cada fila.' : missing === 1 ? 'Te falta un toque.' : `Te faltan ${missing} toques.`}</p>`;
    return;
  }
  const round = pickRound(answers);
  const lines = round ? roundLines(round.keys) : [];
  if (!lines.length) {
    out.innerHTML = '<p class="round-wait">Para esta combinación no tenemos ronda armada: mirá la carta.</p>';
    return;
  }
  let totalCents = 0;
  let savingCents = 0;
  const rows = lines.map(({ quantity, entry }) => {
    totalCents += quantity * entry.option.priceCents;
    if (entry.option.listCents > entry.option.priceCents) savingCents += quantity * (entry.option.listCents - entry.option.priceCents);
    return `<li><span>${quantity > 1 ? `${quantity} × ` : ''}${escapeHtml(entry.name)}</span><span class="numeric">${price(quantity * entry.option.priceCents)}</span></li>`;
  }).join('');
  const saving = savingCents ? `<span class="round-saving">Ahorrás $${formatAmount(savingCents)} con las promos</span>` : '';
  out.innerHTML = `<div class="round-result"><p class="round-phrase">${escapeHtml(round.phrase)}</p><ul class="round-list">${rows}</ul><div class="round-footer"><p>Total<strong class="numeric">$${formatAmount(totalCents)}</strong>${saving}</p><button type="button" class="button" id="add-round">Sumar a mi pedido</button></div><button type="button" class="link-button" id="reset-round">Volver a elegir</button></div>`;
}

const menu = select('#menu');
const nav = select('#section-nav');
const orderBar = select('#order-bar');
const sheet = select('#sheet');
const orderView = select('#order-view');
const qrView = select('#qr-view');
const trackView = select('#track-view');

menu.innerHTML = renderRoundBuilder() + SECTIONS.map(renderSection).join('');
nav.innerHTML = SECTIONS.map((section, position) => `<button type="button" class="nav-chip${position === 0 ? ' is-active' : ''}" data-go="${section.id}">${escapeHtml(section.shortTitle || section.title)}</button>`).join('');
paintRound();

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
  dropWaitingWatch();
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
  if (lines.length) startWatch(target.hash.slice(1));
}

let watch = null;
let watchTimer = 0;
let watchBusy = false;

function saveWatch() {
  try {
    if (watch && watch.phase !== 'done' && watch.since) localStorage.setItem(WATCH_KEY, JSON.stringify({ code: watch.code, since: watch.since }));
    else localStorage.removeItem(WATCH_KEY);
  } catch {}
}

function loadWatch() {
  if (!tracking) return;
  try {
    const saved = JSON.parse(localStorage.getItem(WATCH_KEY) || 'null');
    if (saved && typeof saved.code === 'string' && typeof saved.since === 'string') watch = { code: saved.code, since: saved.since, phase: 'waiting' };
  } catch {}
}

function startWatch(code) {
  if (!tracking || (watch && watch.phase === 'waiting' && watch.code === code)) return;
  watch = { code, since: null, phase: 'waiting' };
  saveWatch();
  pollWatch();
}

function stopWatch() {
  clearTimeout(watchTimer);
  watch = null;
  saveWatch();
}

function dropWaitingWatch() {
  if (watch && watch.phase === 'waiting') stopWatch();
}

function scheduleWatch(delay) {
  clearTimeout(watchTimer);
  if (watch && watch.phase !== 'done') watchTimer = setTimeout(pollWatch, delay);
}

async function pollWatch() {
  if (!watch || watch.phase === 'done' || watchBusy || document.hidden) return;
  const current = watch;
  let delay = current.phase === 'waiting' ? WAITING_POLL_MS : TRACKING_POLL_MS;
  watchBusy = true;
  try {
    const params = new URLSearchParams({ code: current.code });
    if (current.since) params.set('since', current.since);
    const response = await fetch(`${CONFIG.apiBase}/api/orders/status?${params}`, { cache: 'no-store' });
    if (response.status === 429) delay = RATE_LIMITED_POLL_MS;
    else if (response.ok && current === watch) {
      const data = await response.json();
      if (!current.since) {
        current.since = data.at;
        saveWatch();
      } else {
        applyStatus(current, data);
      }
    }
  } catch {}
  watchBusy = false;
  if (current === watch) scheduleWatch(delay);
  else if (watch) pollWatch();
}

function applyStatus(current, data) {
  const expired = Date.parse(data.at) - Date.parse(current.since) > WATCH_LIMIT_MS;
  if (!['received', 'cooking', 'ready', 'voided'].includes(data.state)) {
    if (expired) stopWatch();
    return;
  }
  const changed = current.state !== data.state;
  current.state = data.state;
  current.number = data.number;
  if (current.phase === 'waiting') {
    try {
      const priced = priceOrder(optionIndex, decodeOrder(current.code), VENUE.tableCount);
      Object.assign(current, { table: priced.table, totalCents: priced.totalCents, hasKitchen: priced.lines.some((line) => line.kitchen.length > 0) });
    } catch {
      stopWatch();
      return;
    }
    current.phase = 'tracking';
    order.clear();
    saveOrder();
    hidePairing();
    sheetOpen = true;
    view = 'track';
    transition(renderSheet);
    paint();
    notify(`La moza confirmó tu pedido #${data.number}`);
  } else if (changed) {
    if (sheetOpen && view === 'track') paintTrack();
    else if (data.state === 'ready') notify(`¡Tu pedido #${data.number} está listo!`);
    else if (data.state === 'voided') notify(`La moza anuló el pedido #${data.number}`);
    paint();
  }
  if (data.state === 'ready' || data.state === 'voided' || expired) {
    current.phase = 'done';
    clearTimeout(watchTimer);
    saveWatch();
    if (data.state === 'ready') {
      try {
        if (navigator.vibrate) navigator.vibrate([20, 60, 20]);
      } catch {}
    }
  }
}

const TRACK_STEPS = {
  kitchen: [['Recibido', 'La moza confirmó tu pedido.'], ['En cocina', 'Lo están preparando.'], ['Listo para retirar', 'Ya sale para tu mesa.']],
  bar: [['Recibido', 'La moza confirmó tu pedido.'], ['En la barra', 'Las bebidas salen directo para tu mesa.']],
};
const TRACK_STATE_LABELS = { received: 'Recibido', cooking: 'En cocina', ready: 'Listo para retirar', voided: 'Anulado' };

function paintTrack() {
  if (!watch || watch.phase === 'waiting') return;
  const steps = watch.hasKitchen ? TRACK_STEPS.kitchen : TRACK_STEPS.bar;
  const reached = watch.state === 'ready' ? steps.length : 1;
  const voided = watch.state === 'voided';
  select('#track-note').textContent = `Pedido #${watch.number} · ${tableLabel(watch.table)} · $${formatAmount(watch.totalCents)}`;
  select('#track-bar').hidden = voided;
  select('#track-steps').hidden = voided;
  select('#track-steps').innerHTML = steps.map(([title, detail], position) => {
    const done = position < reached;
    const state = done ? ' class="is-done"' : position === reached ? ' class="is-now"' : '';
    return `<li${state}><i aria-hidden="true">${done ? '✓' : position + 1}</i><div><b>${escapeHtml(title)}</b><span>${escapeHtml(detail)}</span></div></li>`;
  }).join('');
  const progress = select('#track-progress');
  const target = String(watch.state === 'ready' ? 1 : 0.5);
  if (progress.style.getPropertyValue('--progress') !== target) {
    progress.style.setProperty('--progress', '.12');
    requestAnimationFrame(() => requestAnimationFrame(() => progress.style.setProperty('--progress', target)));
  }
  const outcome = select('#track-outcome');
  if (watch.state === 'ready') outcome.innerHTML = `<p class="cheers">¡Salud, ${watch.table === 0 ? 'Barra' : `mesa ${watch.table}`}!</p>`;
  else if (voided) outcome.innerHTML = '<p class="status status-warning">La moza anuló este pedido.</p>';
  else outcome.innerHTML = '';
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
  trackView.hidden = view !== 'track';
  select('#sheet-title').textContent = { order: 'Mi pedido', qr: 'Mostrale este código', track: 'Tu pedido en camino' }[view];
  if (!sheetOpen) return;
  if (view === 'qr') paintQr();
  else if (view === 'track') paintTrack();
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
  const followed = units === 0 && watch !== null && watch.phase !== 'waiting';
  orderBar.hidden = units === 0 && !followed;
  orderBar.style.setProperty('--fill', String(followed ? 1 : Math.min(1, units / FULL_GLASS_UNITS)));
  document.body.classList.toggle('has-order-bar', !orderBar.hidden);
  select('#order-bar-units').textContent = followed ? `Pedido #${watch.number} · ${TRACK_STATE_LABELS[watch.state]}` : units === 1 ? '1 producto' : `${units} productos`;
  select('#order-bar-total').textContent = `$${formatAmount(followed ? watch.totalCents : cents)}`;
  if (units === 0 || hasDrink()) hidePairing();
  if (!sheetOpen) return;
  if (units === 0 && view !== 'track') closeSheet();
  else if (view === 'order') paintOrderList();
}

function openSheet() {
  hidePairing();
  sheetOpen = true;
  view = order.size === 0 && watch && watch.phase !== 'waiting' ? 'track' : 'order';
  transition(() => {
    renderSheet();
    select('#sheet-close').focus({ preventScroll: true });
  });
}

function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen = false;
  if (watch && watch.phase === 'done') {
    watch = null;
    saveWatch();
    paint();
  }
  transition(() => {
    renderSheet();
    if (!orderBar.hidden) orderBar.focus({ preventScroll: true });
  });
}

const pairing = select('#pairing');
let pairingTimer = 0;
let pairingKey = '';

function hidePairing() {
  clearTimeout(pairingTimer);
  pairing.hidden = true;
  document.body.classList.remove('has-pairing');
}

function hasDrink() {
  return [...order.keys()].some((key) => DRINK_SECTIONS.includes(sectionOf.get(optionIndex.get(key).item.code)));
}

function suggestPairing(key) {
  const entry = optionIndex.get(key);
  const suggestion = entry && Object.hasOwn(PAIRINGS, entry.item.code) ? PAIRINGS[entry.item.code] : null;
  if (!suggestion || !FOOD_SECTIONS.includes(sectionOf.get(entry.item.code)) || hasDrink()) return;
  const drink = optionIndex.get(suggestion.drink);
  if (!drink) return;
  pairingKey = suggestion.drink;
  select('#pairing-title').textContent = `Con ${suggestion.food} va una ${drink.item.name}`;
  select('#pairing-detail').textContent = `${drink.option.label || 'De litro'} · $${formatAmount(drink.option.priceCents)}`;
  pairing.hidden = true;
  void pairing.offsetWidth;
  pairing.hidden = false;
  document.body.classList.add('has-pairing');
  clearTimeout(pairingTimer);
  pairingTimer = setTimeout(hidePairing, PAIRING_SECONDS * 1000);
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
    suggestPairing(option.dataset.key);
    return;
  }
  if (event.target.closest('#pairing-add')) {
    hidePairing();
    if (optionIndex.has(pairingKey)) changeQuantity(pairingKey, 1);
    celebrateAdd();
    notify('Sumado a tu pedido');
    return;
  }
  if (event.target.closest('#pairing-close')) {
    hidePairing();
    return;
  }
  const go = event.target.closest('[data-go]');
  if (go) {
    document.getElementById(`section-${go.dataset.go}`).scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  const chip = event.target.closest('[data-question]');
  if (chip) {
    answers[chip.dataset.question] = chip.dataset.value;
    paintRound();
    return;
  }
  if (event.target.closest('#add-round')) {
    const round = pickRound(answers);
    if (!round) return;
    roundLines(round.keys).forEach(({ key, quantity }) => changeQuantity(key, quantity));
    celebrateAdd();
    notify('Sumado a tu pedido');
    return;
  }
  if (event.target.closest('#reset-round')) {
    for (const question of ROUND_QUESTIONS) answers[question.id] = '';
    paintRound();
    select('[data-question]').focus();
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
  else if (event.target.closest('#track-done')) closeSheet();
  else if (event.target.closest('#clear-order') || event.target.closest('#order-done')) {
    const confirmed = Boolean(event.target.closest('#order-done'));
    dropWaitingWatch();
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
loadWatch();
paint();
if (watch) pollWatch();
if (tracking) {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollWatch();
  });
}

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
