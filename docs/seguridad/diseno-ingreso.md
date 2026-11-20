# Verdel: especificación final de ingreso de mozas por turno y código de pedido v2

Repo: /Users/nickynight/dev/verdel, rama seguridad/cierre-2026-11-20, HEAD e330366. Leí auth.js, http.js, bot.js, service.js, night.js, config.js, telegram.js, web/moza.js, web/order-code.js, web/app.js (paintQr y el seguimiento del pedido), CONTRATO-API.md y decisiones.md. No modifiqué ningún archivo.

## 0. Puntajes y por qué ganó la base

| Propuesta | Seguridad | Fricción para las mozas (10 = mínima) | Simpleza del código | Fidelidad al repo | Total |
|---|---|---|---|---|---|
| P1: identidad con el enlace de Telegram más renovación del dispositivo | 8 | 7 | 5 | 6 | 26 |
| P2: cookies HttpOnly más aprobación en el grupo | 9 | 5 | 4 | 4 | 22 |
| P3: simpleza, con Bearer y localStorage, y en el log solo `tokenHash` | 6 | 8 | 9 | 9 | 32 |

**Gana P3 como base.**
- Respeta el transporte actual: el encabezado Bearer, el CORS de `http.js` con métodos GET/POST/OPTIONS y moza.html servido desde GitHub Pages.
- Guarda las sesiones en el log solo como `tokenHash = HMAC-sha256(SESSION_SECRET, token)`.
- Es la que menos código agrega.

**Lo que tomo de las otras:**
- **De P1:** la identidad real. La moza toca un enlace a Telegram con `/start` y el bot verifica con `getChatMember` que esté en el grupo salon o en el owner. Es el camino principal y no necesita que nadie apruebe.
- **De P2:**
  - No se publica nada en un grupo mientras alguien no lo pida a propósito.
  - Queda una aprobación de respaldo en el grupo, con un número de control que tiene que coincidir con el de la pantalla.

**Lo que descarto, con su motivo:**
- **Cookies HttpOnly (P2):** necesitan que moza.html y la API compartan el mismo origen, y eso es la casilla V8, que todavía no está hecha.
- **Renovación automática del dispositivo (P1):** suma estado y código para ahorrar un toque por turno. No hay variable: si después se quiere, se agrega como casilla aparte.
- **La numeración D20/D21 de las tres propuestas:** ya existen D1 a D22, así que las decisiones nuevas son de D23 en adelante.

## 1. Flujo de ingreso

### Primera vez en un celular
1. La moza escanea el QR del cliente y se abre `moza.html#v2...`. Ve la tarjeta del pedido y debajo esto:
   - Texto: "Para confirmar pedidos tenés que ingresar. Dura hasta el cierre de la noche."
   - Campos: "Tu nombre" y "PIN del salón". Botón "Seguir".
2. Se manda `POST /api/staff/sessions {name, pin}` y vuelve `202 {requestId, claimSecret, botLink, matchCode, expiresAt}`. El servidor no crea ninguna sesión todavía.
   - El pedido de ingreso vive solo en memoria y vence a los 3 minutos.
   - `claimSecret` son 32 bytes y lo recibe únicamente ese navegador. En memoria se guarda solo su hash.
3. Pantalla de espera:
   - "Ahora confirmate en Telegram." Botón grande "Abrir Telegram", que lleva a `https://t.me/<usuario_del_bot>?start=in_<requestId>`. El usuario del bot se obtiene con `getMe` al arrancar.
   - "Número de control: 47", en grande. Es `matchCode`, dos dígitos al azar.
   - Enlace secundario: "No tengo Telegram o no estoy en el grupo".
   - La página pregunta `POST /api/staff/sessions/claim` cada 2 segundos mientras está visible.
4. En el chat privado con el bot llega `/start in_<requestId>`. Este caso se maneja antes que la respuesta de `/start` con helpText, y los bots de cocina (`kitchenOnly`) lo ignoran. El bot verifica dos cosas:
   - que el pedido exista y esté vigente;
   - que `getChatMember(chat salon u owner, from.id)` dé `creator`, `administrator`, `member`, o `restricted` con `is_member`.

   Si las dos se cumplen, contesta:
   > "Hola Ana Pérez. ¿Sos vos la que está ingresando como «Ana» desde Safari en iPhone, con el número 47?" Botones [Sí, soy yo] [No fui yo]

   Los callbacks son `staffme:<requestId>` y `staffnotme:<requestId>`. Se pide esa confirmación para que nadie le pase el enlace a una moza para que lo toque sin saber.
