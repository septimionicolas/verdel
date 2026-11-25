import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { qrSvg } from '../../web/qr.js';
import { PROMO_TERMS, PROMO_END, LEGAL } from '../../web/recibidos-text.js';

const SITE = 'https://verdel-production.up.railway.app';
const SHORT = 'verdel-production.up.railway.app/recibidos.html';
const POINTS = process.argv.slice(2).length ? process.argv.slice(2) : ['fa', 'ca', 'ba'];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NORTE = `data:image/png;base64,${readFileSync(new URL('../carta-impresa/norte-logo.png', import.meta.url)).toString('base64')}`;
const here = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

const LOGO = `<svg class="logo" viewBox="0 0 640 120" role="img" aria-label="Verdel">
<defs>
<linearGradient id="ag" x1="0" y1="18" x2="0" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE27A"/><stop offset=".42" stop-color="#C9DE52"/><stop offset="1" stop-color="#2FA35F"/></linearGradient>
<linearGradient id="ab" x1="0" y1="22" x2="0" y2="98" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFD25A"/><stop offset=".55" stop-color="#F4AE25"/><stop offset="1" stop-color="#C9780E"/></linearGradient>
</defs>
<path d="M8 22H96L52 96Z" fill="url(#ab)"/>
<text x="0" y="98" font-family="Michroma" font-size="104" fill="#F4F6FF" opacity=".92">V</text>
<g fill="#FFFDF5"><circle cx="10" cy="22" r="8"/><circle cx="22" cy="16" r="10"/><circle cx="36" cy="13" r="11"/><circle cx="51" cy="12" r="12"/><circle cx="66" cy="13" r="11"/><circle cx="80" cy="16" r="10"/><circle cx="93" cy="21" r="8"/><circle cx="30" cy="22" r="8"/><circle cx="58" cy="21" r="9"/><circle cx="44" cy="20" r="8"/><circle cx="73" cy="22" r="8"/></g>
<text x="110" y="98" font-family="Michroma" font-size="104" letter-spacing="6" fill="url(#ag)">ERDEL</text>
</svg>`;

