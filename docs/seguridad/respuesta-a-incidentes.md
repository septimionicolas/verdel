# Respuesta a incidentes

Qué hacer si una clave se filtra, si alguien entró donde no debía o si una persona deja de trabajar con el bar. Todas las rutas son las de un servidor propio instalado con `deploy/install.sh /opt/verdel verdel 3005`. En Railway, el `.env` son las variables del servicio, y guardarlas lo reinicia solo.

## Las claves

Después de cambiar cualquier valor del `.env`: `sudo systemctl restart verdel`, y revisá que la línea `listening` (`journalctl -u verdel -n 5`) no nombre nada en `missing` ni en `weak`.

| Clave | Para qué sirve | Dónde se cambia | Qué pasa al cambiarla |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Es el bot principal: quien la tiene lee y manda todo lo de Salón y Dueño, y puede tocar los botones como si fuera el bot | @BotFather → `/revoke` → elegí el bot. Te da un token nuevo; ponelo en el `.env` | El viejo deja de andar al instante. Los grupos siguen vinculados y los botones de los mensajes viejos siguen andando, porque es el mismo bot. Hasta reiniciar, el servidor no avisa a Telegram |
| `PIZZAS_BOT_TOKEN`, `HOUSE_BOT_TOKEN` | El bot de cada cocina de otro bar: lee los pedidos de esa cocina y marca «Listo» | Igual que el anterior, sobre el bot de esa cocina | Igual que el anterior, solo para esa cocina |
| `STAFF_PIN` | La moza la escribe en su celular la primera vez para confirmar pedidos | `.env` | Nadie nuevo entra con la vieja. **Las sesiones abiertas siguen** (duran 30 días): si se filtró, cambiá también `SESSION_SECRET` |
| `SESSION_SECRET` | Firma las sesiones del salón en cada celular | `.env`, con `openssl rand -hex 32` | Se cierran todas las sesiones: cada moza vuelve a escribir el PIN. Los pedidos y los grupos no cambian |
| `SETUP_KEY` | Con ella cualquiera le dice al bot qué grupo es Salón, cada cocina o Dueño (`/vincular`) | `.env`, con `openssl rand -hex 16` | La vieja deja de servir para `/vincular`. Los grupos ya vinculados siguen igual |
| `ANTHROPIC_API_KEY` | Escribe el párrafo del cierre y arma «O contanos con tus palabras»; gasta plata de la cuenta | Consola de Anthropic → API Keys → borrar la clave y crear otra | La vieja deja de andar al instante. Sin clave, el cierre sale sin el párrafo y la carta no muestra el texto libre |

Las tres del salón (`STAFF_PIN`, `SETUP_KEY`, `SESSION_SECRET`) tienen que ser distintas y fuertes (ver `docs/instalacion.md`); si no, el salón queda cerrado.

Fuera del `.env` también hay accesos: el repo en GitHub, Railway o el servidor (SSH por Tailscale), Cloudflare, y la cuenta de Telegram que creó los bots en @BotFather. Cada uno se cuida con su propia contraseña y segundo factor.

## Después de una intrusión

Pasa cuando una clave se filtró (un chat, una captura, un repo), cuando llegó un aviso de seguridad al grupo Dueño, o cuando aparecen pedidos o cobros que nadie hizo.

### 1. Cerrar la puerta

Cambiá en este orden, sin esperar a saber qué se llevaron:

1. Si entró al servidor o a Railway: cambiá la contraseña y el segundo factor de la cuenta, borrá las claves SSH que no reconozcas (`~/.ssh/authorized_keys` de cada usuario) y sacá de Tailscale las máquinas que no sean tuyas. Si no podés asegurar el servidor, armá uno nuevo con `deploy/install.sh`, restaurá el último respaldo bueno (`docs/instalacion.md`, sección 6) y apagá el viejo.
2. `TELEGRAM_BOT_TOKEN` y los de las cocinas, con `/revoke`.
3. `SESSION_SECRET` y `STAFF_PIN`, juntos. Pasale el PIN nuevo a las mozas en persona.
4. `SETUP_KEY`.
5. `ANTHROPIC_API_KEY`, si estaba en el mismo `.env`.
6. Reiniciá y revisá la línea `listening`.

