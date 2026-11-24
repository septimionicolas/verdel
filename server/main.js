import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAdvisor } from './advisor.js';
import { createAuth } from './auth.js';
import { createBindGuard } from './bind-guard.js';
import { createBot } from './bot.js';
import { createDailyReport, createVisits } from './daily.js';
import { readConfig, settingsState } from './config.js';
import { createAppServer, createHttpHandler } from './http.js';
import { createService } from './service.js';
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
const auth = createAuth({ pin: config.staffPin, secret: config.sessionSecret, notify: (alarm) => service.securityAlert(alarm) });
const webDir = fileURLToPath(new URL('../web/', import.meta.url));
const visits = createVisits({ file: join(config.dataDir, 'visits.json'), timeZone: VENUE.timeZone });
const server = createAppServer(createHttpHandler({ service, auth, config, webDir, ready: settings.ready, suggester, visits, log }));
const daily = createDailyReport({ service, visits, venue: VENUE, file: join(config.dataDir, 'daily.json'), log });
const dailyTimer = setInterval(() => daily.tick().catch((error) => log('daily_report_failed', { message: error.message })), 60000);

server.listen(config.port, config.host || undefined, () => log('listening', { port: config.port, host: config.host || 'todas', telegram: Boolean(telegram), stationBots: Object.keys(stationTelegrams), advisor: Boolean(advisor), missing: settings.missing, weak: settings.weak }));
const bindGuard = createBindGuard({ setupKey: settings.setupKey, notify: (alarm) => service.securityAlert(alarm), log });
const listen = (client, roles) => pollUpdates(client, createBot({ service, telegram: client, venue: VENUE, setupKey: settings.setupKey, roles, log, bindGuard }).handleUpdate, { signal: stopper.signal, log });
if (telegram) listen(telegram, Object.keys(ROLE_NAMES).filter((role) => !stationTelegrams[role]));
for (const [station, client] of Object.entries(stationTelegrams)) listen(client, [station]);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopper.abort();
    clearInterval(dailyTimer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
