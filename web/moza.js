import { CONFIG } from './config.js';
import { VENUE, buildOptionIndex, formatAmount } from './menu.js';
import { decodeOrder, priceOrder, tableLabel } from './order-code.js';

const STORAGE_KEY = 'verdel-staff';
const content = document.querySelector('#content');
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
const optionIndex = buildOptionIndex();
const code = decodeURIComponent(location.hash.slice(1));

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function readOrder() {
  if (!code) return null;
  try {
    return priceOrder(optionIndex, decodeOrder(code), VENUE.tableCount);
  } catch {
    return undefined;
  }
}

function orderCard(order) {
  const rows = order.lines.map((line) => `<li><span><b>${line.quantity} ×</b> ${escapeHtml(line.name)}</span><span>$${formatAmount(line.quantity * line.unitCents)}</span></li>`).join('');
  return `<section class="card"><h2>${tableLabel(order.table)}</h2><ul class="order-list">${rows}</ul><div class="sheet-total"><span>Total</span><strong class="numeric">$${formatAmount(order.totalCents)}</strong></div></section>`;
}

const status = (kind, text) => `<p class="status status-${kind}" role="status">${escapeHtml(text)}</p>`;

async function request(path, body, token) {
  const response = await fetch(`${CONFIG.apiBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function paintLogin(order, message = '') {
  content.innerHTML = `${orderCard(order)}<form id="login"><p class="staff-note">Es la primera vez en este celular. Poné tu nombre y el PIN del salón.</p><label class="field">Tu nombre<input id="staff-name" autocomplete="given-name" maxlength="24" required></label><label class="field">PIN del salón<input id="staff-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" required></label><button class="button" type="submit">Ingresar</button>${message}</form>`;
  document.querySelector('#login').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.querySelector('#staff-name').value.trim();
    const pin = document.querySelector('#staff-pin').value;
    try {
      const result = await request('/api/staff/sessions', { name, pin });
      if (result.status === 201) {
        writeSession({ token: result.data.token, name: result.data.name });
        paintConfirm(order);
      } else if (result.status === 429) {
        paintLogin(order, status('error', 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'));
      } else {
        paintLogin(order, status('error', 'El PIN no es correcto.'));
      }
    } catch {
      paintLogin(order, status('error', 'No hay conexión con el servidor. Probá de nuevo.'));
    }
  });
}

function paintConfirm(order, message = '', force = false) {
  const session = readSession();
  content.innerHTML = `${orderCard(order)}<button class="button" id="send" type="button">${force ? 'Enviar de nuevo igual' : 'Confirmar y enviar a Telegram'}</button>${message}<p class="staff-note staff-note-after">Ingresaste como ${escapeHtml(session.name)}.</p>`;
  document.querySelector('#send').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      const result = await request('/api/orders', { code, force }, session.token);
      if (result.status === 201) {
        const warning = result.data.telegram === 'sent' ? '' : status('warning', 'Quedó registrado, pero no llegó a Telegram. Avisale al encargado.');
        content.innerHTML = `${orderCard(order)}${status('ok', `Pedido #${result.data.number} enviado.`)}${warning}`;
      } else if (result.status === 409) {
        paintConfirm(order, status('warning', `Este pedido ya se envió como #${result.data.number}. Si es otra ronda igual, enviala de nuevo.`), true);
      } else if (result.status === 401) {
        writeSession(null);
        paintLogin(order, status('error', 'Tu ingreso venció. Poné el PIN otra vez.'));
      } else {
        paintConfirm(order, status('error', 'El pedido no se pudo enviar. Pedile al cliente que arme el código de nuevo.'));
      }
    } catch {
      paintConfirm(order, status('error', 'No hay conexión con el servidor. Probá de nuevo.'), force);
    }
  });
}

const order = readOrder();
if (order === null) {
  content.innerHTML = '<p class="staff-note">Abrí la cámara y escaneá el código que te muestra el cliente en su celular.</p>';
} else if (order === undefined) {
  content.innerHTML = status('error', 'Este código no se pudo leer. Pedile al cliente que lo arme de nuevo.');
} else if (CONFIG.apiBase === null) {
  content.innerHTML = orderCard(order) + status('warning', 'Telegram todavía no está conectado. Tomá el pedido desde esta pantalla.');
} else if (readSession()) {
  paintConfirm(order);
} else {
  paintLogin(order);
}
