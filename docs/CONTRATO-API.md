# Contrato de la API

Prefijo `/api`. JSON en UTF-8. La plata va en centavos enteros. Los errores devuelven `{ "error": "CODIGO" }`. Toda respuesta, también los errores y los archivos de la carta, lleva las cabeceras de seguridad de D21 en `docs/decisiones.md`; las de la API, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.

Tope general por origen: 2.000 pedidos por minuto a cada ruta de `/api/` (las rutas que no existen comparten uno) y otros 2.000 a los archivos de la carta. Pasado el tope, `429 RATE_LIMITED` con `Cache-Control: no-store` en esa ruta; las otras siguen. `POST /api/orders` con un ingreso válido no cuenta para este tope: lo frena solo el tope por ingreso, así un celular que inunda la API desde el wifi del bar no deja a las mozas sin confirmar. Todos los celulares del bar salen por la misma dirección del wifi: los topes por origen están medidos para el bar lleno, no para un celular.

## `GET /api/health`

Sin ingreso. `200 { ok, ready }` y nada más: ni grupos vinculados, ni pedidos, ni si hay Telegram o modelo. `ready` es `false` si falta `STAFF_PIN`, `SETUP_KEY` o `SESSION_SECRET`, o si alguna es débil (ver «Claves» en `docs/decisiones.md`); en ese caso las rutas del salón responden `503 NOT_CONFIGURED`.

## `GET /config.js`

No es parte de `/api`, pero la sirve el servidor en lugar de `web/config.js`: `apiBase: ''`, `showCurrencySign`, `suggestions` (`true` si hay `ANTHROPIC_API_KEY`) y `allowedQrOrigins` (los orígenes de `ALLOWED_ORIGINS`, que `mesas.html?base=` acepta además del propio).

## Ingreso de las mozas: `POST /api/staff/sessions` y sus pasos

Lo usa `moza.html`. El campo del PIN acepta letras y números sin largo máximo, igual que `STAFF_PIN`: un teclado numérico o un tope de caracteres dejaría afuera a un PIN válido. El ingreso dura un turno: hasta el cierre de la noche o `STAFF_SESSION_HOURS` (12 por defecto), lo que llegue primero. La identidad la da Telegram; el PIN solo filtra la entrada (D28 y D29 en `docs/decisiones.md`, diseño completo en `docs/seguridad/diseno-ingreso.md`).

### `POST /api/staff/sessions`

- Pide `{ "name": "Ana", "pin": "…" }`. El nombre se recorta a 24 caracteres.
- `202 { "requestId": "…", "claimSecret": "…", "botLink": "https://t.me/<bot>?start=in_<requestId>", "matchCode": "47", "expiresAt": "…", "groupApproval": true, "emergency": true }`. No crea ninguna sesión: abre un pedido de ingreso que vive solo en memoria y vence a los 3 minutos. `claimSecret` lo recibe solo ese navegador; el servidor guarda su hash. `botLink` es `null` si el bot no respondió `getMe` al arrancar o si no hay grupo salon ni owner vinculado; `groupApproval` es `false` si `STAFF_GROUP_APPROVAL=false` o no hay grupo; `emergency` refleja `STAFF_EMERGENCY_LOGIN`.
- `401 PIN_INVALID`, `422 NAME_REQUIRED`, `429 LOCKED`, `429 TOO_MANY_REQUESTS` (ya hay 5 pedidos pendientes desde ese origen o 30 en total; al llenarse los 30, el owner recibe un único aviso hasta que vuelva a haber lugar, y `/desbloquear` los vacía), `503 NOT_CONFIGURED`.
- `429 LOCKED` sale tras 5 PIN mal desde el mismo origen (5 minutos, el doble en cada bloqueo seguido, hasta 1 hora) o durante el freno general (15 minutos tras 200 fallidos en 1 hora desde 20 orígenes o más; al vencer, la cuenta empieza de cero). Es la misma respuesta en los dos casos y para cualquier celular detrás de esa dirección; mientras dura, el PIN no se prueba. Los ingresos ya dados siguen andando (D23) y `/desbloquear` en el grupo owner lo levanta.
- `401 PIN_INVALID` es igual para un PIN mal con cualquier nombre: la respuesta no dice si falló el nombre, la clave o un bloqueo ajeno.

### `POST /api/staff/sessions/claim`

La página la pregunta cada 2 segundos mientras está visible.

- Pide `{ "requestId": "…", "claimSecret": "…" }`.
- `200 { "state": "pending" }` mientras nadie confirmó.
- `201 { "token": "…", "name": "Ana", "expiresAt": "…" }` cuando la moza tocó «Sí, soy yo» en Telegram, el grupo aprobó o hubo ingreso de emergencia. Se entrega una sola vez: el claim siguiente da `410`.
- `403 REQUEST_DENIED` si tocó «No fui yo» o el grupo rechazó.
- `410 REQUEST_EXPIRED` si venció, ya se entregó, no existe o el `claimSecret` no coincide (la respuesta no dice cuál).
- `429 RATE_LIMITED` al pasar 60 consultas por minuto del mismo pedido.

