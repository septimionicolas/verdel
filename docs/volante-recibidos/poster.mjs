import { writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { qrSvg } from '../../web/qr.js';
import { PROMO_TERMS, LEGAL } from '../../web/recibidos-text.js';
import { LOGO, NORTE } from './marca.mjs';

const SITE = 'https://verdel-production.up.railway.app';
const SHORT = 'verdel-production.up.railway.app/recibidos.html';
const POINTS = process.argv.slice(2).length ? process.argv.slice(2) : ['fa', 'ca', 'ba'];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const here = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

const STYLE = `
@page { size: A3; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #06120F; }
body { font-family: Archivo, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.poster { position: relative; overflow: hidden; width: 297mm; height: 420mm; padding: 15mm 20mm 14mm; display: flex; flex-direction: column; color: #F4F6FF;
  background: radial-gradient(230mm 170mm at 0 0, rgba(47,163,95,.55), transparent 70%), radial-gradient(200mm 170mm at 115% 52%, rgba(246,196,67,.28), transparent 70%), #06120F; }
.logo { flex: none; width: 130mm; height: 24mm; display: block; }
h1 { margin-top: 8mm; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 74pt; line-height: .9; letter-spacing: -.02em; }
h1 span { color: #F6C443; }
.sub { margin-top: 5mm; font-weight: 700; font-size: 21pt; line-height: 1.2; color: #B7C7BC; max-width: 210mm; }
.mid { margin-top: 10mm; display: grid; grid-template-columns: 1fr 96mm; gap: 12mm; align-items: center; }
.gift { position: relative; padding: 9mm 10mm 8mm; border-radius: 7mm; background: linear-gradient(135deg, #FFE08A, #F6C443 55%, #E9A91C); color: #06120F; box-shadow: 0 0 0 1.2mm #FFF3C4, 0 0 0 3mm rgba(246,196,67,.35), 0 0 16mm rgba(246,196,67,.55); }
.gift i { display: block; font-style: normal; font-weight: 900; font-size: 14pt; letter-spacing: .16em; }
.gift b { display: block; margin-top: 1mm; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 52pt; line-height: .95; }
.gift span { display: block; margin-top: 3mm; font-weight: 800; font-size: 18pt; }
.gift .burst { position: absolute; margin: 0; right: -9mm; top: -16mm; width: 40mm; height: 40mm; clip-path: polygon(50% 0,61% 15%,79% 7%,80% 26%,98% 28%,89% 45%,100% 60%,82% 68%,85% 87%,66% 84%,56% 100%,44% 86%,26% 95%,22% 76%,3% 72%,13% 55%,0 40%,18% 32%,16% 12%,35% 15%); background: #E0362C; color: #FFFDF5; display: grid; place-items: center; transform: rotate(12deg); font-family: "Archivo Black", sans-serif; font-size: 16pt; line-height: .95; text-align: center; }
.gift .star { position: absolute; margin: 0; background: #FFF3C4; clip-path: polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%); }
.st1 { width: 9mm; height: 9mm; right: 36mm; top: -4.5mm; }
.st2 { width: 6mm; height: 6mm; right: 26mm; bottom: -3mm; }
.st3 { width: 7mm; height: 7mm; left: -3.5mm; top: 42%; }
.mesa { margin-top: 7mm; padding: 5mm 7mm; border: .6mm dashed #F6C443; border-radius: 5mm; display: flex; align-items: center; gap: 7mm; }
.mesa b { flex: none; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 19pt; line-height: 1; color: #F6C443; }
.mesa ul { list-style: none; display: flex; flex-wrap: wrap; gap: 2mm 6mm; font-size: 14pt; font-weight: 800; }
.mesa li::before { content: "★ "; color: #F6C443; }
.mini { position: relative; transform: rotate(-4deg); padding: 7mm; border-radius: 4mm; background: linear-gradient(#0A1C18, #06120F); box-shadow: 0 0 0 .7mm rgba(127,211,106,.45), 2mm 3mm 0 rgba(0,0,0,.45); text-align: center; }
.mini i { display: block; font-style: normal; font-weight: 800; font-size: 11pt; color: #B7C7BC; letter-spacing: .08em; }
.mini b { display: block; margin-top: 3mm; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 21pt; line-height: 1; }
.mini strong { display: block; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 40pt; line-height: 1.05; color: #F6C443; }
.mini span { display: block; margin-top: 3mm; padding: 2mm; border: .5mm dashed rgba(127,211,106,.6); border-radius: 2mm; font-weight: 800; font-size: 11pt; }
.mini::after { content: "TU MESA"; position: absolute; right: -9mm; top: -6mm; padding: 1.6mm 4mm; border-radius: 99px; background: #F6C443; color: #06120F; font-weight: 900; font-size: 12pt; transform: rotate(8deg); }
.steps { margin-top: 8mm; list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; counter-reset: step; }
.steps li { position: relative; padding-top: 15mm; font-size: 15pt; font-weight: 700; line-height: 1.25; counter-increment: step; }
.steps li::before { content: counter(step); position: absolute; left: 0; top: 0; width: 12mm; height: 12mm; border-radius: 50%; background: #F6C443; color: #06120F; font-family: "Archivo Black", sans-serif; font-size: 17pt; display: grid; place-items: center; }
.cta { margin-top: 7mm; display: grid; grid-template-columns: 64mm 1fr; gap: 9mm; align-items: center; padding: 6mm; border-radius: 6mm; background: #FFFDF5; color: #06120F; }
.cta svg { width: 64mm; height: 64mm; display: block; }
.cta strong { display: block; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 34pt; line-height: 1; }
.cta em { display: block; margin-top: 4mm; font-style: normal; font-weight: 700; font-size: 13pt; word-break: break-all; color: #40524A; }
.cta p { margin-top: 4mm; font-weight: 800; font-size: 15pt; }
.foot { margin-top: auto; padding-top: 6mm; display: flex; align-items: flex-end; justify-content: space-between; gap: 8mm; }
.terms { font-size: 11pt; line-height: 1.35; color: #D5E0D8; }
.terms b { color: #F4F6FF; }
.legal { margin-top: 2mm; font-size: 11pt; font-weight: 700; color: #F4F6FF; }
.norte { flex: none; width: 20mm; height: 20mm; border-radius: 3mm; background: #FFFDF5 url(${NORTE}) center / 80% no-repeat; }
.tag { position: absolute; right: 6mm; bottom: 4mm; font-size: 7pt; font-weight: 800; letter-spacing: .1em; opacity: .5; }
`;

function poster(point) {
  const url = `${SITE}/recibidos.html?v=${point}`;
  return `<section class="poster">
${LOGO}
<h1>¿Te recibís?<br><span>Festejalo en Verdel.</span></h1>
<p class="sub">¿O se recibe tu amiga, tu primo, tu compañero de banco? Traelos a festejar.</p>
<div class="mid">
<div class="gift"><span class="star st1"></span><span class="star st2"></span><span class="star st3"></span><i>TU REGALO</i><b>2 LITROS DE NORTE</b><span>para la mesa del festejo</span><span class="burst">GRA-<br>TIS</span></div>
<div class="mini"><i>RESERVA · VIERNES 21 H</i><b>FESTEJO DE</b><strong>SOFI</strong><span>MESA DE 6 · 2 L DE NORTE</span></div>
</div>
<ol class="steps">
<li>Escaneá el QR y mirá los beneficios.</li>
<li>Reservá por WhatsApp con el día y cuántos son.</li>
<li>El día del festejo decí tu código en la barra.</li>
</ol>
<div class="mesa"><b>Armá la mesa<br>del festejo</b><ul><li>Pizza + Norte de litro</li><li>12 empanadas + Norte de litro</li><li>Norte de 3 litros</li></ul></div>
<div class="cta">${qrSvg(url, { dark: '#06120F', light: '#FFFDF5', margin: 4 })}<div><strong>Escaneá y reservá tu festejo</strong><p>📍 Chacabuco y Las Piedras</p><em>${SHORT}</em></div></div>
<div class="foot"><div><p class="terms"><b>Promo recibidos.</b> ${PROMO_TERMS} · con reserva.</p><p class="legal">${LEGAL}</p></div><span class="norte" role="img" aria-label="Cerveza Norte"></span></div>
<span class="tag">${point.toUpperCase()}</span>
</section>`;
}

function page(point) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Archivo+Black&family=Michroma&display=block" rel="stylesheet">
<title>Póster recibidos Verdel · ${point}</title><style>${STYLE}</style></head><body>${poster(point)}</body></html>`;
}

for (const point of POINTS) {
  const name = `poster-recibidos-a3-${point}`;
  writeFileSync(here(`${name}.html`), page(point));
  if (!existsSync(CHROME)) continue;
  execFileSync(CHROME, ['--headless=new', '--no-pdf-header-footer', '--virtual-time-budget=6000', `--print-to-pdf=${here(`${name}.pdf`)}`, `file://${here(`${name}.html`)}`], { stdio: 'ignore' });
}
console.log(`Pósters A3: ${POINTS.join(', ')}`);
