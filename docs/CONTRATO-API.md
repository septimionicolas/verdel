# Contrato de la API

Prefijo `/api`. JSON en UTF-8. La plata va en centavos enteros. Los errores devuelven `{ "error": "CODIGO" }`.

## `GET /api/health`

Sin ingreso. `200 { ok, ready, telegram, advisor, bound, night, orders }`. `ready` es `false` si falta `STAFF_PIN`, `SETUP_KEY` o `SESSION_SECRET`, o si alguna es débil (ver «Claves» en `docs/decisiones.md`); en ese caso las rutas del salón responden `503 NOT_CONFIGURED`; `advisor` es `true` si hay `ANTHROPIC_API_KEY` (el párrafo del cierre y, más adelante, las sugerencias en texto libre); `bound` lista los grupos vinculados.

## `POST /api/staff/sessions`

La usa `moza.html` la primera vez en cada celular.

- Pide `{ "name": "Caro", "pin": "…" }`.
- `201 { "token": "…", "name": "Caro" }`.
- `401 PIN_INVALID`, `422 NAME_REQUIRED`, `429 LOCKED` (5 PIN mal desde el mismo origen).

## `POST /api/orders`

La usa `moza.html` al tocar «Confirmar y enviar a Telegram». Lleva `Authorization: Bearer <token>`.

- Pide `{ "code": "v1.7.no1x2-pe0x1", "force": false }`. El servidor valoriza el código con `web/menu.js`.
- `201 { "number": 23, "totalCents": 4700000, "telegram": "sent" }`. `telegram` es `sent`, `unbound` (no hay grupo de salón) o `failed` (Telegram no respondió ni con los reintentos); en los tres casos el pedido quedó registrado. Durante un corte de red la respuesta puede tardar unos segundos más.
- `409 ORDER_ALREADY_SENT` con `number`, si el mismo código se confirmó hace menos de 10 minutos. Con `"force": true` entra como otro pedido.
- `401 SESSION_INVALID`, `422 ORDER_CODE_INVALID`, `422 PRODUCT_UNKNOWN`, `422 TABLE_UNKNOWN`, `503 NOT_CONFIGURED`.

## `GET /api/orders/status?code=<código v1>&since=<ISO opcional>`

La usa la carta (`web/app.js`) mientras muestra el código y después, para seguir el pedido. Sin ingreso.

- Busca en la noche actual el pedido más reciente con ese código exacto y, si viene `since`, con `confirmedAt >= since`. Un `since` que no es una fecha se ignora.
- Siempre `200`. Sin pedido: `{ "state": "waiting", "at": "2026-11-15T01:10:00.000Z" }`. Con pedido: `{ "state": "received", "number": 23, "at": "…" }`.
- `state`: `received` (confirmado y sin cocina, solo bebidas), `cooking` (tiene cocina y falta alguna), `ready` (todas las cocinas avisaron «Listo») o `voided` (anulado). Cobrar no cambia el estado.
- `at` es la hora del servidor en UTC. La carta toma la primera como `since`, así un pedido igual confirmado antes no se confunde con el nuevo.
- No devuelve líneas, totales ni nombres de personas.
- `422 ORDER_CODE_INVALID` si el código no cumple el patrón, `429 RATE_LIMITED` al pasar 40 consultas por minuto desde el mismo origen.

## `POST /api/suggestions`

La usa la carta (`web/app.js`) en «O contanos con tus palabras», debajo de «¿Qué tomamos?». Sin ingreso. La carta muestra el campo solo si `/api/health` dice `advisor: true`.

- Pide `{ "text": "somos 5, uno no toma, 40 lucas" }`: de 1 a 200 caracteres después de recortar espacios.
- `200 { "phrase": "Dos Norte de 2 litros y una gaseosa para el que no toma.", "lines": [{ "key": "no1", "quantity": 2 }, { "key": "ga1", "quantity": 1 }] }`. Cada `key` existe en la carta, `quantity` es un entero de 1 a 9, hay de 1 a 8 líneas y `phrase` es texto plano de hasta 160 caracteres. No trae precios: el total lo calcula la carta con `web/menu.js`.
- `422 TEXT_REQUIRED` (vacío o de más de 200 caracteres), `429 RATE_LIMITED` (más de 5 por minuto desde el mismo origen, o se llegó a `ADVISOR_NIGHT_LIMIT` en la noche, sumando todas las mesas), `503 ADVISOR_OFF` (no hay `ANTHROPIC_API_KEY`), `502 ADVISOR_FAILED` (el modelo no respondió algo válido o tardó más de 6 s).
- El texto del cliente no se guarda ni en el log ni en `events.jsonl`; el log lleva solo conteos.

## Lo que no pasa por la API

- La carta y el código del pedido: se arman en el celular del cliente (`web/order-code.js`).
- «Listo», «Cobrado en caja», «Anular» y `/cierre`: son botones y comandos del bot (`server/bot.js`).
- El párrafo que cuenta la noche en `/cierre`: lo pide el servidor al modelo con solo números agregados y nombres de productos, y lo manda por Telegram como mensaje aparte. No se guarda en el registro.

## Registro (`data/events.jsonl`)

Una línea por evento, con `sequence`, `at` (UTC) y `type`: `chat_bound`, `order_confirmed`, `message_linked`, `kitchen_ready`, `order_charged`, `charge_reverted`, `order_voided`, `night_closed`. El id de un pedido es `<noche>-<número>`; la numeración vuelve a 1 con cada noche.