### `POST /api/staff/sessions/ask`

«No tengo Telegram o no estoy en el grupo». Publica el pedido en el grupo salon (u owner si es el único vinculado) con [Aprobar] y [Rechazar].

- Pide `{ "requestId": "…", "claimSecret": "…" }`.
- `202 { "asked": true }`.
- `409 ALREADY_ASKED` (una vez por pedido), `409 NO_GROUP` (sin grupo vinculado o `STAFF_GROUP_APPROVAL=false`), `410 REQUEST_EXPIRED`, `429 ASK_LIMIT` (6 publicaciones cada 10 minutos sumando todos los pedidos; al pasarlo el owner recibe un único aviso), `503 TELEGRAM_UNAVAILABLE`.

### `POST /api/staff/sessions/emergency`

«Ingreso de emergencia (lo hace el encargado)». El encargado tipea `SETUP_KEY` en el celular de la moza. El owner recibe siempre «Ingreso de emergencia de «Ana» a las 21:04.».

- Pide `{ "requestId": "…", "claimSecret": "…", "setupKey": "…" }`.
- `201 { "token": "…", "name": "Ana", "expiresAt": "…" }`.
- `401 KEY_INVALID` (cuenta para el mismo bloqueo que el PIN), `403 EMERGENCY_DISABLED`, `410 REQUEST_EXPIRED`, `429 LOCKED`.

### `POST /api/staff/sessions/end`

La moza cierra su propio ingreso. Lleva `Authorization: Bearer <token>`, sin cuerpo.

- `204`, `401 SESSION_INVALID`.

### El token

32 bytes al azar en base64url. El servidor no lo guarda: el registro lleva solo `tokenHash` (HMAC-SHA256 con `SESSION_SECRET`). Cambiar `SESSION_SECRET` cierra todos los ingresos. Un token del formato viejo (`datos.firma`) da `401 SESSION_INVALID`.

## `POST /api/orders`

La usa `moza.html` al tocar «Confirmar y enviar a Telegram». Lleva `Authorization: Bearer <token>`.

- Pide `{ "code": "v2.k3m5q2x7a4b6c3d5e2f7.7.no1x2-pe0x1", "force": false }`. El servidor valoriza el código con `web/menu.js`.
- El código es `v2.<nonce>.<mesa>.<líneas>`: `nonce` son 20 caracteres de `a-z` y `2-7` que arma el celular del cliente al azar (100 bits), `mesa` va de 0 (barra) a la última mesa y `líneas` son hasta 16 `<producto>x<cantidad>` separadas por `-`. El nonce cambia cada vez que el cliente toca el carrito o recarga la carta. El QR lleva `<dirección de moza.html>#<código>` y entra en la versión 10 de `web/qr.js` (213 bytes) solo si la dirección de `moza.html` tiene hasta 74 caracteres antes del `#`.
- `201 { "number": 23, "totalCents": 4700000, "telegram": "sent" }`. `telegram` es `sent`, `unbound` (no hay grupo de salón) o `failed` (Telegram no respondió ni con los reintentos); en los tres casos el pedido quedó registrado. Durante un corte de red la respuesta puede tardar unos segundos más.
- `409 { "error": "ORDER_ALREADY_SENT", "number": 12, "reason": "same_code" }` si ese nonce ya se confirmó alguna vez, en cualquier noche y aunque el pedido se haya anulado. `"force": true` no cambia nada: un código confirmado no se confirma nunca más.
- `409 { "error": "ORDER_ALREADY_SENT", "number": 12, "reason": "similar" }` si otro código con la misma mesa y las mismas líneas se confirmó hace menos de 10 minutos y no está anulado. Con `"force": true` entra como otro pedido.
- `422 ORDER_CODE_OLD` si el código es de la versión vieja (`v1.…`): no se confirma, el cliente recarga la carta.
- `401 SESSION_INVALID` (token vencido, cerrado o desconocido), `422 ORDER_CODE_INVALID`, `422 PRODUCT_UNKNOWN`, `422 TABLE_UNKNOWN`, `503 NOT_CONFIGURED`.
- `429 RATE_LIMITED` al pasar 30 pedidos por minuto desde el mismo ingreso, o al mandar con `"force": true` la misma mesa con las mismas líneas más de 3 veces en 10 minutos (sumando todos los ingresos). El pedido no queda registrado.

## `GET /api/orders/status?code=<código v2>`

La usa la carta (`web/app.js`) mientras muestra el código y después, para seguir el pedido. Sin ingreso.

