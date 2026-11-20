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

const NAME_KEY = 'verdel-staff-name';
const POLL_MS = 2000;
let screen = 0;

function readName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

function rememberName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {}
}

function liveSession() {
  const session = readSession();
  if (session && session.token && Date.parse(session.expiresAt) > Date.now()) return session;
  if (session) writeSession(null);
  return null;
}

const ended = () => status('error', 'Tu turno terminó o te cerraron el ingreso. Ingresá de nuevo.');

function paint(html) {
  screen += 1;
  content.innerHTML = html;
  return screen;
}

function paintLogin(order, message = '') {
  paint(`${orderCard(order)}<form id="login"><p class="staff-note">Para confirmar pedidos tenés que ingresar. Dura hasta el cierre de la noche.</p><label class="field">Tu nombre<input id="staff-name" autocomplete="given-name" maxlength="24" required value="${escapeHtml(readName())}"></label><label class="field">PIN del salón<input id="staff-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" required></label><button class="button" type="submit">Seguir</button>${message}</form>`);
  document.querySelector('#login').addEventListener('submit', async (event) => {
    event.preventDefault();
    event.submitter?.setAttribute('disabled', '');
    const name = document.querySelector('#staff-name').value.trim();
    const pin = document.querySelector('#staff-pin').value;
    try {
      const result = await request('/api/staff/sessions', { name, pin });
      if (result.status === 202) {
        rememberName(name);
        paintWaiting(order, result.data);
      } else if (result.status === 401) {
        paintLogin(order, status('error', 'El PIN no es correcto.'));
      } else if (result.status === 429) {
        paintLogin(order, status('error', 'Hay demasiados intentos de ingreso. Esperá un rato y probá de nuevo; si no anda, avisale al encargado.'));
      } else if (result.status === 422) {
        paintLogin(order, status('error', 'Poné tu nombre.'));
      } else {
        paintLogin(order, status('error', 'No se pudo ingresar ahora. Avisale al encargado.'));
      }
    } catch {
      paintLogin(order, status('error', 'No hay conexión con el servidor. Probá de nuevo.'));
    }
  });
}

function signedIn(order, data) {
  writeSession({ token: data.token, name: data.name, expiresAt: data.expiresAt });
  paintConfirm(order);
}

const timedOut = 'Nadie confirmó a tiempo. Probá de nuevo o pedí el ingreso de emergencia.';

function waitingView(order, pending, message) {
  const telegram = pending.botLink ? `<a class="button" href="${escapeHtml(pending.botLink)}" target="_blank" rel="noopener">Abrir Telegram</a>` : '';
  const ask = pending.groupApproval ? '<button class="button button-secondary" id="ask" type="button">No tengo Telegram o no estoy en el grupo</button>' : '';
  const emergency = pending.emergency ? '<form id="emergency"><p class="staff-note">Ingreso de emergencia (lo hace el encargado)</p><label class="field">Clave de instalación<input id="setup-key" type="password" autocomplete="off" required></label><button class="button button-secondary" type="submit">Entrar</button></form>' : '';
  return `${orderCard(order)}<section class="card"><p class="staff-note">Ahora confirmate en Telegram.</p>${telegram}<p class="staff-note">Número de control: <b class="numeric">${escapeHtml(pending.matchCode)}</b></p>${ask}${message}${emergency}</section>`;
}

function paintWaiting(order, pending, message = '') {
  const mine = paint(waitingView(order, pending, message));
  const credentials = { requestId: pending.requestId, claimSecret: pending.claimSecret };
  const current = () => mine === screen;

  async function poll() {
    if (!current()) return;
    if (document.visibilityState === 'visible') {
      try {
        const result = await request('/api/staff/sessions/claim', credentials);
        if (!current()) return;
        if (result.status === 201) return signedIn(order, result.data);
        if (result.status === 410) return paintLogin(order, status('error', timedOut));
        if (result.status === 403) return paintLogin(order, status('error', 'El ingreso fue rechazado.'));
      } catch {}
    }
    setTimeout(poll, POLL_MS);
  }
  setTimeout(poll, POLL_MS);

  document.querySelector('#ask')?.addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      const result = await request('/api/staff/sessions/ask', credentials);
      if (!current()) return;
      if (result.status === 202 || result.status === 409) paintWaiting(order, { ...pending, groupApproval: false }, status('ok', `Le avisamos al grupo del salón. Mostrale el número ${pending.matchCode} al encargado.`));
      else if (result.status === 410) paintLogin(order, status('error', timedOut));
      else if (result.status === 429) paintWaiting(order, pending, status('warning', 'Hay muchos pedidos de ingreso. Esperá un rato o pedí el ingreso de emergencia.'));
      else paintWaiting(order, { ...pending, groupApproval: false }, status('error', 'No pudimos avisarle al grupo. Pedí el ingreso de emergencia.'));
    } catch {
      paintWaiting(order, pending, status('error', 'No hay conexión con el servidor. Probá de nuevo.'));
    }
  });

  document.querySelector('#emergency')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const setupKey = document.querySelector('#setup-key').value;
    try {
      const result = await request('/api/staff/sessions/emergency', { ...credentials, setupKey });
      if (!current()) return;
      if (result.status === 201) signedIn(order, result.data);
      else if (result.status === 401) paintWaiting(order, pending, status('error', 'La clave no es correcta.'));
      else if (result.status === 429) paintWaiting(order, pending, status('error', 'Hay demasiados intentos. Esperá un rato.'));
      else paintLogin(order, status('error', timedOut));
    } catch {
      paintWaiting(order, pending, status('error', 'No hay conexión con el servidor. Probá de nuevo.'));
    }
  });
}

function paintConfirm(order, message = '', force = false) {
  const session = liveSession();
  if (!session) return paintLogin(order, ended());
  paint(`${orderCard(order)}<button class="button" id="send" type="button">${force ? 'Enviar de nuevo igual' : 'Confirmar y enviar a Telegram'}</button>${message}<p class="staff-note staff-note-after">Ingresaste como ${escapeHtml(session.name)}.</p>`);
  document.querySelector('#send').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      const result = await request('/api/orders', { code, force }, session.token);
      if (result.status === 201) {
        const warning = result.data.telegram === 'sent' ? '' : status('warning', 'Quedó registrado, pero no llegó a Telegram. Avisale al encargado.');
        paint(`${orderCard(order)}${status('ok', `Pedido #${result.data.number} enviado.`)}${warning}`);
      } else if (result.status === 409) {
        paintConfirm(order, status('warning', `Este pedido ya se envió como #${result.data.number}. Si es otra ronda igual, enviala de nuevo.`), true);
      } else if (result.status === 429) {
        paintConfirm(order, status('warning', 'Se mandaron muchos pedidos seguidos. Esperá un minuto y probá de nuevo.'), force);
      } else if (result.status === 401) {
        writeSession(null);
        paintLogin(order, ended());
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
} else if (liveSession()) {
  paintConfirm(order);
} else {
  paintLogin(order);
}
