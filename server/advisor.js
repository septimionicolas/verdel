const API_VERSION = '2026-10-21';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const TIMED_OUT = Symbol('timeout');
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export function createAdvisor({ apiKey, apiBase = 'https://api.anthropic.com', model, fetchImpl = fetch, timeoutMs = 8000, log = () => {} }) {
  const fallbacks = FALLBACK_MODELS.has(model);

  async function request(instructions, text, { schema, maxTokens }, signal) {
    const body = {
      model,
      max_tokens: maxTokens,
      system: instructions,
      messages: [{ role: 'user', content: text }],
      output_config: { effort: 'low', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
      ...(fallbacks ? { fallbacks: 'default' } : {}),
    };
    const headers = { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION, ...(fallbacks ? { 'anthropic-beta': FALLBACK_BETA } : {}) };
    const response = await fetchImpl(`${apiBase.replace(/\/+$/, '')}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(body), signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      log('advisor_failed', { status: response.status, type: data?.error?.type || null });
      return null;
    }
    if (!data || data.stop_reason !== 'end_turn' || !Array.isArray(data.content)) {
      log('advisor_failed', { status: response.status, stopReason: data?.stop_reason || null });
      return null;
    }
    const answer = data.content.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('').trim();
    if (!answer) log('advisor_failed', { status: response.status, empty: true });
    return answer || null;
  }

  return {
    model,
    async ask(instructions, text, { schema = null, maxTokens = 2000, timeoutMs: limitMs = timeoutMs } = {}) {
      const controller = new AbortController();
      let timer;
      const expired = new Promise((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(TIMED_OUT);
        }, limitMs);
      });
      try {
        const result = await Promise.race([request(instructions, text, { schema, maxTokens }, controller.signal), expired]);
        if (result === TIMED_OUT) {
          log('advisor_failed', { timeoutMs: limitMs });
          return null;
        }
        return result;
      } catch (error) {
        if (!controller.signal.aborted) log('advisor_failed', { message: error.message });
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
