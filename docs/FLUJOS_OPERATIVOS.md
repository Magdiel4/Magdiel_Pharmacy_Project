# Artículos, compras, existencias y clientes

Actualización del 13 de octubre de 2026. Se adapta el flujo de Dynamics 365 a Farmacias Alvarado; no es una integración con Microsoft ni una implementación completa de su contabilidad.

**Actualización posterior:** consulta [Grupos y proveedores](GRUPOS_Y_PROVEEDORES.md). Tipo pasó a Grupo de artículos; los códigos son automáticos; Proveedores reemplaza el texto libre; Creado reemplaza Borrador y permite eliminar la orden; la captura de líneas es un único recuadro con lista inferior. Las descripciones del primer flujo a continuación se conservan como contexto de la migración 004.

## Recorrido de una compra

1. **Artículos → Nuevo artículo.** El administrador define código único, nombre, tipo (Medicamento, Suministro o Equipo), categoría, costo de referencia, precio y mínimo. Desmarca Controla vencimiento para equipos sin caducidad. Habilitado para venta requiere un precio mayor que cero para poder generar pedidos.
2. **Órdenes de compra → Nueva orden de compra.** Selecciona sucursal receptora, proveedor y fecha prevista. Agrega uno o varios artículos activos del catálogo, cantidades y costos unitarios. Un artículo solo puede aparecer una vez por orden. El servidor calcula el subtotal sin impuestos.
3. **Ver orden → Confirmar orden.** La orden pasa de Borrador a Confirmada. Aún no modifica las existencias. El borrador no tiene edición de líneas: si necesitas corregirlo, cancélalo y crea otro.
4. **Inventario → Recibir inventario.** Elige una línea confirmada en Origen de la recepción. También puedes usar Ver orden → Recibir. El artículo y la sucursal quedan asociados a esa línea. Ingresa lote, cantidad, comprobante y vencimiento si corresponde.
5. Una recepción parcial deja saldo pendiente; la última recepción de todas las líneas marca la orden como Recibida. Se conservan comprobante, usuario, lote y fecha. No admite cantidades superiores al saldo ni repetir un comprobante en la misma línea. Para dividir un comprobante entre varios lotes, identifica cada recepción con un sufijo de lote.
6. **Cancelar pendiente** cierra lo que aún falta recibir. Conserva las recepciones, el inventario y la auditoría. Las órdenes recibidas o canceladas no admiten recepciones nuevas.

La recepción directa sigue disponible para saldos iniciales y otras entradas; también exige un artículo registrado y activo. El proveedor se registra como texto en la orden. No se incluyeron maestro de proveedores, aprobación por niveles, facturas, impuestos, cuentas por pagar ni pagos bancarios.

## Inventario y traslados

La pantalla inicia en **Por artículo y sucursal**: código, artículo, sucursal, existencia física, reservado, vencido, disponible y cantidad de lotes. Disponible suma existencia menos reservas de los lotes no vencidos. Un artículo inactivo conserva sus existencias e historial, pero no admite nuevas compras, recepciones directas ni pedidos.

**Ver lotes / trasladar** abre los lotes del artículo y la sucursal seleccionados. Elige **Trasladar**, destino, cantidad y referencia. El envío descuenta el origen; en **Traslados → Recibir** el destino confirma y aumenta su inventario una sola vez. Se mantiene artículo, lote y vencimiento. No se usa el nombre del medicamento para relacionar registros.

Las fotografías se consultan o adjuntan en **Detalle por lote y fotografías**. El traslado no copia automáticamente la imagen al lote de destino. Los equipos sin fecha de caducidad admiten recepción y traslado; los medicamentos configurados con control de vencimiento exigen fecha. El control de vencimiento no se puede cambiar cuando ya existen lotes del artículo.

## Activos fijos

**Nuevo activo** exige seleccionar un artículo activo del catálogo; el código patrimonial del activo es distinto del código de artículo. Se conservan costo, fecha, depreciación estimada y fotografía del activo. El artículo de un activo ya registrado no se puede cambiar.

El alta patrimonial es manual y no disminuye existencias ni capitaliza automáticamente una recepción. Definir esa integración contable, junto con la factura del proveedor, corresponde a una ampliación posterior.

## Clientes, pedidos y entregas