5. Al tocar **Sí, soy yo**:
   - Se registra el evento `staff_session_started` con `method: "telegram"`.
   - El bot edita su mensaje: "Listo, Ana. Volvé al navegador. Tu ingreso dura hasta el cierre de la noche (máximo 12 h)."
   - En la próxima consulta el navegador recibe `201 {token, name, expiresAt}`, lo guarda en `verdel-staff` y pasa a la pantalla de confirmar el pedido.
6. Si toca **No fui yo**:
   - Se rechaza el pedido.
   - Al grupo owner le llega: "Alguien con el PIN intentó ingresar como «Ana» y Ana Pérez dijo que no fue ella. Si se repite, cambiá STAFF_PIN."
7. Si el bot no la encuentra en ningún grupo, le contesta: "No te encuentro en el grupo del salón. Volvé al navegador y tocá «No tengo Telegram o no estoy en el grupo»."

### Respaldo: aprobación en el grupo (STAFF_GROUP_APPROVAL=true, activado por defecto)
- El navegador manda `POST /api/staff/sessions/ask`. Se puede pedir una sola vez por pedido de ingreso.
- El bot publica en el grupo **salon**:
  > "Ana pide entrar desde un celular nuevo (Safari en iPhone). Número de control: 47. Antes de aprobar, pedile que te muestre el número en su pantalla." Botones [Aprobar] [Rechazar]

  Los callbacks son `staffok:<requestId>` y `staffno:<requestId>`.
- Pueden aprobar los integrantes del grupo salon o del owner. Los botones solo funcionan en los chats vinculados con esos roles, igual que charge y void.
- Al aprobar, el bot edita el mensaje a "Ana entró. Aprobó Juan a las 21:04." y quita los botones. El evento lleva `method: "group"` y `approvedBy`.
- La pantalla de la moza dice: "Le avisamos al grupo del salón. Mostrale el número 47 al encargado."

### Respaldo de emergencia (STAFF_EMERGENCY_LOGIN=true, activado por defecto)
- En la pantalla de espera hay un enlace "Ingreso de emergencia (lo hace el encargado)". Abre el campo "Clave de instalación", que usa SETUP_KEY.
- El encargado la tipea en el celular de la moza. Se manda `POST /api/staff/sessions/emergency` y el evento lleva `method: "setup_key"`.
- Cada intento fallido cuenta para el bloqueo de login que ya existe.
- Al grupo owner le llega siempre: "Ingreso de emergencia de «Ana» a las 21:04."

### Veces siguientes
- El nombre queda guardado en `verdel-staff.name` y aparece ya escrito.
- Mientras el token esté vigente según `expiresAt` local, se entra directo a confirmar.
- Cuando la sesión vence, o el servidor responde 401, la pantalla dice "Tu turno terminó o te cerraron el ingreso. Ingresá de nuevo." y se repite el flujo: PIN y un toque en Telegram. El chat con el bot ya existe, así que es abrir y tocar "Sí, soy yo".

## 2. Modelo de sesión
- **Token:** son 32 bytes de `randomBytes`, en base64url, y no tienen punto. El servidor no lo guarda: solo `tokenHash`.
- **Dónde vive:**
  - El celular guarda el token en localStorage con la clave `verdel-staff`, como `{token, name, expiresAt}`.
  - El servidor guarda la sesión en el log con `staff_session_started {sessionId, tokenHash, name, telegramUserId?, telegramName?, method, approvedBy?, at, expiresAt}`. `sessionId` son 8 bytes en hex.
  - Al reconstruir el estado desde el log se arma `state.sessions`, un mapa de tokenHash a sesión.
  - Los pedidos de ingreso pendientes viven solo en memoria.
- **Duración (D24):** la sesión termina en lo que llegue primero:
  - el cierre de la noche;
  - `at + STAFF_SESSION_HOURS`, que por defecto es 12. Se acepta un entero de 1 a 16 y cualquier otro valor cae en 12, igual que `ADVISOR_NIGHT_LIMIT`.

  En cada `verify` se revisa `now < expiresAt` y que la sesión no esté cerrada. Desaparece `maxAgeMs = 30d` de `createAuth`, que se queda solo con la verificación del PIN y el bloqueo.
