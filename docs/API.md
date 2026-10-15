# API interna

Base `/api`. JSON UTF-8. Todas las rutas excepto health/login/logout requieren cookie `fa_session` o Bearer token validado por Supabase. Nunca enviar tokens o contraseñas en la URL. Los errores devuelven `{ "error": "mensaje", "fields": [] }` cuando hay detalles de validación.

| Método | Ruta | Función |
|---|---|---|
| GET | /health | Estado del proceso y modo |
| POST | /auth/login | `{email,password}`; crea cookie de sesión |
| POST | /auth/logout | Elimina cookie; invalida sesión demo |
| GET | /bootstrap | Usuario, módulos y datos permitidos según alcance |
| POST | /records/:entity | Crear branches/products/employees/assets/customers/suppliers |
| PUT | /records/:entity/:id | Editar registro completo; auditoría de antes/después |
| POST | /users | Solo administrador: crea Auth y perfil; `{name,email,password,role,branch_ids,active}`; responde 201 con el perfil y su UID |
| PUT | /users | Crear/actualizar perfil de usuario Auth existente |
| POST | /inventory/receive | Recibir lote; purchase_line_id opcional vincula la recepción a una compra |
| POST | /purchases | Crear orden en estado Creado con supplier_id, sucursal y líneas del catálogo |
| DELETE | /purchases/:id | Baja lógica solo en estado Creado; exige administrador o gerente y alcance de sucursal |
| PATCH | /purchases/:id/status | Confirmada o Cancelada; los estados de recepción se calculan |
| POST | /transfers | Enviar traslado |
| POST | /transfers/:id/receive | Confirmar recepción |
| POST | /cash | Registrar ingreso/egreso |
| POST | /payroll | Preparar nómina |
| POST | /payroll/:id/pay | Registrar pago con `{reference}` |
| POST | /orders/quote | Consultar stock por línea, precio total y ETA para el pedido completo |
| POST | /orders | Crear un pedido con customer_id y lines; reservar todas sus líneas atómicamente |
| PATCH | /orders/:id/status | `{status}`: En ruta, Entregado, Cancelado |

Los esquemas exactos están en `server/src/models/schemas.js`. UUID se valida para referencias, montos usan dos decimales y cantidades son enteros positivos. Los importes sensibles se recalculan en el servidor.

Desde la migración 005, products recibe `article_group` (Medicamentos, Suministros o Activos) y no acepta `sku` ni `kind`: el código se asigna en el servidor. PUT mantiene el código salvo cambio de grupo. Compras exige `supplier_id`; `supplier` es una copia histórica del nombre que calcula el servidor. Proveedores requiere `account`, `name`, `supplier_type` y `nit`; acepta `description`, `address`, `email`, `phone`, `active`. El bootstrap excluye órdenes eliminadas y sus líneas. Ver `docs/GRUPOS_Y_PROVEEDORES.md`.

Ejemplo de cotización:

```json
{
  "lines": [
    { "product_id": "UUID-del-primer-articulo", "quantity": 2 },
    { "product_id": "UUID-del-segundo-articulo", "quantity": 3 }
  ],
  "latitude": 14.6,
  "longitude": -90.51
}
```

Devuelve sucursales ordenadas por disponibilidad/cercanía con `can_deliver`, `lines`, `distance_km`, `eta_minutes`, `total` y `prescription`. Cada línea incluye código, nombre, cantidad solicitada, `available`, `sufficient`, precio unitario y subtotal. `can_deliver` exige stock suficiente para **todas** las líneas en la misma sucursal y cobertura de hasta 30 km. La cotización **no reserva**. El endpoint de creación vuelve a validar stock bajo bloqueos ordenados por artículo y puede devolver 409 si cambió; cualquier fallo revierte el pedido completo.

