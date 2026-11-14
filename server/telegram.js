export function createTelegram({ token, apiBase, fetchImpl = fetch }) {
  const url = (method) => `${apiBase}/bot${token}/${method}`;

  async function read(method, response) {
    const data = await response.json();
    if (!data.ok) throw new Error(`TELEGRAM_${method}_${data.error_code || 'FAILED'}`);
    return data.result;
  }

  return {
    async call(method, params = {}) {
      const response = await fetchImpl(url(method), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) });
      return read(method, response);
    },
    async sendDocument(chatId, fileName, content, caption) {
      const form = new FormData();
      form.set('chat_id', String(chatId));
      form.set('caption', caption);
      form.set('document', new Blob([content], { type: 'text/html' }), fileName);
      return read('sendDocument', await fetchImpl(url('sendDocument'), { method: 'POST', body: form }));
    },
  };
}

export async function pollUpdates(telegram, handleUpdate, { signal, log, waitMs = 3000 }) {
  let offset = 0;
  while (!signal.aborted) {
    try {
      const updates = await telegram.call('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
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