- **Cerrar una sesión:**
  - En los grupos salon u owner, `/mozas` lista "Ana · desde 21:04 · Telegram" con un botón [Cerrar] por sesión. El callback es `staffend:<sessionId>` y registra `staff_session_ended {sessionId, reason: "revoked", by}`.
  - Si la misma persona de Telegram (mismo `telegramUserId`) abre una sesión nueva, la anterior se cierra sola con `reason: "replaced"`.
  - La moza puede cerrar su propia sesión con `POST /api/staff/sessions/end` (Bearer), y se registra `reason: "logout"`.
- **Cerrar todas:** desde `/mozas`, el botón [Cerrar todas] pide confirmación [Sí, cerrar todas] [No], con el mismo patrón que close y closeno.
  - Los callbacks son `staffendall`, `staffendallyes` y `staffendallno`.
  - Se registra `staff_sessions_ended_all {by}`.
  - Para una emergencia total también sirve rotar SESSION_SECRET: todos los `tokenHash` dejan de coincidir.
- **/cierre:** el evento `night_closed` cierra en la reconstrucción del estado todas las sesiones abiertas antes de él. No se agrega ningún evento extra.
- **Reinicio del servidor:**
  - Las sesiones sobreviven porque salen del log.
  - Los pedidos de ingreso pendientes se pierden, y la moza toca "Probar de nuevo".
  - Los tokens del sistema anterior, con formato `payload.firma`, no están en el mapa y fallan desde el deploy, que es lo que se busca.

## 3. Caminos de falla

| Caso | Qué pasa |
|---|---|
| **Telegram caído** | Las sesiones abiertas siguen funcionando, porque la validación no depende de Telegram. Si `getMe` falló, `botLink` llega como null y la pantalla oculta "Abrir Telegram". El ask falla con `503 TELEGRAM_UNAVAILABLE`. Queda el ingreso de emergencia. Los pedidos se siguen registrando y la moza ve el aviso de siempre de que no llegó a Telegram. |
| **Nadie aprueba** | Pasados los 3 minutos, el claim da `410 REQUEST_EXPIRED` y la pantalla dice "Nadie confirmó a tiempo. Probá de nuevo o pedí el ingreso de emergencia." El mensaje del grupo se edita a "Venció sin respuesta.", con un tope de un minuto de demora. |
| **Grupo sin vincular** | Si no hay salon ni owner, no se puede verificar a nadie. `/api/staff/sessions` responde `202` con `botLink: null` y `groupApproval: false`, y solo queda la emergencia. Si no hay SETUP_KEY no aplica, porque el servidor ya da 503 NOT_CONFIGURED. Si solo está vinculado owner, la verificación de Telegram usa owner y el ask va a owner. |
| **Cambio de celular a mitad de la noche** | Ingresa de nuevo en el celular nuevo. Si entra por Telegram, la sesión vieja se cierra sola (replaced). Si entra por grupo o por emergencia, la vieja queda abierta hasta el cierre o hasta que alguien la cierre en `/mozas`. |
| **Celular robado** | Cualquier integrante de salon u owner usa `/mozas` y toca [Cerrar] o [Cerrar todas]. La sesión robada solo puede confirmar pedidos: no cobra ni anula, porque eso se hace en Telegram. Cada pedido queda firmado con `sessionId`. |
| **Dueño ausente** | No hace falta. Verifica Telegram o aprueba cualquier integrante de salon. La emergencia necesita a alguien que sepa SETUP_KEY (ver riesgos). |
| **Inundación de pedidos de ingreso de alguien que sabe el PIN** | Los pendientes tienen un tope de 5 por origen y 30 en total, y al pasarse se responde `429 TOO_MANY_REQUESTS`. Cuando se llenan los 30, el owner recibe un único aviso (se rearma cuando vuelve a haber lugar): sin eso, quien sepa el PIN deja al bar sin poder ingresar renovando 30 pedidos cada 3 minutos y nadie se entera. `/desbloquear` vacía los pedidos que no están aprobados. El camino de Telegram no publica nada. El ask tiene un tope de 6 publicaciones en el grupo cada 10 minutos en total; al superarlo se responde `429 ASK_LIMIT` y se manda un único aviso al owner: "Hay muchos pedidos de ingreso con el PIN correcto. Si no son de ustedes, cambiá STAFF_PIN." Cada "No fui yo" y cada rechazo en el grupo también le avisa al owner. |

