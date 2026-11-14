# Instalación

## 1. El bot (una vez, desde Telegram)

1. Hablale a @BotFather, mandá `/newbot`, elegí nombre y un usuario que termine en `bot`.
2. Guardá el token. Va solo en el `.env` del servidor: no se comparte por chat ni se sube al repo. Si se filtra, `/revoke` en @BotFather da uno nuevo.
3. Si una cocina es de otro bar, creale su propio bot con `/newbot` y cargá el token en `PIZZAS_BOT_TOKEN` o `HOUSE_BOT_TOKEN`.
4. Creá los grupos: **Salón** (mozos y encargado) y **Dueño** con el bot principal, y cada cocina (**Cocina de pizzas y empanadas**, **Cocina de Verdel**) con su bot, o con el principal si no tiene uno propio.

## 2. El servidor

Hace falta Node 22 o más nuevo y una carpeta de datos que sobreviva a un reinicio.

### En un servidor propio (VPS)

```bash
git clone <repo> /opt/verdel/app
sudo bash /opt/verdel/app/deploy/install.sh /opt/verdel verdel 3005
sudo nano /opt/verdel/.env
sudo systemctl restart verdel
curl -s http://127.0.0.1:3005/api/health
```

El instalador recibe la carpeta, el usuario del servicio y el puerto; no tiene nada del boliche escrito adentro. Después se apunta el dominio al puerto con el proxy que ya use el servidor. Con nginx:

```nginx
server {
  server_name verdel.panelpro.tech;
  location / {
    proxy_pass http://127.0.0.1:3005;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

Con un proxy propio delante, `TRUST_PROXY=true`.

### En Railway

Nuevo proyecto desde el repo, variables del `.env.example`, un volumen montado en `/data` con `DATA_DIR=/data`, y «Generate Domain».

## 3. Vincular los grupos (una vez, desde Telegram)

En cada grupo, con la clave de `SETUP_KEY` y el bot que le corresponde:

- Salón: `/vincular salon CLAVE`
- Cocina del otro bar: `/vincular pizzas CLAVE`
- Cocina de Verdel: `/vincular cocina CLAVE`
- Dueño: `/vincular dueno CLAVE`

El bot borra el mensaje con la clave si es administrador del grupo. `/estado` muestra qué quedó vinculado.

## 4. Los QR de las mesas

Abrí `mesas.html` en la dirección definitiva de la carta y tocá «Imprimir». Para generarlos desde otra dirección: `mesas.html?base=https://verdel.panelpro.tech/`. Imprimilos recién cuando la dirección sea la definitiva: el QR impreso apunta ahí.

## 5. Probar antes de abrir

1. Escaneá el QR de una mesa, armá un pedido y tocá «Confirmar con la moza».
2. Con otro celular escaneá el código, poné nombre y PIN, y confirmá.
3. Revisá que llegue a Salón, a cada cocina lo suyo y a Dueño.
4. Tocá «Listo» en una cocina y «Cobrado en caja» en Salón.
5. `/cierre` en Salón: el reporte llega al grupo Dueño.

## Mientras no haya servidor

La carta funciona sola como sitio estático (GitHub Pages): el cliente arma el pedido y la moza lo ve al escanear el código, pero no sale a Telegram. `web/config.js` trae `apiBase: null`; cuando la carta la sirve el servidor, esa configuración la entrega él.
