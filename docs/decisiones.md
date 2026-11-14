# Decisiones

Tomadas con Septimio el 14-11-2026. Cada una dice qué se decidió y por qué.

| # | Decisión | Motivo |
|---|---|---|
| D1 | Repo propio, separado de `nightlife-os` | `nightlife-os` tiene una sola mano y es de otro cliente |
| D2 | El pedido lo confirma la moza escaneando un código en el celular del cliente | Nadie manda pedidos en broma ni desde afuera del bar; el cliente nunca le habla a la API |
| D3 | El código del pedido viaja entero en el QR (`v1.<mesa>.<producto>x<cantidad>-…`) | La carta queda como sitio estático y sigue andando aunque el servidor esté caído |
| D4 | El sistema no cobra. «Cobrado en caja» es una marca del salón | El cobro es de otro sistema del bar |
| D5 | Un solo bot y un grupo por función: Salón, Cocina de pizzas y empanadas, Cocina de Verdel, Dueño | Cada uno ve solo lo suyo; el vecino no ve precios ni ventas |
| D6 | Pizzas, empanadas y sfijas van a la cocina del otro bar; papas, sándwiches y hamburguesas, a la de Verdel | Así cocinan hoy. La sfija se puso con las empanadas: confirmar |
| D7 | 30 mesas, más la barra como mesa 0 | Pedido de Septimio |
| D8 | El registro es un archivo que solo crece (`events.jsonl`) | Son pocos datos; se audita leyéndolo y no hace falta una base |
| D9 | El bot consulta a Telegram (long polling) en vez de recibir un webhook | No hace falta una dirección pública para el bot |
| D10 | Servidor y sitio sin dependencias; el generador de QR es propio | Nada que instalar ni actualizar |

## Valores de fábrica

| Regla | Valor | Dónde se cambia |
|---|---|---|
| Mismo código de pedido repetido | Avisa si pasaron menos de 10 minutos; la moza puede enviarlo igual | `findDuplicate` en `server/night.js` |
| PIN mal | 5 intentos por origen, 5 minutos de bloqueo | `createAuth` en `server/auth.js` |
| Ingreso del salón | Dura 30 días por celular | `createAuth` en `server/auth.js` |
| Cerrar con pedidos sin cobrar | Se puede: el bot los lista y recomienda resolverlos antes | `server/bot.js` |
| Signo `$` en la carta | Oculto en los precios, visible en los totales | `showCurrencySign` en `web/config.js` |
| Zona horaria de los reportes | `America/Argentina/Tucuman` | `VENUE` en `web/menu.js` |

## Cómo se verificó el generador de QR

`web/qr.js` se probó generando ocho textos de 4 a 200 bytes (versiones 1 a 10) y leyéndolos con el lector de OpenCV; también se leyó el código desde una captura del celular del cliente y desde una tarjeta de mesa. `tests/qr.test.js` guarda la huella de un código ya leído: si el generador cambia, esa prueba falla y hay que volver a leer los códigos con un lector real.

## Pendiente de confirmar

- La sfija, ¿la cocina el otro bar o Verdel?
- Qué lleva cada «especial» y cada «Yankee», para describirlos en la carta.
- Fotos reales de los platos (campo `photo` de cada producto en `web/menu.js`).