**Bloqueo por origen:** la regla de 5 PIN fallidos y 5 minutos, que trae la otra rama, bloquea a todo el bar porque comparte una sola IP pública. No cambio esa regla. Agrego `/desbloquear` en el grupo owner, que llama a `auth.unlockAll()`, vacía los pedidos de ingreso pendientes y rechazados (los aprobados que la moza todavía no retiró se quedan) y registra `login_unlocked {by}`, para que la operación no quede frenada.

## 4. Código v2 (D25)
- **Formato:** `v2.<nonce>.<mesa>.<líneas>`.
  - Expresión regular: `^v2\.([a-z2-7]{20})\.(\d{1,2})\.([a-z0-9]{3}x\d{1,2}(?:-[a-z0-9]{3}x\d{1,2}){0,39})$`.
  - Las líneas y la mesa no cambian respecto de v1.
  - Cambia `encodeOrder(table, lines, nonce)`. `decodeOrder` devuelve `{nonce, table, lines}` y acepta solo v2. Si recibe v1, lanza `ORDER_CODE_OLD`.
- **Azar del lado del cliente:**
  - Se usa `crypto.getRandomValues(new Uint8Array(20))` y cada byte se pasa por `& 31` sobre el alfabeto `abcdefghijklmnopqrstuvwxyz234567`. Es uniforme exacto, porque 256 es múltiplo de 32, y da 100 bits.
  - El nonce vive solo en memoria en app.js. Se crea uno nuevo al cargar la página y con cada cambio del carrito. Mostrar dos veces el mismo carrito reusa el nonce. Cuando el seguimiento ve `received`, `order.clear()` lo descarta.
  - Si el navegador no tiene `crypto.getRandomValues`, el QR muestra "Tu navegador no puede armar el código. Mostrale el pedido a la moza."
- **Qué valida el servidor:** el formato, `priceOrder` (mesa y productos) y que el nonce no se haya usado nunca. Para eso está `state.usedNonces`, un conjunto que sale de todos los `order_confirmed` de todas las noches, anulados incluidos. El evento `order_confirmed` suma los campos `nonce` y `sessionId`.
- **Reuso y duplicados:**
  - **Nonce ya usado:** `409 ORDER_ALREADY_SENT {number, reason: "same_code"}`. En este caso se ignora `force`: un mismo código nunca se manda dos veces. La moza ve: "Este código ya se envió como #12. Para otra ronda, el cliente tiene que tocar algo en el carrito o recargar el menú." No aparece el botón de mandar igual.
  - **Mismo contenido** (mesa más líneas, sin el nonce) dentro de los 10 minutos, sin contar anulados: `409 ORDER_ALREADY_SENT {number, reason: "similar"}`, y `force: true` lo deja pasar. Se mantiene el aviso con "Enviar de nuevo igual".
  - `findDuplicate` pasa a comparar por `contentKey` en lugar de por `code`.
- **GET /api/orders/status?code=:**
  - Busca por nonce y exige que el código completo guardado sea idéntico al que llega. Si no coincide, responde `waiting`, para no filtrar información.
  - El parámetro `since` se acepta y se ignora.
  - Respuesta: `200 {state: waiting|received|cooking|ready|voided|unknown, number?, at}`, y `422 ORDER_CODE_INVALID` si el código está mal formado.
  - Límites, que reemplazan los 40 por minuto por origen (que con una sola IP alcanzan para 3 celulares): 20 por minuto por nonce, 600 por minuto por origen y 3000 por minuto en total. Al superarlos, `429 RATE_LIMITED`.
- **Qué pasa con v1:**
  - Al confirmar: `422 ORDER_CODE_OLD`. moza.html muestra la tarjeta "Este código es de una versión vieja del menú. Pedile al cliente que recargue la página y lo arme de nuevo."
  - En el estado: `200 {state: "unknown", at}`. app.js v2 corta el seguimiento con `unknown`, y una página vieja en caché lo corta sola con su límite de 1 hora.
  - No hay período de gracia.
  - **QR:** con 40 líneas el código pasa de unos 286 a unos 307 caracteres. Si una prueba muestra que `qr.js` con `MAX_VERSION=10` no lo arma, se baja el tope de líneas en la expresión regular hasta que entre. Además, según decisiones.md, hace falta verificar con un lector real.

