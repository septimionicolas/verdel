import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAdvisor } from './advisor.js';
import { createAuth } from './auth.js';
import { createBindGuard } from './bind-guard.js';
import { createBot } from './bot.js';
import { readConfig, settingsState } from './config.js';
import { createAppServer, createHttpHandler } from './http.js';
import { createService } from './service.js';
import { createStaffLogin } from './staff-login.js';
import { createSuggester } from './suggestions.js';
import { ROLE_NAMES, currentNight } from './night.js';
import { openEventStore } from './store.js';
import { createTelegram, pollUpdates } from './telegram.js';

process.env.TZ = 'UTC';

const config = readConfig();
const log = (event, detail = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...detail }));
const settings = settingsState(config);
const stopper = new AbortController();
const connect = (token) => createTelegram({ token, apiBase: config.telegramApiBase, signal: stopper.signal, log });
const telegram = config.botToken ? connect(config.botToken) : null;
const stationTelegrams = Object.fromEntries(Object.entries(config.stationBotTokens).map(([station, token]) => [station, connect(token)]));
const advisor = config.anthropicApiKey ? createAdvisor({ apiKey: config.anthropicApiKey, apiBase: config.anthropicApiBase, model: config.advisorModel, log }) : null;
const service = createService({ store: openEventStore(config.dataDir), telegram, stationTelegrams, advisor, optionIndex: buildOptionIndex(), venue: VENUE, reportsDir: join(config.dataDir, 'reports'), log });
const suggester = advisor ? createSuggester({ advisor, optionIndex: buildOptionIndex(), nightLimit: config.advisorNightLimit, nightNumber: () => currentNight(service.state).number, log }) : null;
const auth = createAuth({ pin: config.staffPin, secret: config.sessionSecret, setupKey: settings.setupKey, notify: (alarm) => service.securityAlert(alarm) });
let botUsername = null;
telegram?.call('getMe').then((me) => (botUsername = me?.username || null)).catch((error) => log('telegram_getme_failed', { message: error.message }));
const staff = createStaffLogin({ service, auth, telegram, timeZone: VENUE.timeZone, sessionHours: config.staffSessionHours, groupApproval: config.staffGroupApproval, emergencyLogin: config.staffEmergencyLogin, botUsername: () => botUsername, log });
setInterval(staff.sweep, 30 * 1000).unref();
const webDir = fileURLToPath(new URL('../web/', import.meta.url));
const server = createAppServer(createHttpHandler({ service, staff, config, webDir, ready: settings.ready, suggester, log }));

server.listen(config.port, config.host || undefined, () => log('listening', { port: config.port, host: config.host || 'todas', telegram: Boolean(telegram), stationBots: Object.keys(stationTelegrams), advisor: Boolean(advisor), missing: settings.missing, weak: settings.weak }));
const bindGuard = createBindGuard({ setupKey: settings.setupKey, notify: (alarm) => service.securityAlert(alarm), log });
const listen = (client, roles) => pollUpdates(client, createBot({ service, telegram: client, venue: VENUE, setupKey: settings.setupKey, staff, roles, log, bindGuard }).handleUpdate, { signal: stopper.signal, log });
if (telegram) listen(telegram, Object.keys(ROLE_NAMES).filter((role) => !stationTelegrams[role]));
for (const [station, client] of Object.entries(stationTelegrams)) listen(client, [station]);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopper.abort();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
