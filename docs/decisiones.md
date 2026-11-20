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
| D11 | Los avisos a Telegram se reintentan ante cortes de red y errores 5xx; nunca ante un 4xx como «message is not modified». Un aviso puede llegar repetido, pero no se pierde por un microcorte | El 14-11-2026 se perdió un «Listo para retirar» por un corte de segundos. Un aviso repetido trae mesa y número y se reconoce; uno perdido deja el plato en la barra |
| D12 | Cada cocina que es de otro bar puede tener su propio bot (`PIZZAS_BOT_TOKEN`, `HOUSE_BOT_TOKEN`). Ese bot solo vincula su grupo y solo atiende «Listo»; el principal queda para Salón y Dueño | Las cocinas son de otros bares: no ven los otros grupos, no cobran ni cierran, y si una deja de trabajar con Verdel se revoca su bot sin tocar el resto |
| D13 | La carta tiene fondo animado (burbujas, luces y espuma), pero se apaga y queda liso si el celular pide menos movimiento o tiene 2 núcleos o menos o 2 GB de memoria o menos. Las animaciones nuevas (View Transitions, dibujos ligados al scroll) son un agregado: sin soporte la carta queda como antes | La carta se abre en celulares baratos con la batería a medias; el movimiento no puede trabar el scroll ni el pedido |
| D14 | El maridaje es fijo: cada comida tiene una bebida en `PAIRINGS` de `web/menu.js`, y la carta la sugiere solo si el pedido todavía no tiene ninguna bebida (las promos cuentan como bebida) | Vive al lado de los precios, se revisa leyendo un archivo y un test avisa si una clave deja de existir en la carta |
| D15 | «¿Qué tomamos?» reemplaza a «¿Cuántos son en la mesa?»: tres preguntas (cuántos, cuánta hambre, qué les gusta) y una ronda fija por cada una de las 18 combinaciones, en `ROUNDS` de `web/menu.js`. La elige `pickRound`, una función pura que se puede reusar como respaldo | Responde al instante y sin red, con precios de la carta; un test revisa que las 18 combinaciones tengan ronda y que cada clave exista |
| D16 | El celular del cliente sigue su pedido preguntando al servidor por el código (`GET /api/orders/status`), sin ingreso. La respuesta es solo el estado y el número: ni líneas, ni total, ni nombres. Toma como punto de partida la hora del servidor al mostrar el código, así un pedido igual de antes no se confunde con el nuevo. El código del pedido, `qr.js` y la pantalla de la moza no cambian | El código ya está en el celular del cliente y cualquiera que lo vea podría consultarlo: por eso no se devuelve nada que no se sepa mirando la mesa. Preguntar cada pocos segundos alcanza para un bar y no pide abrir nada nuevo en el servidor |
| D17 | Con `ANTHROPIC_API_KEY`, `/cierre` manda después del resumen un párrafo corto que cuenta la noche, escrito por el modelo de `ADVISOR_MODEL`. Al modelo le van solo números agregados y nombres de productos; nunca nombres de personas ni textos libres. Sin clave, con error o pasados 8 s no se manda nada, y el párrafo no se guarda en el registro. La llamada es un `fetch` directo, sin SDK, en `server/advisor.js` | El resumen de números ya está; el párrafo es un agregado que no puede demorar ni trabar el cierre. Lo que no sale del servidor no se puede filtrar, y el registro sigue siendo solo lo que pasó |
| D18 | «O contanos con tus palabras» arma la ronda con el modelo, pero solo con claves de la carta: el servidor le pasa la carta, pide JSON y valida cada clave, cantidad y la frase antes de devolver algo; el total lo calcula la carta con sus precios. Aparece solo si la `/config.js` que sirve el servidor dice `suggestions: true`, y ante cualquier error las tres preguntas siguen andando. El texto de la mesa no se guarda | Lo que escribe un cliente no puede cambiar precios ni meter productos que no existen. Las tres preguntas quedan como respaldo que no depende de la red ni del modelo |
| D19 | Una clave débil cuenta como si faltara: el servidor arranca y sirve la carta, pero `ready` queda en `false`, el salón responde `503 NOT_CONFIGURED` y `/vincular` no acepta ninguna clave. El registro de arranque nombra las variables débiles (`weak`), nunca sus valores | Un PIN de fábrica o una firma corta se adivinan desde el wifi del bar; mejor un salón parado que uno abierto |
| D20 | `/api/health` responde solo `{ ok, ready }`. Si la ronda en texto libre está prendida lo dice la `config.js` que sirve el servidor (`suggestions`) | Cualquiera la puede consultar sin ingreso; contar qué grupos están vinculados o cuántos pedidos hubo le sirve a un extraño y a la carta no |
| D21 | Toda respuesta lleva HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin` y una `Permissions-Policy` que apaga cámara, micrófono, ubicación, pagos y USB. Las páginas llevan una CSP estricta (`script-src 'self'`, `style-src 'self'` más Google Fonts, `connect-src 'self'`) sin `'unsafe-inline'`; la API y los archivos que no son páginas, `default-src 'none'`. Para no necesitar `'unsafe-inline'` en estilos, las demoras de las burbujas pasaron a `styles.css` y no hay atributos `style` en el HTML; lo que el código cambia con `style.setProperty` la CSP no lo bloquea | Nadie puede meter la carta en un marco, ni correr código ajeno en ella si algún día se cuela un texto sin escapar |
| D22 | `mesas.html?base=` acepta solo el origen de la propia página o uno de la lista corta `allowedQrOrigins` de `config.js` (servida desde `ALLOWED_ORIGINS`); la regla vive en `web/qr-base.js`, sin consulta, ancla ni usuario en la dirección | Un enlace armado con `?base=` de otro sitio haría imprimir QR que mandan a los clientes a una carta falsa |

## Valores de fábrica

| Regla | Valor | Dónde se cambia |
|---|---|---|
| Mismo código de pedido repetido | Avisa si pasaron menos de 10 minutos; la moza puede enviarlo igual | `findDuplicate` en `server/night.js` |
| Telegram no responde | 3 reintentos, a 1, 2 y 4 s; si se agotan, 30 s sin reintentar o hasta que Telegram vuelva a contestar | `createTelegram` en `server/telegram.js` |
| Claves | `STAFF_PIN` de 8 caracteres o más (12 o más si son solo números), sin claves de fábrica (1234, 0000, password, admin, verdel, changeme…), sin un carácter repetido ni escaleras (12345678, abcdefgh); `SETUP_KEY` de 16 o más; `SESSION_SECRET` de 32 o más; ninguna igual a otra | `weakSettings` en `server/config.js` |
| PIN mal | 5 intentos por origen, 5 minutos de bloqueo; recuerda hasta 10.000 orígenes: al llenarse barre los vencidos y, si no alcanza, olvida el que falló hace más tiempo | `createAuth` en `server/auth.js` |
| Contadores de los topes | Cada tope recuerda hasta 10.000 claves (orígenes, códigos o sesiones); al llenarse barre las ventanas vencidas y, si no alcanza, suelta la más vieja | `createLimiter` en `server/limiter.js` |
| Conexiones lentas | 20 s para mandar los encabezados, 30 s para el pedido entero y 15 s de conexión viva entre pedidos (el seguimiento pregunta cada 5 a 8 s y reusa la misma) | `SERVER_TIMEOUTS` en `server/http.js` |
| Consultas sin ingreso (estado del pedido) | 40 por minuto por origen | `createHttpHandler` en `server/http.js` |
| Seguimiento en la carta | Pregunta cada 5 s hasta que la moza confirma y cada 8 s después; 30 s si el servidor frena; se rinde a la hora | Constantes al principio de `web/app.js` |
| Párrafo del cierre | Hasta 500 caracteres; si el modelo tarda más de 8 s, no se manda | `createAdvisor` en `server/advisor.js` y `server/narrative.js` |
| Ronda en texto libre | 5 por minuto por origen y `ADVISOR_NIGHT_LIMIT` (300) por noche entre todas las mesas, contadas en memoria (un reinicio las pone en cero); si el modelo tarda más de 6 s, «No pudimos armarla ahora» | `createHttpHandler` en `server/http.js` y `server/suggestions.js` |
| Ingreso del salón | Dura 30 días por celular | `createAuth` en `server/auth.js` |
| Cerrar con pedidos sin cobrar | Se puede: el bot los lista y recomienda resolverlos antes | `server/bot.js` |
| Signo `$` en la carta | Oculto en los precios, visible en los totales | `showCurrencySign` en `web/config.js` |
| Vaso de la barra «Ver mi pedido» | Se llena con 8 productos | `FULL_GLASS_UNITS` en `web/app.js` |
| Fondo animado de la carta | Apagado con movimiento reducido, 2 núcleos o menos, o 2 GB de memoria o menos | `isModestDevice` en `web/device.js` |
| Sugerencia de bebida (maridaje) | Se cierra sola a los 8 segundos | `PAIRING_SECONDS` en `web/app.js` |
| Zona horaria de los reportes | `America/Argentina/Tucuman` | `VENUE` en `web/menu.js` |

## Cómo se verificó el generador de QR

`web/qr.js` se probó generando ocho textos de 4 a 200 bytes (versiones 1 a 10) y leyéndolos con el lector de OpenCV; también se leyó el código desde una captura del celular del cliente y desde una tarjeta de mesa. `tests/qr.test.js` guarda la huella de un código ya leído: si el generador cambia, esa prueba falla y hay que volver a leer los códigos con un lector real.

## Pendiente de confirmar

- La sfija, ¿la cocina el otro bar o Verdel?
- Qué lleva cada «especial» y cada «Yankee», para describirlos en la carta.
- Fotos reales de los platos (campo `photo` de cada producto en `web/menu.js`).
