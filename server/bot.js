import { safeEqual } from './auth.js';
import { ROLE_ALIASES, ROLE_NAMES, currentNight } from './night.js';
import { escapeHtml, pendingText, summaryText } from './messages.js';

const LINK_HELP = {
  salon: '/vincular salon CLAVE — este grupo recibe los pedidos',
  pizzas: '/vincular pizzas CLAVE — cocina de pizzas y empanadas',
  house: '/vincular cocina CLAVE — cocina de la casa',
  owner: '/vincular dueno CLAVE — ve todo en vivo y recibe el reporte',
};

function helpText(roles, kitchenOnly) {
  const intro = kitchenOnly ? 'Los pedidos de esta cocina llegan solos. Tocá «Listo» cuando estén para retirar.' : 'Los pedidos llegan solos cuando el salón escanea el código del cliente.';
  const night = kitchenOnly ? [] : ['/resumen — cómo va la noche', '/cierre — cierra la noche y arma el reporte'];
  return ['<b>Cómo se usa</b>', intro, '', ...roles.map((role) => LINK_HELP[role]), '/estado — qué grupo es cada cosa', ...night].join('\n');
}

export function createBot({ service, telegram, venue, setupKey, roles = Object.keys(ROLE_NAMES) }) {
  const kitchenOnly = !roles.includes('salon') && !roles.includes('owner');
  const reply = (chatId, text, extra = {}) => telegram.call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  const roleOfChat = (chatId) => Object.keys(service.state.bindings).filter((role) => service.state.bindings[role].chatId === chatId);
  const personName = (from) => [from?.first_name, from?.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Alguien';

  async function handleCommand(message) {
    const chatId = message.chat.id;
    const [rawCommand, ...parts] = message.text.trim().split(/\s+/);
    const command = rawCommand.split('@')[0].toLowerCase();

    if (command === '/start' || command === '/ayuda' || command === '/help') return reply(chatId, helpText(roles, kitchenOnly));

    if (command === '/vincular') {
      const role = ROLE_ALIASES[(parts[0] || '').toLowerCase()];
      await telegram.call('deleteMessage', { chat_id: chatId, message_id: message.message_id }).catch(() => {});
      if (!role) return reply(chatId, 'Decime qué grupo es: salon, pizzas, cocina o dueno. Ejemplo: /vincular salon CLAVE');
      if (!roles.includes(role)) return reply(chatId, kitchenOnly ? `Este bot es solo para ${escapeHtml(roles.map((item) => ROLE_NAMES[item]).join(' y '))}.` : `${escapeHtml(ROLE_NAMES[role])} se vincula con su propio bot.`);
      if (!setupKey || !safeEqual(parts[1] || '', setupKey)) return reply(chatId, 'La clave no es correcta.');
      service.bind(role, chatId, message.chat.title || personName(message.from), personName(message.from));
      return reply(chatId, `Listo: este grupo es <b>${escapeHtml(ROLE_NAMES[role])}</b>.`);
    }

    if (command === '/estado') {
      const lines = (kitchenOnly ? roles : Object.keys(ROLE_NAMES)).map((role) => `${service.state.bindings[role] ? '✅' : '▫️'} ${escapeHtml(ROLE_NAMES[role])}${service.state.bindings[role] ? `: ${escapeHtml(service.state.bindings[role].title)}` : ': sin grupo'}`);
      return reply(chatId, [`<b>${escapeHtml(venue.name)}</b> · noche ${currentNight(service.state).number}`, ...lines].join('\n'));
    }

    if (kitchenOnly) return null;
    const trusted = roleOfChat(chatId).some((role) => role === 'salon' || role === 'owner');
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
