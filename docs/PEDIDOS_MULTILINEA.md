# Clientes y pedidos de varias líneas

En Clientes, **Ver ubicación** abre Google Maps en una pestaña nueva usando la latitud y longitud guardadas. Si faltan coordenadas válidas se muestra “Sin coordenadas”.

Para registrar un pedido desde Clientes o desde Pedidos y entregas:

1. Selecciona el cliente; desde Clientes ya viene seleccionado. Revisa dirección, coordenadas y forma de pago.
2. Selecciona un artículo y una cantidad en el recuadro de captura.
3. Pulsa **Consultar disponibilidad**. La consulta incluye los artículos ya agregados y la línea que estás capturando.
4. Pulsa **Agregar línea**; aparecerá en la tabla inferior y el recuadro quedará listo para el siguiente artículo.
5. Repite para cada artículo. Puedes quitar líneas; vuelve a consultar después de cualquier cambio.
6. Selecciona una sucursal que pueda entregar el pedido completo. Si corresponde, confirma que el personal autorizado verificó las recetas.
7. Pulsa **Reservar y crear pedido**. Se crea un único pedido del cliente en **Pedidos y entregas**; **Ver líneas** muestra cantidades, precios, subtotales y total.

Se admite hasta 100 artículos distintos. Las consultas excluyen inventario reservado o vencido y respetan el acceso del operador a sucursales. Se mantiene la cobertura estimada de 30 km y el cálculo orientativo de tiempo anterior. No se divide automáticamente un pedido entre varias sucursales.

Crear vuelve a comprobar stock y reserva todas las líneas en una transacción. Si un artículo quedó sin existencias, no se guarda ni reserva parcialmente el pedido. Los precios se calculan en el servidor; código, nombre y precio quedan conservados en el detalle. La entrega registra un solo ingreso y descuenta cada lote reservado; cancelar libera todas las reservas sin consumir unidades ni cobrar.

## Actualización técnica

La migración `006_customer_order_lines.sql` ya está aplicada en el proyecto configurado de Supabase. Agrega la tabla `pharmacy.order_lines` y `order_allocations.order_line_id`, y convierte los pedidos anteriores a una línea sin cambiar sus importes, estados ni reservas. La consulta **10 Pedidos con múltiples líneas** está guardada en el SQL Editor como referencia.

En otra instalación, ejecutar `npm run db:migrate` antes de iniciar esta versión. No ejecutar nuevamente la consulta guardada en el proyecto actual. La plantilla `supabase/seed.sql` sigue siendo compatible; no se insertaron nuevos datos ficticios permanentes en Supabase.

Reinicia la aplicación para cargar el backend actualizado: Ctrl+C en su terminal y `npm run dev` desde la raíz del proyecto. Para la versión compilada: `npm run build` y `npm start`.

## Verificación

- Las 58 pruebas existentes y las nueve nuevas pruebas de pedidos pasan.
- Compilación de producción correcta.
- PostgreSQL real: pedido de dos líneas, reservas relacionadas, entrega e ingreso único comprobados con ROLLBACK de todos los datos de prueba.
- Navegador con datos ficticios en memoria: ubicación del cliente, captura de dos artículos, creación desde Clientes y consulta del mismo pedido en Pedidos y entregas; sin errores de consola.