1. **Clientes → Nuevo cliente:** código, nombre, teléfono, correo opcional, dirección, latitud y longitud.
2. Usa **Crear pedido** en la fila del cliente, o selecciónalo en **Pedidos y entregas → Nuevo pedido**. Se precargan las coordenadas y dirección; pueden ajustarse para esa entrega.
3. Selecciona un artículo activo habilitado para venta, ingresa su cantidad y consulta disponibilidad. Pulsa **Agregar línea** y repite para los demás artículos. La consulta incluye todas las líneas y muestra sucursales, existencias, precio, distancia y ETA estimada. El pedido se entrega completo desde una sucursal; ver [PEDIDOS_MULTILINEA.md](PEDIDOS_MULTILINEA.md).
4. **Reservar y crear pedido** valida nuevamente stock y cobertura. Despachar y Entregar continúan el flujo existente. Entregar registra el ingreso; no cobra en una pasarela.

El pedido conserva una copia del nombre, teléfono y dirección utilizados, además de `customer_id`. Cambiar o desactivar al cliente no reescribe pedidos anteriores. Un cliente inactivo no admite nuevos pedidos. El directorio es compartido entre sucursales para atender a la misma persona en distintos puntos; los pedidos sí se restringen por sucursal.

## Ubicación de sucursales

**Sucursales → Ver ubicación** abre Google Maps en otra pestaña con las coordenadas guardadas. No requiere clave de Maps ni envía coordenadas hasta abrir el enlace. Si no hay coordenadas válidas muestra Sin coordenadas.

## Permisos

| Función | Administrador | Gerente | Cajero | Logística | Auditor | RR. HH. |
|---|---|---|---|---|---|---|
| Consultar Artículos | Sí | Sí | Sí | Sí | Sí | No |
| Crear/editar Artículos | Sí | No | No | No | No | No |
| Consultar compras | Sí | Sí | No | Sí | Sí | No |
| Crear/confirmar/cancelar compras | Sí | Sí | No | No | No | No |
| Recibir inventario | Sí | Sí | No | No | No | No |
| Consultar Clientes | Sí | Sí | Sí | Sí | Sí | No |
| Crear/editar Clientes | Sí | Sí | Sí | No | No | No |

Las operaciones por sucursal respetan una, varias o todas las sucursales del perfil. Auditor mantiene acceso de solo lectura.

## Base de datos y actualización

Ejecuta `npm run db:migrate` en otras instalaciones y reinicia con `npm run dev`. En el proyecto original la migración 004 ya fue aplicada. No ejecutes seed sobre datos reales.

- El catálogo reutiliza `pharmacy.products`; `sku` es el código de artículo y `id` la relación estable. Se agregan `kind`, `active`, `saleable`, `expiration_required`.
- Nuevas tablas: `customers`, `purchase_orders`, `purchase_order_lines`, `purchase_receipts`, en el esquema `pharmacy` del Table Editor.
- `assets.product_id` y `orders.customer_id` son obligatorios con claves foráneas. Para activos históricos se generó un artículo `ACT-<UUID del activo>`. Para cada pedido histórico se creó un cliente `CLI-<UUID del pedido>`; no se fusionaron personas por coincidencia de nombre.
- Las recepciones de compra son inmutables. Recepción, saldo pendiente, existencias, libro y auditoría se confirman en una sola transacción. Las tablas nuevas tienen RLS y no permiten acceso directo mediante la clave pública.
- El modo demo actualiza en memoria el formato del JSON anterior y lo guarda en la siguiente operación. La copia independiente Farma_Alvar_Demo no se modifica.

## Referencias de Microsoft y Google

- [Crear una orden de compra](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/tasks/create-purchase-order): cabecera y líneas asociadas a artículos.
- [Recepción de productos contra órdenes de compra](https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/product-receipt-against-purchase-orders): separación entre pedido y recepción física.
- [Existencias disponibles](https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/inventory-on-hand-list): consulta agregada por dimensiones de inventario; aquí se usa sucursal y artículo con detalle de lote.
- [Crear pedidos de venta](https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/tasks/create-sales-orders): cliente y artículos como datos maestros.
- [Integración de activos fijos](https://learn.microsoft.com/en-us/dynamics365/finance/fixed-assets/fixed-asset-integration): referencia para una futura integración contable más amplia.
- [Maps URLs](https://developers.google.com/maps/architecture/maps-url): enlaces de ubicación.
