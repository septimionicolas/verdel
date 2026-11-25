import { PHONE, MIN_PEOPLE, sourceTag, couponCode, reservationMessage, questionMessage, groupMessage, whatsappLink, clean } from './recibidos-text.js';

const form = document.getElementById('form');
const hint = document.getElementById('hint');
const peopleNote = document.getElementById('people-note');
const source = sourceTag(location.search);
const code = couponCode(source, crypto.getRandomValues(new Uint8Array(4)));
const shareUrl = `${location.origin}${location.pathname}?v=wa`;

function fields() {
  return Object.fromEntries(new FormData(form));
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function openWhatsapp(text) {
  const link = whatsappLink(PHONE, text);
  if (!link) {
    hint.textContent = 'Todavía no cargamos el WhatsApp de Verdel. Probá en un rato.';
    return false;
  }
  window.open(link, '_blank', 'noopener');
  return true;
}

function reserve(event) {
  event.preventDefault();
  const data = fields();
  if (!clean(data.name)) {
    hint.textContent = 'Falta el nombre de quien se recibe.';
    form.elements.name.focus();
    return;
  }
  if (!data.date) {
    hint.textContent = 'Falta el día del festejo.';
    form.elements.date.focus();
    return;
  }
  if (openWhatsapp(reservationMessage(data, code))) {
    hint.textContent = `Enviá el mensaje y te confirmamos. Tu código: ${code}`;
  }
}

function refresh() {
  const data = fields();
  peopleNote.hidden = !(Number.parseInt(data.people, 10) < MIN_PEOPLE);
  document.getElementById('group').href = `https://wa.me/?text=${encodeURIComponent(groupMessage(data, shareUrl))}`;
}

const call = document.getElementById('call');
document.getElementById('code').textContent = code;
call.hidden = !PHONE;
call.href = PHONE ? `tel:+${PHONE}` : '#';
document.getElementById('ask').addEventListener('click', (event) => {
  event.preventDefault();
  openWhatsapp(questionMessage(code));
});
form.elements.date.value = today();
form.elements.date.min = today();
form.addEventListener('input', refresh);
form.addEventListener('submit', reserve);
refresh();
