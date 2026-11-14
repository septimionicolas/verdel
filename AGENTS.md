# Verdel

Carta digital de la cervecería Verdel, con pedido por QR, avisos a Telegram y reporte de cierre. Lo hace SEPTIA con las mismas reglas de trabajo que `nightlife-os`.

| Carpeta | Qué es |
|---|---|
| `web/` | La carta, la página del salón (`moza.html`) y los QR de las mesas (`mesas.html`). Sitio estático, sin paso de compilación |
| `server/` | Servidor Node sin dependencias: confirma pedidos, habla con Telegram, guarda el registro y arma el reporte |
| `tests/` | Pruebas con `node:test`, incluida una noche completa contra un Telegram simulado |
| `docs/` | Decisiones, contrato de la API e instalación |
| `deploy/` | Instalación en un servidor propio |

## Reglas

- **Nombres del código en inglés** (archivos, funciones, variables, clases CSS, rutas de la API). Los textos que ve la gente, los commits y `docs/` van en español, con voseo.
- **Sin comentarios en el código.** El porqué va en el commit o en `docs/`.
- **La plata siempre en centavos enteros** (`priceCents`, `totalCents`). Nada de decimales.
- **Fechas en UTC** en el registro; la hora de Argentina se calcula solo al mostrar.
- **El estado es la suma del registro.** `data/events.jsonl` solo crece: cada línea dice qué pasó, cuándo y quién. Nada se edita a mano; un error se corrige con otro evento (por ejemplo, «Deshacer cobrado»).
- **Claves nunca en el repo.** Van en `.env`, que no se versiona; `.env.example` documenta cada variable.
- **La carta es la única fuente de precios.** `web/menu.js` lo usan la carta y el servidor; el servidor vuelve a valorizar cada pedido y no confía en totales que vengan de un celular.
- **Este sistema no cobra.** «Cobrado en caja» es una marca que pone el salón después de cobrar en el sistema del bar.
- **Sin dependencias.** Si algo necesita una librería, se discute antes.
- Lo que una pantalla le pide a la API se escribe primero en `docs/CONTRATO-API.md`.

## Trabajo

- Una rama y un PR a `main` por cada pieza. Nunca `push --force`, `rebase` ni `--amend` sobre algo empujado.
- Commits `tipo(area): qué cambia, contado como efecto`, una línea en blanco y un párrafo con el porqué. Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`. Áreas: `carta`, `qr`, `salon`, `pedidos`, `telegram`, `reportes`, `instalacion`, `repo`.
- Todo `fix` empieza por el test que reproduce el error.
- Antes de pedir revisión: `npm run verificar` en verde. Si cambia `web/qr.js`, además se leen los códigos con un lector real (ver `docs/decisiones.md`).

## Correr en local

Node 22 o más nuevo (la versión de trabajo está en `.nvmrc`). No hay nada que instalar.

1. `cp .env.example .env` y completá `STAFF_PIN`, `SETUP_KEY` y `SESSION_SECRET`.
2. `node --env-file=.env server/main.js` y abrí `http://localhost:3005/?mesa=7`.
3. `npm run verificar` corre las pruebas.
