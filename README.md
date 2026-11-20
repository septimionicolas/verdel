# Verdel

Carta digital de la cervecería Verdel con pedido por QR.

1. El cliente escanea el QR de su mesa, arma el pedido y la carta le muestra un código.
2. La moza escanea ese código con su celular y lo confirma.
3. El pedido llega al grupo de Telegram del salón; las pizzas y empanadas, a la cocina del otro bar; el resto de la comida, a la cocina de la casa.
4. Cada cocina toca «Listo» y el salón recibe el aviso. El salón marca «Cobrado en caja» cuando cobra en el sistema del bar.
5. Con `/cierre` el bot arma el reporte de la noche y se lo manda al dueño.

El sistema no cobra ni maneja plata: solo registra.

Todo el estado vive en `DATA_DIR/events.jsonl`: en Railway va en un volumen, y en un servidor propio `deploy/install.sh` deja un respaldo diario. GitHub Pages publica solo la carta; las pantallas del personal las sirve el servidor.

- Reglas del repo y cómo correrlo: [`AGENTS.md`](AGENTS.md)
- Instalación paso a paso, con Railway, servidor propio, respaldo y restauración: [`docs/instalacion.md`](docs/instalacion.md)
- Si se filtra una clave, alguien entró o alguien se va: [`docs/seguridad/respuesta-a-incidentes.md`](docs/seguridad/respuesta-a-incidentes.md)
- Decisiones tomadas y valores de fábrica: [`docs/decisiones.md`](docs/decisiones.md)
- Contrato de la API: [`docs/CONTRATO-API.md`](docs/CONTRATO-API.md)
