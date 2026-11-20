import { createBindGuard } from './bind-guard.js';
import { ROLE_ALIASES, ROLE_NAMES, clockLabel, currentNight } from './night.js';
import { escapeHtml, pendingText, summaryText } from './messages.js';

const METHOD_LABELS = { telegram: 'Telegram', group: 'grupo', setup_key: 'emergencia' };

const LINK_HELP = {
  salon: '/vincular salon CLAVE — este grupo recibe los pedidos',
  pizzas: '/vincular pizzas CLAVE — cocina de pizzas y empanadas',
  house: '/vincular cocina CLAVE — cocina de la casa',
  owner: '/vincular dueno CLAVE — ve todo en vivo y recibe el reporte',
};

function helpText(roles, kitchenOnly) {
  const intro = kitchenOnly ? 'Los pedidos de esta cocina llegan solos. Tocá «Listo» cuando estén para retirar.' : 'Los pedidos llegan solos cuando el salón escanea el código del cliente.';
  const night = kitchenOnly ? [] : ['/resumen — cómo va la noche', '/cierre — cierra la noche y arma el reporte', '/mozas — quién está ingresada y cerrar ingresos', '/desbloquear — en el grupo del dueño, levanta el bloqueo de ingresos'];
  return ['<b>Cómo se usa</b>', intro, '', ...roles.map((role) => LINK_HELP[role]), '/estado — qué grupo es cada cosa', ...night].join('\n');
}

