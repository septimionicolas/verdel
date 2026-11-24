// Arma la carta impresa (A3 con 3 mm de sangrado, dos paneles) desde web/menu.js.
// Uso: node docs/carta-impresa/build.mjs && luego Chrome headless --print-to-pdf.
import { writeFileSync } from 'node:fs';
import { SECTIONS, formatAmount } from '../../web/menu.js';
import { ART } from '../../web/art.js';

const URL_CARTA = 'https://verdel-production.up.railway.app';
const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Íconos propios de la impresa: trazo redondo, verde y amarillo cervecero.
const G = '#7FD36A', Y = '#F6C443', W = '#F4F6FF';
const mug = `<path d="M9 17h13v22a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3z" stroke="${Y}"/><path d="M12 24v13M16 24v13" stroke="${Y}" opacity=".5"/><path d="M9 22H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" stroke="${Y}"/><path d="M8 17c0-3 3-4 5-2.5 1.5-2 5-1.5 6 .5 2-.5 4 1 3 2" stroke="${W}"/>`;
const ICONS = {
  toast: `<g transform="rotate(12 15 42)">${mug}</g><g transform="translate(48 0) scale(-1 1) rotate(12 15 42)">${mug}</g><path d="M24 3v5M18.5 5.5l2.5 3.5M29.5 5.5 27 9" stroke="${G}"/>`,
  bottle: `<path d="M21 3h6v9c0 3 5 4.5 5 10v20a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V22c0-5.5 5-7 5-10z" stroke="${G}"/><path d="M21 7h6" stroke="${G}"/><rect x="16" y="25" width="16" height="10" fill="${Y}" stroke="none"/><path d="M20 30h8" stroke="#0A1C18"/><circle cx="22" cy="40" r="1" fill="${W}" stroke="none"/><circle cx="26" cy="38" r=".8" fill="${W}" stroke="none"/>`,
  fries: `<path d="M15 21V8M19 21V5M23 21V7M27 21V4M31 21V6M35 21V9" stroke="${Y}"/><path d="M11 20h26l-3 24H14z" stroke="${G}" fill="#0A1C18"/><path d="M11 20c4 5 9 6 13 6s9-1 13-6" stroke="${G}"/>`,
  pizza: `<path d="M24 45 9 13c10-5 20-5 30 0z" stroke="${Y}"/><path d="M8 11c10-5.5 22-5.5 32 0" stroke="${Y}" stroke-width="4.4"/><circle cx="20" cy="20" r="2.8" fill="${G}" stroke="none"/><circle cx="29" cy="22" r="2.8" fill="${G}" stroke="none"/><circle cx="24" cy="31" r="2.6" fill="${G}" stroke="none"/><path d="M17 27l1.5 1.5M30 30l1 2" stroke="${W}"/>`,
  burger: `<path d="M7 21c0-7 7-11 17-11s17 4 17 11z" stroke="${Y}"/><path d="M17 15h.1M24 13.5h.1M31 15h.1" stroke="${W}" stroke-width="2.6"/><path d="M6 26c3-2.4 5 2.4 9 0s5 2.4 9 0 5 2.4 9 0 5 2.4 9 0" stroke="${G}"/><rect x="8" y="29.5" width="32" height="5.5" rx="2.75" stroke="${W}"/><path d="M8 38h32v1.5a4.5 4.5 0 0 1-4.5 4.5h-23A4.5 4.5 0 0 1 8 39.5z" stroke="${Y}"/>`,
  highball: `<path d="M13 11h20l-2.5 33h-15z" stroke="${W}"/><path d="M14.3 22h17.4l-1.6 20H16z" fill="${Y}" opacity=".35" stroke="none"/><path d="M27 3 22 36" stroke="${G}"/><circle cx="35" cy="12" r="6" stroke="${G}"/><path d="M35 6v12M29.8 9l10.4 6M29.8 15l10.4-6" stroke="${G}" stroke-width="1.2"/><circle cx="19" cy="34" r="1" fill="${W}" stroke="none"/><circle cx="25" cy="29" r=".9" fill="${W}" stroke="none"/>`,
  can: `<rect x="13" y="8" width="22" height="36" rx="4" stroke="${W}"/><path d="M13 13h22M13 39h22" stroke="${W}" opacity=".55"/><path d="M13 20c5 3 17-3 22 0v10c-5-3-17 3-22 0z" fill="${G}" stroke="none" opacity=".85"/><path d="M21 5h6" stroke="${Y}"/>`,
};
const art = (key) => `<svg class="art" viewBox="0 0 48 48" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>`;
const FIZZ = new Set(['promos', 'beers', 'drinks', 'soft']);

