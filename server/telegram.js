import { setTimeout as delay } from 'node:timers/promises';

export function createTelegram({ token, apiBase, fetchImpl = fetch, retryDelaysMs = [1000, 2000, 4000], coolDownMs = 30000, timeoutMs = 10000, signal, sleep = (ms) => delay(ms, undefined, { signal }), now = Date.now, log = () => {} }) {
  const url = (method) => `${apiBase}/bot${token}/${method}`;
  let noRetryUntil = 0;

  const lost = (error) => {
    error.network = true;
    throw error;
  };

  async function attempt(method, init, waitMs) {
    const deadline = AbortSignal.timeout(waitMs);
    const options = { ...init, signal: init.signal ? AbortSignal.any([deadline, init.signal]) : deadline };
    const response = await fetchImpl(url(method), options).catch(lost);
    const data = await response.json().catch((error) => (options.signal.aborted ? lost(error) : null));
    noRetryUntil = 0;
    if (data?.ok) return data.result;
    const error = new Error(`TELEGRAM_${method}_${data?.error_code || 'FAILED'}`);
    error.status = data?.error_code ?? response.status;
    throw error;
  }

  async function request(method, buildInit, retry, waitMs = timeoutMs) {
    const delays = retry && now() >= noRetryUntil ? retryDelaysMs : [];
    for (let index = 0; ; index += 1) {
      try {
        return await attempt(method, buildInit(), waitMs);
      } catch (error) {
        const transient = error.network || error.status >= 500;
        if (!transient) throw error;
        if (index >= delays.length || signal?.aborted) {
          if (retry) noRetryUntil = now() + coolDownMs;
          throw error;
        }
        log('telegram_retry', { method, attempt: index + 1, waitMs: delays[index] });
        const waited = await sleep(delays[index]).then(() => true, () => false);
        if (!waited) throw error;
      }
    }
  }

  return {
    call(method, params = {}, { retry = true } = {}) {
      const waitMs = timeoutMs + (Number(params.timeout) || 0) * 1000;
      return request(method, () => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) }), retry, waitMs);
    },
    sendDocument(chatId, fileName, content, caption) {
      return request('sendDocument', () => {
        const form = new FormData();
        form.set('chat_id', String(chatId));
        form.set('caption', caption);
        form.set('document', new Blob([content], { type: 'text/html' }), fileName);
        return { method: 'POST', body: form };
      }, true);
    },
  };
}

export async function pollUpdates(telegram, handleUpdate, { signal, log, waitMs = 3000 }) {
  let offset = 0;
  while (!signal.aborted) {
    try {
      const updates = await telegram.call('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }, { retry: false });
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update).catch((error) => log('update_failed', { message: error.message }));
      }
    } catch (error) {
      log('polling_failed', { message: error.message });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