## 5. Cambios de API, eventos, bot y variables

### CONTRATO-API.md

| Ruta | Envía | Respuestas |
|---|---|---|
| `POST /api/staff/sessions` | `{name, pin}` | `202 {requestId, claimSecret, botLink\|null, matchCode, expiresAt, groupApproval, emergency}`; `401 PIN_INVALID`, `422 NAME_REQUIRED`, `429 LOCKED`, `429 TOO_MANY_REQUESTS`, `503 NOT_CONFIGURED` |
| `POST /api/staff/sessions/claim` | `{requestId, claimSecret}` | `200 {state: "pending"}`, `201 {token, name, expiresAt}` (se entrega una sola vez), `403 REQUEST_DENIED`, `410 REQUEST_EXPIRED`, `429 RATE_LIMITED` (60 por minuto por pedido) |
| `POST /api/staff/sessions/ask` | `{requestId, claimSecret}` | `202 {asked: true}`, `409 ALREADY_ASKED`, `409 NO_GROUP`, `429 ASK_LIMIT`, `503 TELEGRAM_UNAVAILABLE` |
| `POST /api/staff/sessions/emergency` | `{requestId, claimSecret, setupKey}` | `201 {token, name, expiresAt}`, `401 KEY_INVALID`, `403 EMERGENCY_DISABLED`, `429 LOCKED` |
| `POST /api/staff/sessions/end` (Bearer) | sin cuerpo | `204`, `401 SESSION_INVALID` |
| `POST /api/orders` | `{code, force}` | `409` suma `reason`; nuevo `422 ORDER_CODE_OLD` |
| `GET /api/orders/status` | `?code=` | estado `unknown` y los límites nuevos |

**Errores nuevos para `ERROR_STATUS`:** `ORDER_CODE_OLD`, `REQUEST_EXPIRED`, `REQUEST_DENIED` y `KEY_INVALID`.

### Eventos nuevos
- `staff_session_started`
- `staff_session_ended` (reason: revoked, replaced o logout)
- `staff_sessions_ended_all`
- `staff_login_denied {name, by, reason: not_me|group}`
- `staff_login_emergency {sessionId, name}`, para la auditoría
- `login_unlocked {by}`

Cambio en uno existente: `order_confirmed` suma `nonce` y `sessionId`.

### Bot
- `/start in_<id>`, solo en el chat privado.
- `/mozas`, en salon u owner.
- `/desbloquear`, solo en owner.
- Callbacks:
  - `staffme` y `staffnotme`, para la propia moza;
  - `staffok` y `staffno`, para el grupo;
  - `staffend`, `staffendall`, `staffendallyes` y `staffendallno`, para cerrar sesiones.
- Los nombres de callback siguen el formato `acción:id:estación`.
- `helpText` suma `/mozas` y `/desbloquear`.

### Variables
- `STAFF_SESSION_HOURS`, por defecto 12, entre 1 y 16.
- `STAFF_GROUP_APPROVAL`, por defecto true.
- `STAFF_EMERGENCY_LOGIN`, por defecto true.

STAFF_PIN, SETUP_KEY y SESSION_SECRET no cambian de nombre. La regla de claves débiles de D19 sigue igual: un PIN de solo dígitos necesita al menos 12.

### decisiones.md
- **D23:** identidad por Telegram con PIN, y respaldo por grupo o por clave de instalación.
- **D24:** la sesión dura un turno y se guarda en el log solo con `tokenHash`.
- **D25:** código v2 con nonce de un solo uso.
- **D26:** límites de la consulta de estado. Revisa D16: el código, `qr.js` y la pantalla de la moza ahora sí cambian, y se deja de usar `since`.
- **D27:** v1 queda retirado sin período de gracia.
- **Valores de fábrica:** "el ingreso dura 30 días" pasa a "dura un turno, 12 h por defecto". "Estado 40 por minuto" pasa a 20 por nonce, 600 por origen y 3000 en total.