- Busca, en todas las noches, el pedido confirmado con ese nonce, y solo lo da por encontrado si el código guardado es idéntico al recibido. Si no coincide entero, responde `waiting`. Un `since` que llegue se acepta y no se usa.
- `200 { "state": "waiting", "at": "2026-11-15T01:10:00.000Z" }` sin pedido. Con pedido: `{ "state": "received", "number": 23, "at": "…" }`.
- `state`: `waiting`, `received` (confirmado y sin cocina, solo bebidas), `cooking` (tiene cocina y falta alguna), `ready` (todas las cocinas avisaron «Listo»), `voided` (anulado) o `unknown` (código `v1.…`, que ya no se sigue: la carta deja de preguntar). Cobrar no cambia el estado.
- `at` es la hora del servidor en UTC.
- No devuelve líneas, totales ni nombres de personas.
- `422 ORDER_CODE_INVALID` si el código no cumple el patrón. `429 RATE_LIMITED` al pasar 20 consultas por minuto del mismo nonce (un celular pregunta 12), 1.200 por minuto desde el mismo origen (todos los celulares del bar salen por la misma IP: 30 mesas con 3 celulares preguntan unas 1.080) o 3.000 por minuto en total sumando todos los orígenes.

## `POST /api/suggestions`

La usa la carta (`web/app.js`) en «O contanos con tus palabras», debajo de «¿Qué tomamos?». Sin ingreso. La carta muestra el campo solo si su `config.js` dice `suggestions: true`: el servidor la sirve así cuando hay `ANTHROPIC_API_KEY`.

- Pide `{ "text": "somos 5, uno no toma, 40 lucas", "table": 7 }`: `text` de 1 a 200 caracteres después de recortar espacios; `table` es la mesa de la carta (0 es la barra, hasta `VENUE.tableCount`), o `null` o ausente si el cliente todavía no la eligió.
- `200 { "phrase": "Dos Norte de 2 litros y una gaseosa para el que no toma.", "lines": [{ "key": "no1", "quantity": 2 }, { "key": "ga1", "quantity": 1 }] }`. Cada `key` existe en la carta, `quantity` es un entero de 1 a 9, hay de 1 a 8 líneas y `phrase` es texto plano de hasta 160 caracteres. No trae precios: el total lo calcula la carta con `web/menu.js`.
- `422 TEXT_REQUIRED` (vacío o de más de 200 caracteres), `422 TABLE_UNKNOWN` (`table` no es un entero de 0 a `VENUE.tableCount`), `429 RATE_LIMITED` (más de 3 por minuto desde la misma mesa y origen, más de 60 por minuto desde el mismo origen, la mesa ya usó su parte de la noche, un décimo de `ADVISOR_NIGHT_LIMIT`, o se llegó a `ADVISOR_NIGHT_LIMIT` sumando todas las mesas; los clientes sin mesa comparten una sola parte), `503 ADVISOR_OFF` (no hay `ANTHROPIC_API_KEY`), `502 ADVISOR_FAILED` (el modelo no respondió algo válido o tardó más de 6 s).
- El texto del cliente no se guarda ni en el log ni en `events.jsonl`; el log lleva solo conteos.

## Lo que no pasa por la API

- La carta y el código del pedido: se arman en el celular del cliente (`web/order-code.js`).
- «Listo», «Cobrado en caja», «Anular» y `/cierre`: son botones y comandos del bot (`server/bot.js`).
- La confirmación del ingreso en Telegram (`/start in_<requestId>` en el chat privado con el bot, «Sí, soy yo» / «No fui yo»), la aprobación en el grupo ([Aprobar] / [Rechazar]), `/mozas` en salon u owner (lista los ingresos abiertos con [Cerrar] y [Cerrar todas]) y `/desbloquear` solo en owner (levanta el bloqueo del PIN).
- El párrafo que cuenta la noche en `/cierre`: lo pide el servidor al modelo con solo números agregados y nombres de productos, y lo manda por Telegram como mensaje aparte. No se guarda en el registro.

## Registro (`data/events.jsonl`)

Una línea por evento, con `sequence`, `at` (UTC) y `type`: `chat_bound`, `order_confirmed`, `message_linked`, `kitchen_ready`, `order_charged`, `charge_reverted`, `order_voided`, `night_closed`, `staff_session_started`, `staff_session_ended` (`reason`: `revoked`, `replaced`, `logout`, o `unclaimed` solo en registros anteriores al 2026-11-20: hoy la sesión recién se abre cuando el navegador retira el token), `staff_sessions_ended_all`, `staff_login_denied` (`reason`: `not_me` o `group`), `staff_login_emergency` y `login_unlocked`. `order_confirmed` lleva `sessionId` del ingreso que lo confirmó y `nonce`, el del código v2; el servidor no acepta dos veces el mismo nonce. `staff_session_started` guarda `tokenHash`, nunca el token ni el `claimSecret`. `night_closed` cierra, al reconstruir el estado, todos los ingresos abiertos antes que él. El id de un pedido es `<noche>-<número>`; la numeración vuelve a 1 con cada noche.