export function createBot({ service, telegram, venue, setupKey, staff = null, now = Date.now, roles = Object.keys(ROLE_NAMES), log = () => {}, bindGuard = createBindGuard({ setupKey, notify: (alarm) => service.securityAlert(alarm), log }) }) {
  const kitchenOnly = !roles.includes('salon') && !roles.includes('owner');
  const reply = (chatId, text, extra = {}) => telegram.call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  const roleOfChat = (chatId) => Object.keys(service.state.bindings).filter((role) => service.state.bindings[role].chatId === chatId);
  const personName = (from) => [from?.first_name, from?.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Alguien';
  const time = clockLabel(venue.timeZone);
  const edit = (message, text, markup = { inline_keyboard: [] }) => telegram.call('editMessageText', { chat_id: message.chat.id, message_id: message.message_id, text, parse_mode: 'HTML', reply_markup: markup }).catch(() => {});

  function staleNight(id) {
    return Number(id) !== currentNight(service.state).number;
  }

  function staffList() {
    const sessions = service.openStaffSessions();
    if (!sessions.length) return { text: 'No hay mozas ingresadas.', reply_markup: { inline_keyboard: [] } };
    const lines = sessions.map((session) => `${escapeHtml(session.name)} · desde ${time(session.startedAt)} · ${METHOD_LABELS[session.method] || session.method}`);
    const buttons = sessions.map((session) => [{ text: `Cerrar ${session.name}`.slice(0, 40), callback_data: `staffend:${session.sessionId}` }]);
    return { text: ['<b>Mozas ingresadas</b>', ...lines].join('\n'), reply_markup: { inline_keyboard: [...buttons, [{ text: 'Cerrar todas', callback_data: `staffendall:${currentNight(service.state).number}` }]] } };
  }

  async function staffStart(message, requestId) {
    const answer = await staff.telegramStart(requestId, { id: message.from?.id, name: personName(message.from) });
    return reply(message.chat.id, answer.text, answer.reply_markup ? { reply_markup: answer.reply_markup } : {});
  }

  async function handleCommand(message) {
    const chatId = message.chat.id;
    const [rawCommand, ...parts] = message.text.trim().split(/\s+/);
    const command = rawCommand.split('@')[0].toLowerCase();

    if (command === '/start' && staff && !kitchenOnly && message.chat.type === 'private' && parts[0]?.startsWith('in_')) return staffStart(message, parts[0].slice(3));
    if (command === '/start' || command === '/ayuda' || command === '/help') return reply(chatId, helpText(roles, kitchenOnly));

    if (command === '/vincular') {
      const role = ROLE_ALIASES[(parts[0] || '').toLowerCase()];
      await telegram.call('deleteMessage', { chat_id: chatId, message_id: message.message_id }).catch(() => {});
      if (!role) return reply(chatId, 'Decime qué grupo es: salon, pizzas, cocina o dueno. Ejemplo: /vincular salon CLAVE');
      if (!roles.includes(role)) return reply(chatId, kitchenOnly ? `Este bot es solo para ${escapeHtml(roles.map((item) => ROLE_NAMES[item]).join(' y '))}.` : `${escapeHtml(ROLE_NAMES[role])} se vincula con su propio bot.`);
      const verdict = bindGuard.check(parts[1] || '', { chatId, fromId: message.from?.id, role });
      if (verdict === 'LOCKED') return reply(chatId, 'Demasiados intentos con una clave mal. Probá de nuevo en una hora.');
      if (verdict !== 'OK') return reply(chatId, 'La clave no es correcta.');
      service.bind(role, chatId, message.chat.title || personName(message.from), personName(message.from));
      return reply(chatId, `Listo: este grupo es <b>${escapeHtml(ROLE_NAMES[role])}</b>.`);
    }

    if (command === '/estado') {
      const lines = (kitchenOnly ? roles : Object.keys(ROLE_NAMES)).map((role) => `${service.state.bindings[role] ? '✅' : '▫️'} ${escapeHtml(ROLE_NAMES[role])}${service.state.bindings[role] ? `: ${escapeHtml(service.state.bindings[role].title)}` : ': sin grupo'}`);
      return reply(chatId, [`<b>${escapeHtml(venue.name)}</b> · noche ${currentNight(service.state).number}`, ...lines].join('\n'));
    }

    if (kitchenOnly) return null;
    const trusted = roleOfChat(chatId).some((role) => role === 'salon' || role === 'owner');
    if (command === '/desbloquear') {
      if (!staff || !roleOfChat(chatId).includes('owner')) return null;
      staff.unlock(personName(message.from));
      return reply(chatId, 'Listo: se levantó el bloqueo de ingresos. Las mozas pueden volver a probar el PIN.');
    }
    if (command === '/mozas') {
      if (!staff) return null;
      if (!trusted) return reply(chatId, 'Esto se pide desde el grupo del salón o el del dueño.');
      const list = staffList();
      return reply(chatId, list.text, { reply_markup: list.reply_markup });
    }
    if (command === '/resumen' || command === '/cierre') {
      if (!trusted) return reply(chatId, 'Esto se pide desde el grupo del salón o el del dueño.');
      const stats = service.stats();
      if (!stats.orders && !stats.voidedCount) return reply(chatId, 'Todavía no hay pedidos en esta noche.');
      if (command === '/resumen') return reply(chatId, summaryText(stats, venue.name));
      const pending = stats.pendingOrders.length ? `\n\n<b>Quedan sin cobrar:</b>\n${pendingText(stats)}\nConviene marcarlos o anularlos antes de cerrar.` : '';
      return reply(chatId, `${summaryText(stats, venue.name)}${pending}`, {
        reply_markup: { inline_keyboard: [[{ text: stats.pendingOrders.length ? 'Cerrar igual y armar reporte' : 'Cerrar y armar reporte', callback_data: `close:${stats.number}` }], [{ text: 'Volver', callback_data: 'closeno' }]] },
      });
    }
    return null;
  }

  async function personal({ query, id, answer }, itsMe) {
    if (query.message?.chat.type !== 'private') return answer('Este botón es del chat privado.');
    const result = await staff.telegramAnswer(id, { id: query.from?.id, name: personName(query.from) }, itsMe);
    await answer(result.answer);
    return edit(query.message, result.edit);
  }

  async function approval({ id, by, answer, trusted }, approve) {
    if (!trusted) return answer('Esto se hace desde el grupo del salón o el del dueño.');
    return answer((await staff.groupAnswer(id, by, approve)).answer);
  }

  function guarded(handler) {
    return (context) => (context.trusted ? handler(context) : context.answer('Esto se hace desde el grupo del salón o el del dueño.'));
  }

  const STAFF_ACTIONS = {
    staffme: (context) => personal(context, true),
    staffnotme: (context) => personal(context, false),
    staffok: (context) => approval(context, true),
    staffno: (context) => approval(context, false),
    staffend: guarded(async ({ query, id, by, answer }) => {
      const ended = service.endStaffSession(id, 'revoked', by);
      await answer(ended ? 'Ingreso cerrado.' : 'Ese ingreso ya estaba cerrado.');
      const list = staffList();
      return edit(query.message, list.text, list.reply_markup);
    }),
    staffendall: guarded(async ({ query, id, answer }) => {
      if (staleNight(id)) return answer('Botón viejo: ya no hace nada.');
      await answer('¿Seguro? Confirmá abajo.');
      return edit(query.message, '¿Cerrar el ingreso de todas las mozas? Van a tener que ingresar de nuevo.', { inline_keyboard: [[{ text: 'Sí, cerrar todas', callback_data: `staffendallyes:${id}` }, { text: 'No', callback_data: `staffendallno:${id}` }]] });
    }),
    staffendallyes: guarded(async ({ query, id, by, answer }) => {
      if (staleNight(id)) return answer('Botón viejo: ya no hace nada.');
      const count = service.endAllStaffSessions(by);
      await answer('Listo.');
      return edit(query.message, `Se cerraron ${count} ${count === 1 ? 'ingreso' : 'ingresos'}. Cerró ${escapeHtml(by)} a las ${time(now())}.`);
    }),
    staffendallno: guarded(async ({ query, answer }) => {
      await answer('No se cerró nada.');
      const list = staffList();
      return edit(query.message, list.text, list.reply_markup);
    }),
  };

  async function handleCallback(query) {
    const chatId = query.message?.chat.id;
    const [action, orderId, station] = String(query.data || '').split(':');
    const by = personName(query.from);
    const answer = (text) => telegram.call('answerCallbackQuery', { callback_query_id: query.id, text }).catch(() => {});
    const chatRoles = roleOfChat(chatId);
    const inSalon = chatRoles.includes('salon');

    if (action === 'ready') {
      if (!chatRoles.includes(station) || !roles.includes(station)) return answer('Este botón es de otra cocina.');
      return answer((await service.markReady(orderId, station, by)) ? 'Avisado al salón.' : 'Ya estaba avisado.');
    }
    if (kitchenOnly) return answer('Botón viejo: ya no hace nada.');
    if (staff && STAFF_ACTIONS[action]) return STAFF_ACTIONS[action]({ query, id: orderId, by, answer, trusted: inSalon || chatRoles.includes('owner') });
    if (action === 'close' || action === 'closeno') {
      if (!inSalon && !chatRoles.includes('owner')) return answer('Esto se hace desde el grupo del salón o el del dueño.');
      await telegram.call('editMessageReplyMarkup', { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      if (action === 'closeno') return answer('La noche sigue abierta.');
      if (Number(orderId) !== currentNight(service.state).number) return answer('Esa noche ya estaba cerrada.');
      await answer('Cerrando la noche…');
      return service.closeNight(by);
    }
    if (!inSalon) return answer('Este botón es del grupo del salón.');
    if (action === 'charge') return answer((await service.charge(orderId, by)) ? 'Marcado como cobrado.' : 'No se pudo: mirá el estado del pedido.');
    if (action === 'uncharge') return answer((await service.revertCharge(orderId, by)) ? 'Volvió a sin cobrar.' : 'No se pudo: mirá el estado del pedido.');
    if (action === 'void') return answer((await service.askVoid(orderId, true)) ? '¿Seguro? Confirmá abajo.' : 'Este pedido ya no se puede anular.');
    if (action === 'voidno') return answer((await service.askVoid(orderId, false)) ? 'No se anuló.' : 'Listo.');
    if (action === 'voidyes') return answer((await service.voidOrder(orderId, by)) ? 'Pedido anulado.' : 'Este pedido ya no se puede anular.');
    return answer('Botón viejo: ya no hace nada.');
  }

  return {
    async handleUpdate(update) {
      if (update.callback_query) return handleCallback(update.callback_query);
      if (update.message?.text?.startsWith('/')) return handleCommand(update.message);
      return null;
    },
  };
}
