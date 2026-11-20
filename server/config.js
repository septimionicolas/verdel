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
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    anthropicApiBase: env.ANTHROPIC_API_BASE || 'https://api.anthropic.com',
    advisorModel: env.ADVISOR_MODEL || 'claude-fable-5-2',
    advisorNightLimit: Number(env.ADVISOR_NIGHT_LIMIT) > 0 ? Math.floor(Number(env.ADVISOR_NIGHT_LIMIT)) : 300,
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  };
}

export function missingSettings(config) {
  const required = { STAFF_PIN: config.staffPin, SETUP_KEY: config.setupKey, SESSION_SECRET: config.sessionSecret };
  return Object.keys(required).filter((name) => !required[name]);
}

const FACTORY_KEYS = new Set(['1234', '0000', '1111', '12345678', '123456789', '1234567890', 'password', 'contrasena', 'clave', 'secreto', 'admin', 'administrador', 'root', 'qwerty', 'verdel', 'changeme', 'cambiame', 'default', 'test', 'prueba', 'letmein', 'secret']);
const SEQUENCES = ['0123456789012345678901234567890123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm'];
const MIN_LENGTH = { STAFF_PIN: 8, SETUP_KEY: 16, SESSION_SECRET: 32 };

function isSimple(value) {
  const lower = value.toLowerCase();
  if (FACTORY_KEYS.has(lower) || FACTORY_KEYS.has(lower.replace(/[^a-z]/g, ''))) return true;
  if (new Set(lower).size === 1) return true;
  return SEQUENCES.some((sequence) => sequence.includes(lower) || [...sequence].reverse().join('').includes(lower));
}

function isWeak(name, value, values) {
  if (value.length < MIN_LENGTH[name] || isSimple(value)) return true;
  if (name === 'STAFF_PIN' && /^\d+$/.test(value) && value.length < 12) return true;
  return values.filter((other) => other === value).length > 1;
}

export function weakSettings(config) {
  const keys = { STAFF_PIN: config.staffPin, SETUP_KEY: config.setupKey, SESSION_SECRET: config.sessionSecret };
  const values = Object.values(keys).filter(Boolean);
  return Object.keys(keys).filter((name) => keys[name] && isWeak(name, keys[name], values));
}

export function settingsState(config) {
  const missing = missingSettings(config);
  const weak = weakSettings(config);
  const ready = missing.length === 0 && weak.length === 0;
  return { missing, weak, ready, setupKey: ready ? config.setupKey : '' };
}