### 2. Deshacer lo que hizo desde Telegram

- **Grupos cambiados.** `/estado` en Salón muestra qué grupo quedó en cada función. Si alguno no es el tuyo, en el grupo correcto: `/vincular <función> CLAVE-NUEVA`. La última vinculación pisa la anterior.
- **Pedidos falsos.** En Salón, «Anular pedido» y después «Sí, anular» en cada uno. Solo se anula un pedido sin cobrar.
- **Cobros falsos.** «Deshacer cobrado» en el pedido; si además era falso, anulalo después.
- **Gente de más en los grupos.** Sacá de Salón, Dueño y cada cocina a quien no corresponda: en un grupo, cualquiera puede tocar los botones.

Nada se borra del registro: anular y descobrar suman una línea nueva. El reporte de la noche deja lo anulado fuera de todos los totales y dice cuánto fue.

### 3. Revisar el registro

El registro de pedidos dice quién hizo qué y cuándo (`at`, en UTC):

```bash
cd /opt/verdel/data
grep '"type":"chat_bound"' events.jsonl
grep '"type":"order_confirmed"' events.jsonl | tail -n 50
grep -E '"type":"(order_charged|charge_reverted|order_voided)"' events.jsonl | tail -n 50
```

- `chat_bound` dice qué grupo se vinculó a cada función y cuándo: una vinculación que no hiciste marca el momento en que usaron la `SETUP_KEY`.
- `order_confirmed` trae el nombre que puso la moza (`staff`), la mesa y el código. Un nombre que no es de nadie, o pedidos a la hora en que el bar estaba cerrado, son del intruso.
- `by` en cobros y anulaciones dice quién tocó el botón en Telegram.

El registro del servidor dice quién entró, lo que intentaron y no les salió:

```bash
journalctl -u verdel --since "2026-11-20 00:00" | grep -E '"event":"(staff_login|staff_login_failed|security_alert|telegram_[a-z_]*)"'
```

- `staff_login` es cada ingreso bueno: el nombre que puso la moza (`name`) y la dirección (`origin`). Un nombre que no es de nadie, o un ingreso a la hora en que el bar estaba cerrado, es del intruso: desde ese `at` todo lo que firmó ese nombre es sospechoso.
- `staff_login_failed` es cada intento fallido, con `kind`: `pin` si el PIN no era, `locked` si llegó con los ingresos frenados. Se anotan hasta 60 por minuto, para que una ráfaga no llene el disco; los ingresos buenos se anotan siempre. Ninguna línea lleva el PIN ni el token.
- `security_alert` lleva los ingresos fallidos, desde cuántas direcciones y si se frenaron los ingresos nuevos. Guardá una copia de `events.jsonl` y de esa salida antes de tocar nada más, con la fecha en el nombre, fuera del servidor.

## Cuando alguien deja de trabajar con el bar

El mismo día, por cada cosa a la que tenía acceso:

| Qué | Qué hacer |
|---|---|
| Repo (GitHub) | Sacalo de colaboradores y de los equipos de la organización. Revisá que no haya dejado claves de despliegue (Settings → Deploy keys) ni tokens en Settings → Secrets |
| Proveedor (Railway o el servidor) | Railway: sacalo del proyecto o del equipo. Servidor: borrá su usuario o su clave SSH de `authorized_keys` y sacá su máquina de Tailscale. Cloudflare: sacalo de la cuenta |
| Bots | Si tenía acceso a la cuenta de Telegram que creó los bots o vio un token: `/revoke` de cada token que conocía |
| Grupos | Sacalo de Salón, Dueño y las cocinas. Si era administrador, quitale ese permiso antes |
| Claves que conocía | Moza o encargado: `STAFF_PIN` y `SESSION_SECRET` (su celular tiene una sesión de 30 días). Quien instaló o vio el `.env`: también `SETUP_KEY` y, si la vio, `ANTHROPIC_API_KEY` |

Después reiniciá, revisá la línea `listening` y pasale el PIN nuevo en persona a quienes siguen.
