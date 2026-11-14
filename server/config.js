export function readConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3005),
    dataDir: env.DATA_DIR || './data',
    botToken: env.TELEGRAM_BOT_TOKEN || '',
    stationBotTokens: Object.fromEntries([['pizzas', env.PIZZAS_BOT_TOKEN], ['house', env.HOUSE_BOT_TOKEN]].filter(([, token]) => token)),
    telegramApiBase: env.TELEGRAM_API_BASE || 'https://api.telegram.org',
    staffPin: env.STAFF_PIN || '',
    setupKey: env.SETUP_KEY || '',
    sessionSecret: env.SESSION_SECRET || '',
    trustProxy: env.TRUST_PROXY === 'true',
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  };
}

export function missingSettings(config) {
  const required = { STAFF_PIN: config.staffPin, SETUP_KEY: config.setupKey, SESSION_SECRET: config.sessionSecret };
  return Object.keys(required).filter((name) => !required[name]);
}
