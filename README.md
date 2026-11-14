# Verdel

Carta digital de la cervecería Verdel con pedido por QR.

1. El cliente escanea el QR de su mesa, arma el pedido y la carta le muestra un código.
2. La moza escanea ese código con su celular y lo confirma.
3. El pedido llega al grupo de Telegram del salón; las pizzas y empanadas, a la cocina del otro bar; el resto de la comida, a la cocina de la casa.
4. Cada cocina toca «Listo» y el salón recibe el aviso. El salón marca «Cobrado en caja» cuando cobra en el sistema del bar.
5. Con `/cierre` el bot arma el reporte de la noche y se lo manda al dueño.

El sistema no cobra ni maneja plata: solo registra.

- Reglas del repo y cómo correrlo: [`AGENTS.md`](AGENTS.md)
- Instalación paso a paso: [`docs/instalacion.md`](docs/instalacion.md)
- Decisiones tomadas y valores de fábrica: [`docs/decisiones.md`](docs/decisiones.md)
- Contrato de la API: [`docs/CONTRATO-API.md`](docs/CONTRATO-API.md)
