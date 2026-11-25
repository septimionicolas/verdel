import { DEGREES, headline, partyDate, sourceTag, couponCode, groupMessage, clean, PROMO_END, LEGAL } from './recibidos-text.js';

const FORMATS = {
  poster: { width: 1240, height: 1754, file: 'cartel-verdel-a4.png' },
  story: { width: 1080, height: 1920, file: 'historia-verdel.png' },
};

const THEMES = {
  night: { bg: ['#0A1C18', '#06120F'], glowA: 'rgba(47,163,95,.45)', glowB: 'rgba(246,196,67,.28)', text: '#F4F6FF', soft: '#B7C7BC', accent: '#F6C443', line: 'rgba(127,211,106,.55)', dots: 'rgba(244,246,255,.55)', coupon: 'rgba(6,18,15,.72)' },
  gold: { bg: ['#FFD25A', '#E89A12'], glowA: 'rgba(255,253,245,.55)', glowB: 'rgba(201,120,14,.45)', text: '#06120F', soft: '#3B2A08', accent: '#0A1C18', line: 'rgba(6,18,15,.55)', dots: 'rgba(255,253,245,.8)', coupon: 'rgba(255,253,245,.55)' },
  flour: { bg: ['#FFFDF5', '#EDE6D3'], glowA: 'rgba(155,224,127,.45)', glowB: 'rgba(246,196,67,.45)', text: '#06120F', soft: '#40524A', accent: '#2FA35F', line: 'rgba(6,18,15,.45)', dots: 'rgba(6,18,15,.16)', coupon: 'rgba(255,255,255,.8)' },
};

const form = document.getElementById('form');
const canvas = document.getElementById('canvas');
const context = canvas.getContext('2d');
const degreeSelect = document.getElementById('degree');
const otherWrap = document.getElementById('other-wrap');
const whatsapp = document.getElementById('whatsapp');
const hint = document.getElementById('hint');
const source = sourceTag(location.search);
const code = couponCode(source, crypto.getRandomValues(new Uint8Array(4)));
const seed = crypto.getRandomValues(new Uint32Array(1))[0];
let format = 'poster';
let ready = null;
let pending = 0;

function fields() {
  const data = new FormData(form);
  return Object.fromEntries(['name', 'gender', 'degree', 'other', 'school', 'date', 'theme'].map((key) => [key, String(data.get(key) || '')]));
}

function fillDegrees() {
  const gender = fields().gender || 'f';
  const current = degreeSelect.value || 'lic';
  degreeSelect.replaceChildren(...DEGREES.map((item) => new Option(item[gender], item.id, false, item.id === current)));
}

