# Contrato de la API

Prefijo `/api`. JSON en UTF-8. La plata va en centavos enteros. Los errores devuelven `{ "error": "CODIGO" }`.

## `GET /api/health`

Sin ingreso. `200 { ok, ready, telegram, bound, night, orders }`. `ready` es `false` si falta `STAFF_PIN`, `SETUP_KEY` o `SESSION_SECRET`; `bound` lista los grupos vinculados.

## `POST /api/staff/sessions`

La usa `moza.html` la primera vez en cada celular.

- Pide `{ "name": "Caro", "pin": "…" }`.
- `201 { "token": "…", "name": "Caro" }`.
- `401 PIN_INVALID`, `422 NAME_REQUIRED`, `429 LOCKED` (5 PIN mal desde el mismo origen).

## `POST /api/orders`

La usa `moza.html` al tocar «Confirmar y enviar a Telegram». Lleva `Authorization: Bearer <token>`.

- Pide `{ "code": "v1.7.no1x2-pe0x1", "force": false }`. El servidor valoriza el código con `web/menu.js`.
- `201 { "number": 23, "totalCents": 4700000, "telegram": "sent" }`. `telegram` es `sent`, `unbound` (no hay grupo de salón) o `failed` (Telegram no respondió); en los tres casos el pedido quedó registrado.
- `409 ORDER_ALREADY_SENT` con `number`, si el mismo código se confirmó hace menos de 10 minutos. Con `"force": true` entra como otro pedido.
- `401 SESSION_INVALID`, `422 ORDER_CODE_INVALID`, `422 PRODUCT_UNKNOWN`, `422 TABLE_UNKNOWN`, `503 NOT_CONFIGURED`.

## Lo que no pasa por la API

- La carta y el código del pedido: se arman en el celular del cliente (`web/order-code.js`).
- «Listo», «Cobrado en caja», «Anular» y `/cierre`: son botones y comandos del bot (`server/bot.js`).

## Registro (`data/events.jsonl`)

Una línea por evento, con `sequence`, `at` (UTC) y `type`: `chat_bound`, `order_confirmed`, `message_linked`, `kitchen_ready`, `order_charged`, `charge_reverted`, `order_voided`, `night_closed`. El id de un pedido es `<noche>-<número>`; la numeración vuelve a 1 con cada noche.
