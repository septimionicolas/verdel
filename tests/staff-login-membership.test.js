import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VENUE, buildOptionIndex } from '../web/menu.js';
import { createAuth } from '../server/auth.js';
import { createService } from '../server/service.js';
import { createStaffLogin } from '../server/staff-login.js';
import { memoryEventStore } from '../server/store.js';

const keys = { pin: 'birra-fria-26', secret: 'firma-de-prueba-0123456789abcdef-larga', setupKey: 'clave-de-vincular-2026' };
const SALON = -1;
const OWNER = -4;

function setup(answers) {
  const now = () => Date.parse('2026-11-21T00:04:00Z');
  const telegram = {
    call: async (method, params) => {
      if (method !== 'getChatMember') return { message_id: 1 };
      const reply = answers[params.chat_id];
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  const service = createService({ store: memoryEventStore(() => new Date(now())), telegram, optionIndex: buildOptionIndex(), venue: VENUE, now });
  service.bind('salon', SALON, 'Salón', 'Septi');
  service.bind('owner', OWNER, 'Dueño', 'Nico');
  const staff = createStaffLogin({ service, auth: createAuth({ ...keys, now }), telegram, timeZone: VENUE.timeZone, now, botUsername: () => 'verdel_bot' });
  const request = staff.request({ name: 'Ana', pin: keys.pin, origin: 'bar', userAgent: '' });
  const start = () => staff.telegramStart(request.requestId, { id: 7, name: 'Ana Pérez' });
  return { staff, request, start };
}

const outage = () => Object.assign(new Error('fetch failed'), { network: true });

test('si Telegram no contesta, la moza no lee que no está en el grupo y puede probar de nuevo', async () => {
  const answers = { [SALON]: outage(), [OWNER]: outage() };
  const bar = setup(answers);
  const first = await bar.start();
  assert.match(first.text, /Telegram no contesta, probá de nuevo en un minuto/);
  assert.doesNotMatch(first.text, /No te encuentro/);
  answers[SALON] = { status: 'member' };
  const second = await bar.start();
  assert.match(second.text, /Sos vos la que está ingresando como «Ana»/);
});

test('alguien que salió del grupo sigue leyendo que no la encuentran', async () => {
  const bar = setup({ [SALON]: { status: 'left' }, [OWNER]: { status: 'kicked' } });
  assert.match((await bar.start()).text, /No te encuentro en el grupo/);
});

test('si un grupo falla pero el otro la encuentra, entra igual', async () => {
  const bar = setup({ [SALON]: outage(), [OWNER]: { status: 'administrator' } });
  assert.match((await bar.start()).text, /Sos vos la que está ingresando/);
});

test('si un grupo falla y el otro dice que salió, no se la acusa: se le pide probar de nuevo', async () => {
  const bar = setup({ [SALON]: { status: 'left' }, [OWNER]: outage() });
  assert.match((await bar.start()).text, /Telegram no contesta/);
});