Desde la migración 006, POST /orders recibe `customer_id`, `branch_id`, `address`, `latitude`, `longitude`, `payment_method`, `prescription_verified` y `lines` (1–100 artículos diferentes, cantidades enteras de 1 a 1,000,000). Los precios se obtienen del catálogo en el servidor. La respuesta incluye la cabecera y `lines`. Se mantiene la entrada anterior `product_id` + `quantity` para integraciones de una línea; no mezclar ambos formatos.

`pharmacy.order_lines` conserva código, nombre, precio y subtotal al crear el pedido. `order_allocations.order_line_id` relaciona cada reserva con su línea. Bootstrap devuelve `order_lines` con el mismo alcance por sucursal que `orders`. En la cabecera, `quantity` suma las unidades; `product_id` es nulo para pedidos de varios artículos y se conserva para los de uno solo. En cotizaciones `available` solo se informa para una línea; consultar `lines[].available` en pedidos de varias líneas. Entregar descuenta todas las reservas y registra un único ingreso por el total; cancelar libera todas las reservas sin cobro.

Las integraciones deben tolerar 400 (validación), 401 (sesión), 403 (permisos), 404 (no existe), 409 (conflicto) y 429 (límite). No reintentar automáticamente operaciones de creación sin una estrategia de idempotencia. Los estados de entrega y pago evitan duplicar su efecto; crear un segundo pedido nuevo sigue siendo una operación independiente.

## Acceso por sucursales y eliminación

En POST /users y PUT /users, `branch_ids` es obligatorio: `null` representa Todas las sucursales, y una lista no vacía de UUID permite una o varias. No se acepta una lista vacía ni omitir el campo. El servidor verifica cada sucursal. Todos los módulos y la nómina respetan ese alcance.

`DELETE /users/:id` requiere administrador activo y rechaza eliminar su propio UID con 403. Primero bloquea el acceso, realiza la baja irreversible de Supabase Auth y marca el perfil eliminado. Se conservan las referencias de auditoría y movimientos; el perfil desaparece de Usuarios y roles. Si Supabase falla, permanece inactivo con eliminación pendiente y se puede reintentar. No permite reactivar un perfil eliminado o pendiente.

Aplicar `npm run db:migrate` para añadir los campos de la migración 002 antes de desplegar esta versión. Las cuentas existentes conservan el alcance que tenían.

## Fotografías de inventario y activos

Aplicar la migración `003_record_images.sql` con `npm run db:migrate` antes de iniciar esta versión en otra instalación.

| Método | Ruta | Función |
|---|---|---|
| GET | /images/:entity/:id | Devuelve bytes `image/webp`; requiere sesión y alcance de sucursal |
| PUT | /images/:entity/:id | Adjunta o reemplaza una imagen; cuerpo binario con Content-Type image/jpeg, image/png o image/webp |
| DELETE | /images/:entity/:id | Elimina la fotografía, conserva el registro y audita la operación |

`entity` admite únicamente `inventory` y `assets`. Administrador y gerente pueden modificar fotografías dentro de sus sucursales. Otros roles con acceso al módulo pueden verlas; auditor es de solo lectura. GET responde 404 si no existe fotografía y 403 si la sucursal está fuera del alcance. La carga admite hasta 5 MiB y 25 megapíxeles; excesos de bytes devuelven 413, archivos inválidos devuelven 400.

Las imágenes se decodifican y convierten a WebP (máximo 1600 × 1600, hasta 2 MiB almacenados). Se descartan metadatos EXIF. Se guardan en `image_data bytea` de la tabla correspondiente; `image_updated_at` registra la modificación. No se usa un bucket público. GET tiene `Cache-Control: no-store` y requiere autenticación incluso al abrir la URL directamente.

Los listados y respuestas CRUD incluyen `has_image` e `image_updated_at`, nunca los bytes. La auditoría registra la operación y el tamaño, sin duplicar imágenes. En inventario, cada foto corresponde a un lote en una sucursal; un traslado no copia automáticamente su foto al lote del destino.

Implementación de procesamiento: [documentación oficial de Sharp](https://sharp.pixelplumbing.com/api-constructor/).