const STYLE = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body { font-family: Archivo, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
.card { position: relative; overflow: hidden; }
.front { color: #F4F6FF; background: radial-gradient(80mm 60mm at 0 0, rgba(47,163,95,.55), transparent 70%), radial-gradient(70mm 60mm at 110% 55%, rgba(246,196,67,.30), transparent 70%), #06120F; padding: 8mm 8mm 6mm; display: flex; flex-direction: column; }
.logo { width: 46mm; height: auto; display: block; }
.ask { margin-top: 5mm; font-family: "Archivo Black", sans-serif; font-size: 25pt; line-height: .95; letter-spacing: -.01em; }
.ask small { display: block; margin-top: 1.5mm; font-family: Archivo, sans-serif; font-weight: 700; font-size: 10pt; letter-spacing: 0; color: #B7C7BC; }
.gift { margin: 5mm 0 3mm; padding: 2.6mm 3mm; border: .35mm solid rgba(127,211,106,.55); border-radius: 3mm; }
.gift b { display: block; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 17pt; line-height: 1; color: #F6C443; }
.gift span { font-weight: 700; font-size: 9pt; color: #F4F6FF; }
.cta { margin-top: auto; display: grid; grid-template-columns: 31mm 1fr; gap: 3mm; align-items: center; padding: 2.5mm; border-radius: 3mm; background: #FFFDF5; color: #06120F; }
.cta svg { width: 31mm; height: 31mm; display: block; }
.cta strong { display: block; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 11.5pt; line-height: 1.02; }
.cta em { display: block; margin-top: 1.5mm; font-style: normal; font-weight: 600; font-size: 6.4pt; word-break: break-all; color: #40524A; }
.terms { margin-top: 2.4mm; font-size: 7pt; line-height: 1.3; color: #D5E0D8; }
.front .legal { margin-top: 1.2mm; font-size: 7pt; font-weight: 700; color: #F4F6FF; }
.tag { position: absolute; right: 3mm; bottom: 2mm; font-size: 5pt; font-weight: 800; letter-spacing: .1em; opacity: .5; }
.vig { margin-top: 4mm; font-size: 8pt; font-weight: 700; line-height: 1.3; }
.terms b { color: #F4F6FF; }
.back { background: #FFFDF5; color: #06120F; padding: 9mm 8mm 6mm; display: flex; flex-direction: column; }
.back h2 { font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 17pt; line-height: 1; }
.steps { margin-top: 5mm; list-style: none; display: grid; gap: 3.2mm; counter-reset: step; }
.steps li { position: relative; padding-left: 10mm; font-size: 9.5pt; font-weight: 600; line-height: 1.25; counter-increment: step; }
.steps li::before { content: counter(step); position: absolute; left: 0; top: -.4mm; width: 7mm; height: 7mm; border-radius: 50%; background: #06120F; color: #FFFDF5; font-family: "Archivo Black", sans-serif; font-size: 10pt; display: grid; place-items: center; }
.posta { margin-top: 6mm; padding: 3mm; border: .4mm dashed #06120F; border-radius: 3mm; }
.posta b { display: block; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 12pt; }
.posta p { margin-top: 1mm; font-size: 8.4pt; line-height: 1.3; }
.foot { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 3mm; font-size: 7pt; line-height: 1.35; }
.norte { width: 9mm; height: 9mm; background: url(${NORTE}) center / contain no-repeat; }
.mini { position: relative; margin: 5mm auto 0; width: 44mm; height: 29mm; transform: rotate(-4deg); padding: 3mm; border-radius: 1.5mm; background: linear-gradient(#0A1C18, #06120F); box-shadow: 0 2mm 6mm rgba(0,0,0,.6), 0 0 0 .3mm rgba(127,211,106,.45); text-align: center; }
.mini i { display: block; font-style: normal; font-weight: 800; font-size: 5pt; color: #B7C7BC; letter-spacing: .08em; }
.mini b { display: block; margin-top: 1.5mm; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 10pt; line-height: 1; }
.mini strong { display: block; font-family: "Archivo Black", sans-serif; font-weight: 400; font-size: 17pt; line-height: 1.05; color: #F6C443; }
.mini span { display: block; margin-top: 1.5mm; padding: 1mm; border: .25mm dashed rgba(127,211,106,.6); border-radius: 1mm; font-weight: 800; font-size: 5.2pt; }
.mini::after { content: "TU CARTEL"; position: absolute; right: -6mm; top: -3mm; padding: .8mm 2mm; border-radius: 99px; background: #F6C443; color: #06120F; font-weight: 900; font-size: 5.5pt; transform: rotate(8deg); }
.agenda { margin-top: 5mm; display: grid; gap: 3.5mm; font-size: 8.6pt; font-weight: 700; }
.agenda div { display: flex; gap: 2mm; align-items: flex-end; }
.agenda div::after { content: ""; flex: 1; border-bottom: .3mm solid #06120F; }
.legal { margin-top: 2mm; font-size: 7pt; color: #40524A; }
`;

function front(point) {
  const url = `${SITE}/recibidos.html?v=${point}`;
  return `<section class="card front">
${LOGO}
<h1 class="ask">¿Se recibe tu amiga?<small>¿O tu amigo, tu prima, tu compañero de banco?</small></h1>
<div class="mini"><i>FESTEJO · VIERNES</i><b>¡SOY LICENCIADA!</b><strong>SOFI</strong><span>ESTE CARTEL VALE 2 L DE NORTE</span></div>
<div class="gift"><b>2 LITROS DE NORTE</b><span>de regalo para la mesa del festejo</span></div>
<div class="cta">${qrSvg(url, { dark: '#06120F', light: '#FFFDF5', margin: 2 })}<div><strong>Escaneá y hacé el cartel gratis</strong><em>${SHORT}</em></div></div>
<p class="terms"><b>Chacabuco y Las Piedras.</b> ${PROMO_TERMS} · con el cartel Verdel sellado en barra.</p>
<p class="legal">${LEGAL}</p>
<span class="tag">${point.toUpperCase()}</span>
</section>`;
}

function back(point) {
  return `<section class="card back">
<h2>Cómo se canjea</h2>
<ol class="steps">
<li>Escaneá el QR del frente y hacé el cartel con el nombre y el título.</li>
<li>Imprimilo en A4 y subí la historia para avisarle al grupo.</li>
<li>Vengan a Verdel el día del festejo con el cartel impreso: lo sellamos, anotamos el código y van 2 litros a la mesa.</li>
</ol>
<div class="agenda"><div>Se recibe:</div><div>Festejamos el:</div></div>
<p class="vig">Promo válida hasta el ${PROMO_END} o hasta agotar stock.</p>
<div class="posta"><b>¿No se recibe nadie?</b><p>Pasá la posta: dáselo a quien está por rendir la última. El próximo festejo es suyo.</p></div>
<div class="foot"><div><b>Verdel</b> · Cervecería<br>Chacabuco y Las Piedras</div><span class="norte" role="img" aria-label="Cerveza Norte"></span></div>
<p class="legal">${LEGAL}</p>
<span class="tag">${point.toUpperCase()}</span>
</section>`;
}

function page(point) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Archivo+Black&family=Michroma&display=block" rel="stylesheet">
<title>Volante recibidos Verdel · ${point}</title><style>${STYLE}</style></head><body>
<div class="sheet">${front(point).repeat(4)}</div>
<div class="sheet">${back(point).repeat(4)}</div>
</body></html>`;
}

for (const point of POINTS) {
  const name = `volante-recibidos-${point}`;
  writeFileSync(here(`${name}.html`), page(point));
  if (!existsSync(CHROME)) continue;
  execFileSync(CHROME, ['--headless=new', '--no-pdf-header-footer', '--virtual-time-budget=6000', `--print-to-pdf=${here(`${name}.pdf`)}`, `file://${here(`${name}.html`)}`], { stdio: 'ignore' });
}
console.log(`Volantes: ${POINTS.join(', ')}`);
