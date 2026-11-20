import { createHash, randomBytes, randomInt } from 'node:crypto';
import { newToken, safeEqual } from './auth.js';
import { createLimiter } from './limiter.js';
import { escapeHtml } from './messages.js';
import { clockLabel } from './night.js';

const MINUTE = 60 * 1000;

export const STAFF_LOGIN_LIMITS = {
  requestMs: 3 * MINUTE,
  pendingPerOrigin: 5,
  pendingTotal: 30,
  claimsPerMinute: 60,
  asksPerWindow: 6,
  askWindowMs: 10 * MINUTE,
  maxNameLength: 24,
};

const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member']);
const BROWSERS = [[/Edg(A|iOS)?\//, 'Edge'], [/SamsungBrowser/, 'Samsung Internet'], [/OPR\/|Opera/, 'Opera'], [/CriOS|Chrome\//, 'Chrome'], [/FxiOS|Firefox\//, 'Firefox'], [/Safari\//, 'Safari']];
const SYSTEMS = [[/iPhone/, 'iPhone'], [/iPad/, 'iPad'], [/Android/, 'Android'], [/Windows/, 'Windows'], [/Mac OS X|Macintosh/, 'Mac'], [/Linux/, 'Linux']];
const hashSecret = (secret) => createHash('sha256').update(String(secret)).digest('base64url');
const pick = (table, text) => table.find(([pattern]) => pattern.test(text))?.[1];
const noButtons = { inline_keyboard: [] };

export function deviceLabel(userAgent = '') {
  const browser = pick(BROWSERS, userAgent);
  const system = pick(SYSTEMS, userAgent);
  return browser && system ? `${browser} en ${system}` : 'un navegador';
}

export function createStaffLogin({ service, auth, telegram = null, timeZone, now = Date.now, sessionHours = 12, groupApproval = true, emergencyLogin = true, botUsername = () => null, log = () => {}, limits = {} }) {
  const caps = { ...STAFF_LOGIN_LIMITS, ...limits };
  const pending = new Map();
  const claimLimiter = createLimiter({ limit: caps.claimsPerMinute, windowMs: MINUTE, now, maxKeys: caps.pendingTotal * 4 });
  const askLimiter = createLimiter({ limit: caps.asksPerWindow, windowMs: caps.askWindowMs, now, maxKeys: 1 });
  const time = clockLabel(timeZone);
  let askAlerted = false;
  let fullAlerted = false;

  const verifierRole = () => ['salon', 'owner'].find((role) => service.chatOf(role));
  const live = (entry) => entry && entry.expiresAtMs > now();
  const edit = (message, text) => telegram?.call('editMessageText', { chat_id: message.chatId, message_id: message.messageId, text, parse_mode: 'HTML', reply_markup: noButtons }).catch((error) => log('telegram_edit_failed', { message: error.message }));

  function sweep() {
    const at = now();
    for (const [id, entry] of pending) {
      if (entry.expiresAtMs > at) continue;
      pending.delete(id);
      if (entry.state === 'pending' && entry.groupMessage) edit(entry.groupMessage, 'Venció sin respuesta.');
      if (entry.state === 'approved') log('staff_login_unclaimed', { name: entry.name, method: entry.approval.method });
    }
  }

  function owned({ requestId, claimSecret }) {
    sweep();
    const entry = pending.get(String(requestId || ''));
    if (!entry || !safeEqual(hashSecret(claimSecret || ''), entry.secretHash)) return null;
    return entry;
  }

  function issue(entry, details) {
    const token = newToken();
    entry.session = service.startStaffSession({ tokenHash: auth.hashToken(token), name: entry.name, hours: sessionHours, ...details });
    return { token, name: entry.name, expiresAt: entry.session.expiresAt };
  }

  function markApproved(entry, details) {
    entry.approval = details;
    entry.state = 'approved';
  }

  function request({ name, pin, origin, userAgent }) {
    const cleanName = String(name || '').trim().slice(0, caps.maxNameLength);
    if (!cleanName) return { error: 'NAME_REQUIRED' };
    const checked = auth.checkPin(String(pin || ''), origin);
    if (checked.error) return checked;
    sweep();
    const fromOrigin = [...pending.values()].filter((entry) => entry.origin === origin).length;
    if (pending.size >= caps.pendingTotal) {
      if (!fullAlerted) {
        fullAlerted = true;
        service.send('owner', `Hay ${pending.size} pedidos de ingreso pendientes y no entra ninguno más. Si no son de ustedes, mandá /desbloquear para vaciarlos y cambiá STAFF_PIN.`);
      }
      return { error: 'TOO_MANY_REQUESTS' };
    }
    fullAlerted = false;
    if (fromOrigin >= caps.pendingPerOrigin) return { error: 'TOO_MANY_REQUESTS' };
    const requestId = randomBytes(16).toString('base64url');
    const claimSecret = randomBytes(32).toString('base64url');
    const entry = { id: requestId, secretHash: hashSecret(claimSecret), name: cleanName, origin, device: deviceLabel(userAgent), matchCode: String(randomInt(100)).padStart(2, '0'), expiresAtMs: now() + caps.requestMs, state: 'pending', asked: false };
    pending.set(requestId, entry);
    const role = verifierRole();
    const username = role ? botUsername() : null;
    return {
      requestId,
      claimSecret,
      botLink: username ? `https://t.me/${username}?start=in_${requestId}` : null,
      matchCode: entry.matchCode,
      expiresAt: new Date(entry.expiresAtMs).toISOString(),
      groupApproval: Boolean(groupApproval && role),
      emergency: Boolean(emergencyLogin),
    };
  }

  function claim(credentials) {
    if (!claimLimiter.take(String(credentials.requestId || ''))) return { error: 'RATE_LIMITED' };
    const entry = owned(credentials);
    if (!entry) return { error: 'REQUEST_EXPIRED' };
    if (entry.state === 'denied') return { error: 'REQUEST_DENIED' };
    if (entry.state === 'pending') return { state: 'pending' };
    pending.delete(entry.id);
    return issue(entry, entry.approval);
  }

  async function ask(credentials) {
    const entry = owned(credentials);
    if (!entry || entry.state !== 'pending') return { error: 'REQUEST_EXPIRED' };
    if (entry.asked) return { error: 'ALREADY_ASKED' };
    const role = verifierRole();
    if (!groupApproval || !role) return { error: 'NO_GROUP' };
    if (!askLimiter.take('all')) {
      if (!askAlerted) {
        askAlerted = true;
        await service.send('owner', 'Hay muchos pedidos de ingreso con el PIN correcto. Si no son de ustedes, cambiá STAFF_PIN.');
      }
      return { error: 'ASK_LIMIT' };
    }
    askAlerted = false;
    const text = `${escapeHtml(entry.name)} pide entrar desde un celular nuevo (${escapeHtml(entry.device)}). Número de control: <b>${entry.matchCode}</b>. Antes de aprobar, pedile que te muestre el número en su pantalla.`;
    const sent = await service.send(role, text, { reply_markup: { inline_keyboard: [[{ text: 'Aprobar', callback_data: `staffok:${entry.id}` }, { text: 'Rechazar', callback_data: `staffno:${entry.id}` }]] } });
    if (!sent) return { error: 'TELEGRAM_UNAVAILABLE' };
    entry.asked = true;
    entry.groupMessage = { chatId: service.chatOf(role), messageId: sent.message_id };
    return { asked: true };
  }

  async function emergency({ setupKey, origin, ...credentials }) {
    if (!emergencyLogin) return { error: 'EMERGENCY_DISABLED' };
    const checked = auth.checkKey(String(setupKey || ''), origin);
    if (checked.error) return checked;
    const entry = owned(credentials);
    if (!entry || entry.state === 'approved') return { error: 'REQUEST_EXPIRED' };
    if (entry.state === 'denied') return { error: 'REQUEST_DENIED' };
    const result = issue(entry, { method: 'setup_key' });
    pending.delete(entry.id);
    service.recordEmergencyLogin(entry.session.sessionId, entry.name);
    if (entry.groupMessage) edit(entry.groupMessage, `${escapeHtml(entry.name)} entró con el ingreso de emergencia.`);
    await service.send('owner', `Ingreso de emergencia de «${escapeHtml(entry.name)}» a las ${time(now())}.`);
    return result;
  }

  async function membership(userId) {
    let unavailable = false;
    for (const role of ['salon', 'owner']) {
      const chatId = service.chatOf(role);
      if (!chatId || !telegram) continue;
      const member = await telegram.call('getChatMember', { chat_id: chatId, user_id: userId }).catch(() => null);
      if (!member) unavailable = true;
      else if (MEMBER_STATUSES.has(member.status) || (member.status === 'restricted' && member.is_member)) return 'member';
    }
    return unavailable ? 'unavailable' : 'outside';
  }

  function waiting(requestId) {
    sweep();
    const entry = pending.get(requestId);
    return entry?.state === 'pending' ? entry : null;
  }

  const expiredText = 'Ese ingreso ya venció o ya se usó. Volvé al navegador y probá de nuevo.';

  async function telegramStart(requestId, user) {
    const entry = waiting(requestId);
    if (!entry || (entry.telegramUserId && entry.telegramUserId !== user.id)) return { text: expiredText };
    const found = await membership(user.id);
    if (found === 'unavailable') return { text: 'Telegram no contesta, probá de nuevo en un minuto.' };
    if (found === 'outside') return { text: 'No te encuentro en el grupo del salón. Volvé al navegador y tocá «No tengo Telegram o no estoy en el grupo».' };
    entry.telegramUserId = user.id;
    return {
      text: `Hola ${escapeHtml(user.name)}. ¿Sos vos la que está ingresando como «${escapeHtml(entry.name)}» desde ${escapeHtml(entry.device)}, con el número <b>${entry.matchCode}</b>?`,
      reply_markup: { inline_keyboard: [[{ text: 'Sí, soy yo', callback_data: `staffme:${entry.id}` }, { text: 'No fui yo', callback_data: `staffnotme:${entry.id}` }]] },
    };
  }

  async function telegramAnswer(requestId, user, itsMe) {
    const entry = waiting(requestId);
    if (!entry || entry.telegramUserId !== user.id) return { answer: 'Este ingreso ya no está vigente.', edit: expiredText };
    if (!itsMe) {
      entry.state = 'denied';
      service.denyStaffLogin({ name: entry.name, by: user.name, reason: 'not_me' });
      if (entry.groupMessage) edit(entry.groupMessage, `Ingreso de ${escapeHtml(entry.name)} rechazado.`);
      await service.send('owner', `Alguien con el PIN intentó ingresar como «${escapeHtml(entry.name)}» y ${escapeHtml(user.name)} dijo que no fue ella. Si se repite, cambiá STAFF_PIN.`);
      return { answer: 'Listo, no entró nadie.', edit: 'Listo, no entró nadie. Le avisamos al dueño.' };
    }
    markApproved(entry, { method: 'telegram', telegramUserId: user.id, telegramName: user.name });
    if (entry.groupMessage) edit(entry.groupMessage, `${escapeHtml(entry.name)} entró. Confirmó en Telegram a las ${time(now())}.`);
    return { answer: 'Listo.', edit: `Listo, ${escapeHtml(entry.name)}. Volvé al navegador. Tu ingreso dura hasta el cierre de la noche (máximo ${sessionHours} h).` };
  }

  async function groupAnswer(requestId, by, approve) {
    const entry = waiting(requestId);
    if (!entry || !entry.asked) return { answer: 'Este ingreso ya no está vigente.' };
    if (approve) {
      markApproved(entry, { method: 'group', approvedBy: by });
      edit(entry.groupMessage, `${escapeHtml(entry.name)} entró. Aprobó ${escapeHtml(by)} a las ${time(now())}.`);
      return { answer: `Listo, ${entry.name} ya puede confirmar pedidos.` };
    }
    entry.state = 'denied';
    service.denyStaffLogin({ name: entry.name, by, reason: 'group' });
    edit(entry.groupMessage, `Ingreso de ${escapeHtml(entry.name)} rechazado por ${escapeHtml(by)}.`);
    await service.send('owner', `${escapeHtml(by)} rechazó en el grupo el ingreso de «${escapeHtml(entry.name)}». Si no era de ustedes, cambiá STAFF_PIN.`);
    return { answer: 'Rechazado.' };
  }

  function verify(token) {
    return token ? service.staffSession(auth.hashToken(token)) : null;
  }

  return {
    request,
    claim,
    ask,
    emergency,
    verify,
    end: (token) => {
      const session = verify(token);
      return Boolean(session) && service.endStaffSession(session.sessionId, 'logout', session.name);
    },
    telegramStart,
    telegramAnswer,
    groupAnswer,
    sweep,
    unlock: (by) => {
      auth.unlockAll();
      for (const [id, entry] of pending) {
        if (entry.state === 'approved') continue;
        pending.delete(id);
        if (entry.state === 'pending' && entry.groupMessage) edit(entry.groupMessage, 'Cancelado con /desbloquear.');
      }
      service.recordUnlock(by);
    },
  };
}
