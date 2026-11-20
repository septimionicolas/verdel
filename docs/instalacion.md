# Instalación

## 1. El bot (una vez, desde Telegram)

1. Hablale a @BotFather, mandá `/newbot`, elegí nombre y un usuario que termine en `bot`.
2. Guardá el token. Va solo en el `.env` del servidor (o en las variables de Railway): no se comparte por chat ni se sube al repo. Si se filtra, seguí [`seguridad/respuesta-a-incidentes.md`](seguridad/respuesta-a-incidentes.md).
3. Si una cocina es de otro bar, creale su propio bot con `/newbot` y cargá el token en `PIZZAS_BOT_TOKEN` o `HOUSE_BOT_TOKEN`.
4. Creá los grupos: **Salón** (mozos y encargado) y **Dueño** con el bot principal, y cada cocina (**Cocina de pizzas y empanadas**, **Cocina de Verdel**) con su bot, o con el principal si no tiene uno propio.

## 2. Las claves

Las tres claves del salón se eligen antes de arrancar. Si alguna es débil, falta o es igual a otra, el servidor arranca y sirve la carta, pero el salón responde `503 NOT_CONFIGURED` y `/vincular` no acepta ninguna clave. El registro de arranque (`listening`) nombra las que faltan (`missing`) y las débiles (`weak`), nunca su valor.

| Variable | Requisito | Cómo generarla |
|---|---|---|
| `STAFF_PIN` | 8 caracteres o más (12 o más si son solo números). Nada de claves de fábrica (1234, 0000, password, admin, verdel, changeme), un mismo carácter repetido ni escaleras como 12345678 o abcdefgh | La elige el encargado. Tiene que poder dictarla a las mozas |
| `SETUP_KEY` | 16 caracteres o más | `openssl rand -hex 16` |
| `SESSION_SECRET` | 32 caracteres o más | `openssl rand -hex 32` |

Las tres tienen que ser distintas. Qué hace cada una y cómo se cambia: [`seguridad/respuesta-a-incidentes.md`](seguridad/respuesta-a-incidentes.md).

## 3. El servidor

Hace falta Node 22 o más nuevo y una carpeta de datos que sobreviva a un reinicio. Todo el estado es `events.jsonl`: si se pierde esa carpeta, se pierden la noche y todas las anteriores.

### En Railway

1. Nuevo proyecto desde el repo.
2. **Volumen, obligatorio.** Agregá un volumen al servicio, montado en `/data`, y poné `DATA_DIR=/data`. Sin volumen, el disco del servicio se borra en cada despliegue: el registro de pedidos, los grupos vinculados y los reportes desaparecen sin aviso.
3. Variables: todas las del `.env.example`, con `HOST` vacío, `TRUST_PROXY=true` (Railway agrega `X-Forwarded-For` con la dirección del celular) y las tres claves de la sección 2.
4. «Generate Domain», o el dominio propio con su registro CNAME.
5. Revisá que la línea `listening` del registro no nombre variables en `missing` ni en `weak`, y que `/api/health` diga `ready: true`.

El respaldo en Railway es el del volumen: la pestaña Backups del volumen, según el plan. Activalo con una copia diaria y probá una restauración (sección 6) antes de abrir.

### En un servidor propio

```bash
git clone <repo> /opt/verdel/app
sudo bash /opt/verdel/app/deploy/install.sh /opt/verdel verdel 3005
sudo nano /opt/verdel/.env
sudo systemctl restart verdel
curl -s http://127.0.0.1:3005/api/health
```

El instalador recibe la carpeta, el usuario del servicio y el puerto; no tiene nada del boliche escrito adentro. Hace esto:

- Crea `/opt/verdel/.env` desde `.env.example` (solo la primera vez), legible solo por el usuario del servicio, con `DATA_DIR=/opt/verdel/data`, `TRUST_PROXY=true` y `SETUP_KEY` y `SESSION_SECRET` al azar. Falta que completes `TELEGRAM_BOT_TOKEN` y `STAFF_PIN`.
- Deja `HOST=127.0.0.1` siempre, también al volver a correrlo: el servidor solo atiende al proxy de la misma máquina.
- Instala la unidad de systemd endurecida: sin root ni capacidades, sistema de archivos de solo lectura salvo la carpeta de datos, sin ver `/home` ni `/root`. Por eso la carpeta y Node tienen que estar fuera de `/home` y `/root`, y el puerto tiene que ser 1024 o más.
- Instala el respaldo diario (sección 5).

#### Firewall

