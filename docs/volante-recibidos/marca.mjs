import { readFileSync } from 'node:fs';

// Logo y marca de Norte compartidos por el volante y el póster.
export const NORTE = `data:image/png;base64,${readFileSync(new URL('../carta-impresa/norte-logo.png', import.meta.url)).toString('base64')}`;

export const LOGO = `<svg class="logo" viewBox="0 0 640 120" role="img" aria-label="Verdel">
<defs>
<linearGradient id="ag" x1="0" y1="18" x2="0" y2="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE27A"/><stop offset=".42" stop-color="#C9DE52"/><stop offset="1" stop-color="#2FA35F"/></linearGradient>
<linearGradient id="ab" x1="0" y1="22" x2="0" y2="98" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFD25A"/><stop offset=".55" stop-color="#F4AE25"/><stop offset="1" stop-color="#C9780E"/></linearGradient>
</defs>
<path d="M8 22H96L52 96Z" fill="url(#ab)"/>
<text x="0" y="98" font-family="Michroma" font-size="104" fill="#F4F6FF" opacity=".92">V</text>
<g fill="#FFFDF5"><circle cx="10" cy="22" r="8"/><circle cx="22" cy="16" r="10"/><circle cx="36" cy="13" r="11"/><circle cx="51" cy="12" r="12"/><circle cx="66" cy="13" r="11"/><circle cx="80" cy="16" r="10"/><circle cx="93" cy="21" r="8"/><circle cx="30" cy="22" r="8"/><circle cx="58" cy="21" r="9"/><circle cx="44" cy="20" r="8"/><circle cx="73" cy="22" r="8"/></g>
<text x="110" y="98" font-family="Michroma" font-size="104" letter-spacing="6" fill="url(#ag)">ERDEL</text>
</svg>`;