function random(start) {
  let state = start;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function fitFont(text, family, weight, max, width) {
  let size = max;
  context.font = `${weight} ${size}px ${family}`;
  while (size > 12 && context.measureText(text).width > width) {
    size -= 2;
    context.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function drawBackground(theme, width, height) {
  const fill = context.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, theme.bg[0]);
  fill.addColorStop(1, theme.bg[1]);
  context.fillStyle = fill;
  context.fillRect(0, 0, width, height);
  for (const [x, y, r, color] of [[width * .1, height * .05, width * .8, theme.glowA], [width * .95, height * .55, width * .7, theme.glowB]]) {
    const glow = context.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }
  const next = random(seed);
  context.fillStyle = theme.dots;
  for (let index = 0; index < 160; index += 1) {
    context.beginPath();
    context.arc(next() * width, next() * height, next() * width * .004 + 1, 0, Math.PI * 2);
    context.fill();
  }
}

const FOAM = [[10, 22, 8], [22, 16, 10], [36, 13, 11], [51, 12, 12], [66, 13, 11], [80, 16, 10], [93, 21, 8], [30, 22, 8], [58, 21, 9], [44, 20, 8], [73, 22, 8]];

function gradient(y0, y1, stops) {
  const fill = context.createLinearGradient(0, y0, 0, y1);
  for (const [offset, color] of stops) fill.addColorStop(offset, color);
  return fill;
}

function drawLogo(x, y, width, theme) {
  const light = theme.text === '#06120F';
  context.save();
  context.translate(x, y);
  context.scale(width / 640, width / 640);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.beginPath();
  context.moveTo(8, 22);
  context.lineTo(96, 22);
  context.lineTo(52, 96);
  context.closePath();
  context.fillStyle = gradient(22, 98, [[0, '#FFD25A'], [.55, '#F4AE25'], [1, '#C9780E']]);
  context.fill();
  if (light) {
    context.lineWidth = 5;
    context.lineJoin = 'round';
    context.strokeStyle = theme.text;
    context.stroke();
  }
  context.font = '400 104px Michroma';
  context.globalAlpha = .92;
  context.fillStyle = light ? theme.text : '#F4F6FF';
  context.fillText('V', 0, 98);
  context.globalAlpha = 1;
  context.fillStyle = '#FFFDF5';
  for (const [cx, cy, r] of FOAM) {
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
  }
  context.letterSpacing = '6px';
  context.fillStyle = light ? theme.text : gradient(18, 100, [[0, '#FFE27A'], [.42, '#C9DE52'], [1, '#2FA35F']]);
  context.fillText('ERDEL', 110, 98);
  context.restore();
}

function drawStamp(x, y, radius, theme) {
  context.save();
  context.setLineDash([radius * .16, radius * .1]);
  context.lineWidth = radius * .05;
  context.strokeStyle = theme.line;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = theme.soft;
  context.textAlign = 'center';
  context.font = `700 ${radius * .24}px Archivo`;
  context.fillText('SELLO', x, y - radius * .04);
  context.fillText('BARRA', x, y + radius * .26);
  context.restore();
}

function draw() {
  const spec = FORMATS[format];
  const data = fields();
  const theme = THEMES[data.theme] || THEMES.night;
  const { width, height } = spec;
  canvas.width = width;
  canvas.height = height;
  const pad = width * .08;
  const inner = width - pad * 2;
  const story = format === 'story';
  drawBackground(theme, width, height);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  drawLogo(pad, story ? height * .14 : pad * .9, width * .42, theme);

  const center = width / 2;
  context.textAlign = 'center';
  const boxHeight = story ? height * .24 : height * .25;
  const boxTop = story ? height * .8385 - boxHeight : height - boxHeight - pad * .9;
  context.save();
  context.fillStyle = theme.coupon;
  context.strokeStyle = theme.line;
  context.lineWidth = width * .004;
  context.setLineDash([width * .02, width * .012]);
  context.beginPath();
  if (context.roundRect) context.roundRect(pad, boxTop, inner, boxHeight, width * .03);
  else context.rect(pad, boxTop, inner, boxHeight);
  context.fill();
  context.stroke();
  context.restore();

  const radius = boxHeight * .26;
  const stampX = pad + inner - radius - width * .04;
  const textLeft = pad + width * .05;
  const textWidth = stampX - radius - textLeft - width * .03;
  context.textAlign = 'left';
  context.fillStyle = theme.soft;
  context.font = `800 ${width * .028}px Archivo`;
  context.fillText('ESTE CARTEL VALE', textLeft, boxTop + boxHeight * .2);
  context.fillStyle = theme.text;
  fitFont('2 LITROS DE NORTE', '"Archivo Black"', 400, width * .075, textWidth);
  context.fillText('2 LITROS DE NORTE', textLeft, boxTop + boxHeight * .42);
  context.fillStyle = theme.accent;
  fitFont('de regalo para la mesa', 'Archivo', 800, width * .045, textWidth);
  context.fillText('de regalo para la mesa', textLeft, boxTop + boxHeight * .58);
  context.fillStyle = theme.soft;
  context.font = `600 ${width * .022}px Archivo`;
  context.fillText(`Mesa de 4 o más · el día del festejo, hasta la 1 de la mañana · válida hasta el ${PROMO_END}`, textLeft, boxTop + boxHeight * .75, inner - width * .1);
  context.font = `700 ${width * .024}px Michroma`;
  context.fillStyle = theme.text;
  context.fillText(code, textLeft, boxTop + boxHeight * .89);
  drawStamp(stampX, boxTop + boxHeight * .42, radius, theme);

  drawHeadline(data, theme, width, inner, story ? height * .27 : height * .24, boxTop - width * .09);

  context.textAlign = 'center';
  context.fillStyle = theme.soft;
  context.font = `700 ${width * .026}px Archivo`;
  context.fillText('VERDEL · CHACABUCO Y LAS PIEDRAS', center, boxTop - width * .035);
  context.font = `600 ${story ? 26 : width * .017}px Archivo`;
  context.fillText(LEGAL, center, story ? 1661 : height - pad * .4, inner);

  whatsapp.href = `https://wa.me/?text=${encodeURIComponent(groupMessage(data, `${location.origin}${location.pathname}?v=wa`))}`;
  prepare();
}

function drawHeadline(data, theme, width, inner, top, bottom) {
  const title = headline(data).toUpperCase();
  const lines = titleLines(title, fitFont(title, '"Archivo Black"', 400, width * .2, inner) < width * .13);
  const school = clean(data.school);
  const rows = [
    { text: partyDate(data.date) ? `Festejo · ${partyDate(data.date)}` : 'Festejo', family: 'Archivo', weight: 800, max: width * .036, color: theme.soft },
    ...lines.map((text) => ({ text, family: '"Archivo Black"', weight: 400, max: width * (lines.length > 1 ? .15 : .2), color: theme.text })),
    { text: (clean(data.name) || 'Tu nombre').toUpperCase(), family: '"Archivo Black"', weight: 400, max: width * .2, color: theme.accent },
    ...(school ? [{ text: school, family: 'Archivo', weight: 700, max: width * .045, color: theme.soft }] : []),
  ];
  for (const row of rows) row.size = fitFont(row.text, row.family, row.weight, row.max, inner);
  const total = rows.reduce((sum, row) => sum + row.size * 1.18, 0);
  const scale = Math.min(1, (bottom - top) / total);
  let y = top;
  context.textAlign = 'center';
  for (const row of rows) {
    const size = row.size * scale;
    y += size * (row === rows[0] ? .8 : 1.18);
    context.font = `${row.weight} ${size}px ${row.family}`;
    context.fillStyle = row.color;
    context.fillText(row.text, width / 2, y);
  }
}

function titleLines(title, split) {
  const words = title.split(' ');
  if (!split || words.length < 2) return [title];
  let best = 1;
  for (let i = 1; i < words.length; i += 1) {
    const gap = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (gap < Math.abs(words.slice(0, best).join(' ').length - words.slice(best).join(' ').length)) best = i;
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

function prepare() {
  ready = null;
  const ticket = ++pending;
  canvas.toBlob((blob) => {
    if (ticket === pending && blob) ready = new File([blob], FORMATS[format].file, { type: 'image/png' });
  }, 'image/png');
}

function missing() {
  const field = ['name', 'date'].map((key) => form.elements[key]).find((input) => !clean(input.value));
  if (!field) return false;
  hint.textContent = field.name === 'name' ? 'Falta el nombre de quien se recibe.' : 'Falta el día del festejo.';
  field.focus();
  return true;
}

function save(file) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = FORMATS[format].file;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  hint.textContent = format === 'poster' ? 'Listo. Imprimilo en A4 y traelo el día del festejo.' : 'Listo. Subila a tu historia y etiquetá a quien se recibe.';
}

async function download() {
  if (missing()) return;
  await document.fonts.ready;
  if (!ready) await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob && (ready = new File([blob], FORMATS[format].file, { type: 'image/png' }))), 'image/png'));
  if (ready) save(ready);
  else hint.textContent = 'No se pudo armar la imagen. Probá de nuevo.';
}

