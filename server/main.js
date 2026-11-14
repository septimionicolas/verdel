import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from './auth.js';
import { createBot } from './bot.js';
import { missingSettings, readConfig } from './config.js';
import { createHttpHandler } from './http.js';
import { createService } from './service.js';
import { openEventStore } from './store.js';
import { createTelegram, pollUpdates } from './telegram.js';

process.env.TZ = 'UTC';

const config = readConfig();
const log = (event, detail = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...detail }));
const missing = missingSettings(config);
const telegram = config.botToken ? createTelegram({ token: config.botToken, apiBase: config.telegramApiBase }) : null;
const service = createService({ store: openEventStore(config.dataDir), telegram, optionIndex: buildOptionIndex(), venue: VENUE, reportsDir: join(config.dataDir, 'reports'), log });
const auth = createAuth({ pin: config.staffPin, secret: config.sessionSecret });
const webDir = fileURLToPath(new URL('../web/', import.meta.url));
const server = createServer(createHttpHandler({ service, auth, config, webDir, ready: missing.length === 0 }));
const stopper = new AbortController();

server.listen(config.port, () => log('listening', { port: config.port, telegram: Boolean(telegram), missing }));
if (telegram) {
  const bot = createBot({ service, telegram, venue: VENUE, setupKey: config.setupKey });
  pollUpdates(telegram, bot.handleUpdate, { signal: stopper.signal, log });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopper.abort();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