## 6. Pruebas de comportamiento
1. Con PIN correcto, la respuesta es 202 y no se crea ninguna sesión hasta que la moza confirma en Telegram. El claim antes de eso da `pending`.
2. `/start in_<id>` de alguien que está en salon, seguido de "Sí, soy yo", hace que el claim entregue el token una sola vez. El segundo claim da 410.
3. `/start` de alguien que no está en ningún grupo no crea sesión y la respuesta lo dice.
4. "No fui yo" rechaza el pedido y le avisa al owner.
5. Con un `claimSecret` incorrecto, el claim falla aunque el pedido esté aprobado.
6. El ask publica en salon una sola vez por pedido. [Aprobar] desde owner funciona y desde un chat no vinculado no hace nada.
7. Un pedido de ingreso vence a los 3 minutos (con reloj inyectado).
8. La emergencia con SETUP_KEY correcta crea la sesión y avisa al owner. Con clave incorrecta suma al bloqueo. Con `STAFF_EMERGENCY_LOGIN=false` da 403.
9. Un token vence a las `STAFF_SESSION_HOURS`. `night_closed` cierra las sesiones anteriores, y la reconstrucción del estado lo respeta.
10. Una sesión sobrevive a un reinicio, porque se reconstruye desde el log. Un pedido de ingreso pendiente no sobrevive.
11. El log contiene `tokenHash` y nunca el token ni el `claimSecret`.
12. Un token con el formato viejo da 401 SESSION_INVALID.
13. Una sesión nueva de la misma persona de Telegram cierra la anterior.
14. `/mozas` con [Cerrar] invalida esa sesión, y [Cerrar todas] con su confirmación invalida todas.
15. El tope de 5 pendientes por origen y 30 en total da 429; llenar los 30 le avisa una sola vez al owner, y `/desbloquear` los vacía. Pasado el límite de ask, el owner recibe un único aviso.
16. `/desbloquear` en owner levanta el bloqueo del origen y en salon no hace nada.
17. Un código v2 válido se confirma. El mismo nonce da 409 same_code aunque venga con `force`. Un nonce de un pedido anulado tampoco se puede reusar.
18. Un nonce distinto con el mismo contenido dentro de los 10 minutos da 409 similar, `force` lo deja pasar, y a los 11 minutos pasa sin aviso.
19. Un código v1 da 422 ORDER_CODE_OLD al confirmar y `unknown` en la consulta de estado.
20. La consulta de estado con un nonce que existe pero con otras líneas responde `waiting`.
21. Límites de la consulta de estado: 20 por minuto por nonce, y 600 por minuto desde un mismo origen repartidos entre 50 nonces.
22. El nonce que arma el cliente cumple `[a-z2-7]{20}`, cambia cuando cambia el carrito y se mantiene si se vuelve a mostrar el mismo.
23. El código v2 más largo posible se convierte en QR con `qr.js` sin error.
24. Con `STAFF_SESSION_HOURS=99` se usan 12.

## 7. Riesgos que quedan y por qué se aceptan
- **PIN compartido y una sola IP:** el PIN solo filtra la entrada y la identidad la da Telegram. El bloqueo de todo el bar se resuelve con `/desbloquear`. Se acepta porque cambiar el limitador de la otra rama no le toca a este diseño.
- **Un integrante del grupo aprueba sin mirar:** el número de control y el mensaje con nombre y hora dejan rastro. Se acepta porque el respaldo por grupo es la excepción.
- **SETUP_KEY tipeada en el celular de una moza:** se usa `autocomplete="off"`, cada uso avisa al owner y se puede apagar la emergencia. Se acepta porque sin ella, con Telegram caído, las mozas nuevas no podrían trabajar.
- **Token en localStorage y riesgo de XSS:** lo limita la CSP de D21, la sesión dura un turno y se puede cerrar. Se acepta hasta la casilla V8, que permite usar cookies con el mismo origen.
- **Celular robado con la sesión abierta:** el daño se limita a pedidos falsos firmados con `sessionId`, mientras alguien no lo cierre en `/mozas`. No puede cobrar ni anular.
- **Quien ve el QR puede consultar el estado de ese pedido:** se acepta porque solo expone el estado y el número. Para confirmar sigue haciendo falta una sesión (D2).
- **Telegram caído, dueño ausente y moza nueva:** no puede ingresar. Las que ya tenían sesión siguen, y la pantalla de la moza ya muestra el pedido para tomarlo a mano.
- **Páginas de menú viejas en caché tras el deploy:** una noche con algún "recargá la página". Se acepta antes que mantener v1 sin nonce.
- **Pedidos de ingreso pendientes perdidos al reiniciar:** el costo es un "Probar de nuevo", a cambio de no llenar el log.