function option(o) {
  const save = o.listCents ? `<span class="save">Ahorrás ${formatAmount(o.listCents - o.priceCents)}</span>` : '';
  const label = o.label ? `<span class="opt">${esc(o.label)}</span>` : '';
  return `<div class="chip${o.featured ? ' feat' : ''}">${label}<span class="price">$${formatAmount(o.priceCents)}</span>${save}</div>`;
}

function item(it) {
  const note = it.note ? `<span class="note">${esc(it.note)}</span>` : '';
  const many = it.options.length > 1;
  return `<div class="item${many ? ' many' : ''}"><div class="name">${esc(it.name)}${note}</div><div class="chips n${it.options.length}">${it.options.map(option).join('')}</div></div>`;
}

function section(id, extra = '') {
  const s = byId[id];
  const fizz = FIZZ.has(id) ? ' fizz' : '';
  return `<section class="sec${fizz} ${extra}${s.title.length>18?' long':''}" style="flex-grow:${s.items.length}"><header><div><h2>${esc(s.title)}</h2><p>${esc(s.hook)}</p></div>${art(s.art)}</header><div class="items">${s.items.map(item).join('')}</div></section>`;
}

// VERDEL en Michroma: la V es un vaso servido hasta arriba (cerveza, burbujas y espuma que desborda); ERDEL sigue con el degradé.
const TXT = 'y="98" font-family="Michroma" font-size="104"';
const FOAM = [[10,22,8],[22,16,10],[36,13,11],[51,12,12],[66,13,11],[80,16,10],[93,21,8],[30,22,8],[58,21,9],[44,20,8],[73,22,8]];
const BUBBLES = [[44,44,1.8],[57,52,1.4],[50,64,1.6],[61,36,1.3],[40,32,1.2],[53,76,1.1],[47,56,1]];
const logo = (id) => `<svg class="logo" viewBox="0 0 640 120" role="img" aria-label="Verdel">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="18" x2="0" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE27A"/><stop offset=".42" stop-color="#C9DE52"/><stop offset="1" stop-color="#2FA35F"/></linearGradient>
    <linearGradient id="${id}b" x1="0" y1="22" x2="0" y2="98" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFD25A"/><stop offset=".55" stop-color="#F4AE25"/><stop offset="1" stop-color="#C9780E"/></linearGradient>
  </defs>
  <path d="M8 22H96L52 96Z" fill="url(#${id}b)"/>
  <g fill="#FFF4D6">${BUBBLES.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" opacity=".75"/>`).join('')}</g>
  <text x="0" ${TXT} fill="#F4F6FF" opacity=".92">V</text>
  <g fill="#FFFDF5">${FOAM.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
  <path d="M14 27c6 3 10-1 15 1s9 2 14 0 9 2 14 0 9 1 14-1 8 1 13-1" stroke="#F4E3B0" stroke-width="1.4" fill="none"/>
  <text x="110" ${TXT} letter-spacing="6" fill="url(#${id}g)">ERDEL</text>
</svg>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Carta Verdel impresa</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Archivo+Black&family=Michroma&display=block" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<style>
:root{--ink:#06120F;--navy:#0A1C18;--line:rgba(127,211,106,.30);--peri:#9BE07F;--white:#F4F6FF;--mist:#B7C7BC;--violet:#2FA35F;--gold:#F6C443;--amber:#F4AE25}
@page{size:303mm 426mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Archivo,sans-serif;color:var(--white)}
.sheet{width:303mm;height:426mm;padding:3mm;display:grid;grid-template-columns:148.5mm 148.5mm;position:relative;overflow:hidden;
  background:radial-gradient(60mm 90mm at 76% 52%,rgba(47,163,95,.30),transparent 70%),radial-gradient(70mm 110mm at 22% 30%,rgba(246,196,67,.16),transparent 70%),linear-gradient(180deg,#0A1A1C,#06120F 55%,#08151A)}
#stars{position:absolute;inset:0;width:100%;height:100%}
.panel{position:relative;height:420mm;padding:11mm 10mm 10mm;display:flex;flex-direction:column}
.panel::before{content:"";position:absolute;inset:5mm;border:.35mm solid var(--line);border-radius:4mm;pointer-events:none}
/* Portada */
.cover{align-items:stretch}
.logo{width:100%;height:auto;margin-top:6mm}
.kind{font:600 4.2mm/1 Archivo;font-stretch:125%;letter-spacing:2.2mm;text-transform:uppercase;color:var(--peri);text-align:center;margin:3mm 0 7mm}
/* Secciones */
.sec{background:linear-gradient(180deg,rgba(20,44,36,.88),rgba(10,28,26,.84));border:.35mm solid var(--line);border-radius:4mm;padding:4mm 4.5mm 2mm;margin-bottom:4mm}
.sec header{display:flex;justify-content:space-between;align-items:center;gap:3mm;padding-bottom:2.2mm;border-bottom:.3mm solid var(--line);margin-bottom:.5mm}
.sec h2{font:400 7.4mm/1 'Archivo Black';color:var(--white);letter-spacing:-.1mm}
.sec header p{font:400 3.2mm/1.3 Archivo;color:var(--mist);margin-top:1.2mm}
.art{width:15mm;height:15mm;flex:none}
.item{display:flex;justify-content:space-between;align-items:center;gap:3mm;padding:2.1mm 0;border-bottom:.25mm solid rgba(142,162,255,.14)}
.item:last-child{border-bottom:0}
.item.many{flex-direction:column;align-items:stretch;gap:1.6mm}
.name{font:700 3.9mm/1.2 Archivo;font-stretch:105%}
.note{display:block;font:400 2.9mm/1.2 Archivo;color:var(--mist);margin-top:.5mm}
.chips{display:grid;gap:1.6mm}
.chips.n1{min-width:24mm}.chips.n2{grid-template-columns:1fr 1fr}.chips.n3{grid-template-columns:1fr 1fr 1fr}
.chip{border:.3mm solid var(--line);border-radius:2.4mm;padding:1.4mm 2.4mm;background:rgba(4,14,12,.55)}
.chip.feat{border-color:var(--gold);background:rgba(246,196,67,.14)}
.opt{display:block;font:500 2.7mm/1.2 Archivo;color:var(--mist)}
.price{display:block;font:800 4.4mm/1.15 Archivo;font-variant-numeric:tabular-nums}
.save{display:block;font:700 2.6mm/1.2 Archivo;color:var(--gold)}
/* QR y pie */
.qr{display:flex;align-items:center;gap:5mm;margin-top:auto;padding:4mm;border:.35mm solid var(--peri);border-radius:4mm;background:linear-gradient(90deg,rgba(47,163,95,.22),rgba(246,196,67,.10))}
#qr{width:36mm;height:36mm;background:#fff;border-radius:2mm;padding:1.6mm;flex:none}
#qr svg{width:100%;height:100%;display:block}
.qr b{display:block;font:400 5.6mm/1.05 'Archivo Black'}
.qr span{display:block;font:400 3.3mm/1.35 Archivo;color:var(--mist);margin-top:1.4mm}
.norte{text-align:center;margin-top:6mm}
.norte .n{font:italic 800 9mm/1 Archivo;font-stretch:90%;color:var(--white);letter-spacing:-.2mm}
.norte .c{font:600 2.4mm/1 Archivo;letter-spacing:1.2mm;color:var(--gold)}
.norte .t{font:600 2.6mm/1 Archivo;letter-spacing:1mm;color:var(--gold);border-top:.3mm solid var(--gold);display:inline-block;padding-top:1.2mm;margin-top:1.2mm}
.menu .head{display:flex;align-items:baseline;justify-content:space-between;margin:2mm 0 5mm}
.menu .head svg{width:46mm}
.menu .head span{font:600 3.6mm/1 Archivo;font-stretch:125%;letter-spacing:1.6mm;color:var(--peri);text-transform:uppercase}
.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 3.5mm;flex:1}
.cols .sec{padding:3.6mm 3.4mm 1.6mm}
.cols .sec h2{font-size:5.8mm}
.cols .sec header>div{min-width:0}
.cols .sec h2{text-wrap:balance}
.cols .sec.long h2{font-size:4.6mm;line-height:1.08}
.cols .art{width:11mm;height:11mm}
.cols .chip{padding:1.2mm 1.7mm}
.cols .price{font-stretch:78%;font-size:4.3mm}
.cols .chips{gap:1.3mm}
.cover .sec{zoom:1.27}
/* Ritmo parejo: cada renglón ocupa su parte de la tarjeta y su contenido va centrado en ella. */
.cols>div{display:flex;flex-direction:column;gap:4.5mm}
.cols .sec{flex:1 1 auto;display:flex;flex-direction:column;margin:0;padding:3.8mm 3.8mm 1.4mm}
.cols .sec header{margin-bottom:0}
.cols .items{flex:1;display:flex;flex-direction:column}
.cols .item{flex:1 1 auto;padding:2.6mm 0}
.cols .item:not(.many){display:grid;grid-template-columns:minmax(0,1fr) 23mm;align-content:center;align-items:center;column-gap:3mm}
.cols .item.many{justify-content:center;gap:2mm}
.cols .name{font-size:4.5mm;line-height:1.15}
.cols .note{font-size:3.1mm}
.cols .opt{font-size:2.9mm}
.cols .price{font-size:4.8mm}
.cols .chip{padding:1.6mm 2.2mm}
.cols .chips.n1{min-width:0}
.cols .chips.n2{grid-template-columns:repeat(2,minmax(0,1fr))}
.cols .chips.n3{grid-template-columns:repeat(3,minmax(0,1fr))}
.cols .chips.n3 .chip{padding:1.5mm 1.5mm}
.cols .chips.n3 .price{font-size:4.2mm}
/* Burbujas y espuma en las tarjetas de bebida */
.sec{position:relative;overflow:hidden}
.sec>*{position:relative}
.sec>.bub{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.sec.fizz{background:linear-gradient(0deg,rgba(246,196,67,.20),rgba(246,196,67,.04) 38%,transparent 60%),linear-gradient(180deg,rgba(14,38,34,.9),rgba(10,24,30,.86))}
.sec.fizz::after{content:"";position:absolute;left:0;right:0;top:0;height:1.6mm;background:repeating-radial-gradient(circle at 2mm 0,rgba(255,250,230,.55) 0 1.1mm,transparent 1.2mm 2.4mm);opacity:.5}
.foot{text-align:center;font:500 2.9mm/1.3 Archivo;color:var(--mist);margin-top:1mm}
</style></head><body>
<div class="sheet">
<svg id="stars" aria-hidden="true"></svg>
<div class="panel cover">
  ${logo('a')}
  <div class="kind">Cervecería</div>
  ${section('promos')}
  ${section('beers')}
  <div class="qr"><div id="qr"></div><div><b>Pedí desde la mesa</b><span>Escaneá, elegí y el pedido llega a la barra. La carta del celular siempre tiene los precios al día.</span></div></div>
  <div class="norte"><div class="c">CERVEZA</div><div class="n">Norte</div><div class="t">LA MÁS NUESTRA</div></div>
</div>
<div class="panel menu">
  <div class="head">${logo('b')}<span>Carta</span></div>
  <div class="cols">
    <div>${section('snacks')}${section('pizzas')}${section('soft')}</div>
    <div>${section('sandwiches')}${section('drinks')}</div>
  </div>
  <div class="foot">Precios en pesos argentinos.</div>
</div>
</div>
<script>
// Estrellas con semilla fija: el PDF sale igual cada vez.
let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;
const st=document.getElementById('stars');let h='';
for(let i=0;i<520;i++){const x=r()*100,y=r()*100,z=r();h+='<circle cx="'+x+'%" cy="'+y+'%" r="'+(z<.92?.5+z*.6:1.4+z)+'" fill="#fff" opacity="'+(.25+r()*.6).toFixed(2)+'"/>'}
st.innerHTML=h;
// Burbujas que suben desde el fondo de cada tarjeta de bebida, más densas abajo y a la derecha.
document.querySelectorAll('.sec.fizz').forEach((sec)=>{let b='';
  for(let i=0;i<70;i++){const x=38+Math.pow(r(),.6)*62,y=100-Math.pow(r(),1.8)*100,z=r();
    b+='<circle cx="'+x.toFixed(1)+'%" cy="'+y.toFixed(1)+'%" r="'+(1.2+z*z*5).toFixed(1)+'" fill="'+(z>.7?'none':'rgba(255,236,170,.10)')+'" stroke="rgba(255,236,170,'+(.18+z*.25).toFixed(2)+')" stroke-width=".8"/>'}
  sec.insertAdjacentHTML('afterbegin','<svg class="bub" aria-hidden="true">'+b+'</svg>')});
const q=qrcode(0,'M');q.addData(${JSON.stringify(URL_CARTA)});q.make();
document.getElementById('qr').innerHTML=q.createSvgTag({cellSize:4,margin:0,scalable:true});
</script>
</body></html>`;

writeFileSync(new URL('./carta-verdel.html', import.meta.url), html);
console.log('carta-verdel.html escrita');