Solo quedan abiertos el 80 y el 443. SSH entra únicamente por la red privada (Tailscale), nunca por la dirección pública:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 80,443/tcp
sudo ufw allow in on tailscale0 to any port 22 proto tcp
sudo ufw enable
sudo ufw status verbose
```

Antes de `ufw enable`, probá entrar por SSH a la dirección de Tailscale desde otra terminal: si no anda, el firewall te deja afuera. Después, en `/etc/ssh/sshd_config`, `PasswordAuthentication no` y `PermitRootLogin no`, y `sudo systemctl reload ssh`.

#### nginx

En un bar todos los celulares (clientes y mozas) salen a internet por la misma dirección pública. Por eso el freno de nginx es alto: está para cortar una inundación, no un salón lleno. Los topes finos los pone el servidor (2.000 pedidos por minuto por origen a la API y otros 2.000 a la carta; ver `docs/decisiones.md`).

`/etc/nginx/sites-available/verdel`:

```nginx
limit_req_zone $binary_remote_addr zone=verdel:10m rate=80r/s;

server {
  listen 80;
  server_name verdel.panelpro.tech;
  server_tokens off;
  client_max_body_size 16k;

  limit_req zone=verdel burst=1000 nodelay;
  limit_req_status 429;

  proxy_hide_header Strict-Transport-Security;
  proxy_hide_header X-Content-Type-Options;
  proxy_hide_header Referrer-Policy;
  proxy_hide_header X-Frame-Options;
  proxy_hide_header Cross-Origin-Opener-Policy;
  proxy_hide_header Permissions-Policy;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "no-referrer" always;
  add_header X-Frame-Options "DENY" always;
  add_header Cross-Origin-Opener-Policy "same-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;

  location / {
    proxy_pass http://127.0.0.1:3005;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_read_timeout 35s;
  }
}
```

- 80 por segundo con 1.000 de margen son unos 4.800 por minuto por dirección: más que la suma de los dos topes del servidor, así nginx nunca corta antes que él.
- `X-Forwarded-For` lleva solo `$remote_addr`: el servidor toma la primera dirección, y si nginx sumara la que manda el celular, cualquiera podría elegir su origen.
- Los encabezados son los mismos que pone el servidor. nginx los oculta y los vuelve a poner con `always` para que también salgan en sus propios errores (502 si el servidor está caído, 413, 429). La política de contenido (CSP) la pone solo el servidor, porque es distinta para páginas y archivos y dos CSP se suman: no la agregues en nginx.
- `client_max_body_size 16k`: el servidor no acepta cuerpos de más de 4 KB.

```bash
sudo ln -s /etc/nginx/sites-available/verdel /etc/nginx/sites-enabled/verdel
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d verdel.panelpro.tech
```

certbot agrega el 443 y la redirección desde el 80.

#### Cloudflare delante

1. Pasá el dominio a Cloudflare y dejá el registro del servidor con la nube naranja (proxied): la dirección pública del servidor deja de verse.
2. SSL/TLS en **Full (strict)**: Cloudflare habla con nginx por HTTPS y valida el certificado de certbot.
3. Con Cloudflare delante, nginx ve la dirección de Cloudflare y no la del bar. Para que vea la del celular, confiá en `CF-Connecting-IP` solo cuando el pedido viene de un rango de Cloudflare:

```bash
{
  for range in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
    echo "set_real_ip_from $range;"
  done
  echo "real_ip_header CF-Connecting-IP;"
} | sudo tee /etc/nginx/conf.d/cloudflare-real-ip.conf
sudo nginx -t && sudo systemctl reload nginx
```

Así `$remote_addr` (y con él el freno de nginx y los topes del servidor) vuelve a ser la dirección del bar. Los rangos cambian pocas veces: volvé a correrlo si Cloudflare avisa.

4. Si la dirección del servidor estuvo publicada antes de pasar a Cloudflare, se puede seguir llegando salteándolo; nginx y el servidor frenan igual, pero si querés cerrarlo del todo, cambiá la dirección del servidor.

### El asistente (opcional)

Con `ANTHROPIC_API_KEY` cargada, `/cierre` suma un párrafo que cuenta la noche. Sin la clave todo funciona igual que antes. `ADVISOR_MODEL` elige el modelo (por defecto `claude-fable-5-2`), `ANTHROPIC_API_BASE` solo se cambia para pruebas y `ADVISOR_NIGHT_LIMIT` pone un tope de consultas por noche. `curl -s …/config.js` dice `suggestions: true` cuando está andando.

## 4. Vincular los grupos (una vez, desde Telegram)

En cada grupo, con la clave de `SETUP_KEY` y el bot que le corresponde:

- Salón: `/vincular salon CLAVE`
- Cocina del otro bar: `/vincular pizzas CLAVE`
- Cocina de Verdel: `/vincular cocina CLAVE`
- Dueño: `/vincular dueno CLAVE`

El bot borra el mensaje con la clave si es administrador del grupo. `/estado` muestra qué quedó vinculado. En un servidor propio, la clave la leés con `sudo grep ^SETUP_KEY= /opt/verdel/.env`.

## 5. El respaldo

### En el servidor

El instalador deja `verdel-backup.timer`, que todos los días a las 12:00 UTC (9:00 en Argentina, con el bar cerrado) corre `deploy/backup.sh`:

- Copia `events.jsonl` y la carpeta `reports` a `/var/backups/verdel/respaldo-AAAA-MM-DD.tar.gz`.
- Si en ese momento se estaba escribiendo una línea, la deja afuera: el servidor no arranca con una línea cortada.
- Revisa que el archivo se pueda abrir antes de darlo por bueno y borra los de más de 30 días.

```bash
systemctl list-timers verdel-backup.timer
sudo systemctl start verdel-backup.service
journalctl -u verdel-backup.service -n 20
ls -l /var/backups/verdel
```

### Fuera del servidor

Un respaldo que vive en el mismo disco se pierde con el disco o con un intruso. La copia la trae otra máquina (la de la oficina, una Mac, otro servidor), así el servidor no guarda ninguna clave para entrar a otro lado:

1. En la otra máquina, una clave SSH solo para esto, y su parte pública en el servidor, en un usuario que esté en el grupo `verdel` (los respaldos son legibles por ese grupo).
2. Por Tailscale, todos los días después de las 12:30 UTC:

```bash
rsync -a --ignore-existing respaldos@servidor:/var/backups/verdel/ ~/respaldos-verdel/
```

`--ignore-existing` no pisa un respaldo bueno con uno nuevo si el servidor fuera tocado. En una Mac o en Linux va en `crontab -e`, por ejemplo `45 12 * * *` con el reloj en UTC (`45 9 * * *` con el reloj en hora de Argentina). Esa carpeta no se borra sola: limpiala a mano cada tanto, o dejala crecer (pesa poco).

En Railway, la copia de la pestaña Backups vive en Railway. Si querés una fuera, bajá `events.jsonl` y `reports` del volumen y guardalos igual que arriba.

## 6. Probar una restauración

Probala antes de abrir y después una vez por mes. Un respaldo que nunca se restauró no se sabe si sirve.

En otra máquina, con el repo clonado y **sin** tokens de Telegram (si arranca con el token real, le saca los mensajes al bot de producción):

```bash
mkdir ~/prueba-restauracion-AAAA-MM-DD
tar -xzf ~/respaldos-verdel/respaldo-AAAA-MM-DD.tar.gz -C ~/prueba-restauracion-AAAA-MM-DD
wc -l ~/prueba-restauracion-AAAA-MM-DD/events.jsonl
tail -n 1 ~/prueba-restauracion-AAAA-MM-DD/events.jsonl
DATA_DIR=~/prueba-restauracion-AAAA-MM-DD PORT=3999 HOST=127.0.0.1 node server/main.js
```

En otra terminal:

```bash
curl -s http://127.0.0.1:3999/api/health
```

Está bien si:

- `/api/health` responde `{"ok":true,...}` (con `ready: false` es lo esperado: no tiene claves).
- El `sequence` de la última línea es igual a la cantidad de líneas que contó `wc -l`.
- La última línea es de la noche anterior.
- En `reports` están los cierres de las noches que esperás.

### Restaurar de verdad

En el servidor propio, con el bar cerrado:

```bash
sudo systemctl stop verdel
sudo mv /opt/verdel/data/events.jsonl /opt/verdel/data/events.jsonl.antes-AAAA-MM-DD
sudo -u verdel tar -xzf /var/backups/verdel/respaldo-AAAA-MM-DD.tar.gz -C /opt/verdel/data
sudo systemctl start verdel
curl -s http://127.0.0.1:3005/api/health
```

Todo lo que pasó después del respaldo se pierde: el archivo viejo queda al lado para revisarlo. Los grupos vinculados vuelven tal como estaban en el respaldo; si alguno cambió después, `/vincular` de nuevo.

## 7. Los QR de las mesas

Abrí `mesas.html` en la dirección definitiva de la carta, la que sirve el servidor, y tocá «Imprimir». Para generarlos desde otra dirección: `mesas.html?base=https://verdel.panelpro.tech/`. `?base=` solo acepta el origen de la propia página o uno de `allowedQrOrigins` en `config.js` (el servidor pone ahí `ALLOWED_ORIGINS`); cualquier otro se ignora y la página lo avisa. Imprimilos recién cuando la dirección sea la definitiva: el QR impreso apunta ahí.

## 8. Probar antes de abrir

1. Escaneá el QR de una mesa, armá un pedido y tocá «Confirmar con la moza».
2. Con otro celular escaneá el código, poné nombre y PIN, y confirmá.
3. Revisá que llegue a Salón, a cada cocina lo suyo y a Dueño.
4. Tocá «Listo» en una cocina y «Cobrado en caja» en Salón.
5. `/cierre` en Salón: el reporte llega al grupo Dueño.
6. Corré el respaldo a mano (sección 5) y la prueba de restauración (sección 6).

## Mientras no haya servidor

La copia en GitHub Pages publica **solo la carta**: el cliente la ve y arma el pedido, pero no sale a Telegram. Las pantallas del personal (`moza.html`, `mesas.html` y sus scripts) no se publican ahí, así que el código que muestra la carta en Pages no abre la pantalla de la moza: esa pantalla y los QR de las mesas los sirve solo el servidor. `web/config.js` trae `apiBase: null`; cuando la carta la sirve el servidor, esa configuración la entrega él.