function share() {
  if (missing()) return;
  if (!ready || !navigator.canShare?.({ files: [ready] })) {
    download();
    return;
  }
  navigator.share({ files: [ready], text: 'Festejamos en Verdel 🍺' }).catch((error) => {
    if (error.name !== 'AbortError') download();
  });
}

function selectFormat(button) {
  format = button.dataset.format;
  for (const tab of document.querySelectorAll('.tab')) {
    const on = tab === button;
    tab.classList.toggle('is-on', on);
    tab.setAttribute('aria-selected', String(on));
  }
  document.getElementById('download').textContent = format === 'poster' ? 'Descargar cartel' : 'Descargar historia';
  draw();
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

form.elements.date.value = today();
form.elements.date.min = today();
fillDegrees();
form.addEventListener('input', (event) => {
  if (event.target.name === 'gender') fillDegrees();
  otherWrap.hidden = degreeSelect.value !== 'other';
  draw();
});
form.addEventListener('submit', (event) => event.preventDefault());
for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => selectFormat(tab));
document.getElementById('download').addEventListener('click', download);
document.getElementById('share').addEventListener('click', share);
draw();
Promise.all(['400 40px Michroma', '400 40px "Archivo Black"', '800 40px Archivo'].map((font) => document.fonts.load(font))).then(draw);
