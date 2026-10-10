# API interna

Base `/api`. JSON UTF-8. Todas las rutas excepto health/login/logout requieren cookie `fa_session` o Bearer token validado por Supabase. Nunca enviar tokens o contraseñas en la URL. Los errores devuelven `{ "error": "mensaje", "fields": [] }` cuando hay detalles de validación.

| Método | Ruta | Función |
|---|---|---|
| GET | /health | Estado del proceso y modo |
| POST | /auth/login | `{email,password}`; crea cookie de sesión |
| POST | /auth/logout | Elimina cookie; invalida sesión demo |
| GET | /bootstrap | Usuario, módulos y datos permitidos según alcance |
| POST | /records/:entity | Crear branches/products/employees/assets |
| PUT | /records/:entity/:id | Editar registro completo; auditoría de antes/después |
| POST | /users | Solo administrador: crea Auth y perfil; `{name,email,password,role,branch_ids,active}`; responde 201 con el perfil y su UID |
| PUT | /users | Crear/actualizar perfil de usuario Auth existente |
| POST | /inventory/receive | Recibir lote |
| POST | /transfers | Enviar traslado |
| POST | /transfers/:id/receive | Confirmar recepción |
| POST | /cash | Registrar ingreso/egreso |
| POST | /payroll | Preparar nómina |
| POST | /payroll/:id/pay | Registrar pago con `{reference}` |
| POST | /orders/quote | Consultar stock, precio y ETA |
| POST | /orders | Crear pedido y reservar |
| PATCH | /orders/:id/status | `{status}`: En ruta, Entregado, Cancelado |

Los esquemas exactos están en `server/src/models/schemas.js`. UUID se valida para referencias, montos usan dos decimales y cantidades son enteros positivos. Los importes sensibles se recalculan en el servidor.

Ejemplo de cotización:

```json
{
  "product_id": "UUID-del-medicamento",
  "quantity": 2,
  "latitude": 14.6,
  "longitude": -90.51
}
```

Devuelve sucursales ordenadas por disponibilidad/cercanía con `can_deliver`, `available`, `distance_km`, `eta_minutes`, `total` y `prescription`. La cotización **no reserva**. El endpoint de creación vuelve a validar stock bajo bloqueo y puede devolver 409 si cambió.

Las integraciones deben tolerar 400 (validación), 401 (sesión), 403 (permisos), 404 (no existe), 409 (conflicto) y 429 (límite). No reintentar automáticamente operaciones de creación sin una estrategia de idempotencia. Los estados de entrega y pago evitan duplicar su efecto; crear un segundo pedido nuevo sigue siendo una operación independiente.

## Acceso por sucursales y eliminación

En POST /users y PUT /users, `branch_ids` es obligatorio: `null` representa Todas las sucursales, y una lista no vacía de UUID permite una o varias. No se acepta una lista vacía ni omitir el campo. El servidor verifica cada sucursal. Todos los módulos y la nómina respetan ese alcance.

`DELETE /users/:id` requiere administrador activo y rechaza eliminar su propio UID con 403. Primero bloquea el acceso, realiza la baja irreversible de Supabase Auth y marca el perfil eliminado. Se conservan las referencias de auditoría y movimientos; el perfil desaparece de Usuarios y roles. Si Supabase falla, permanece inactivo con eliminación pendiente y se puede reintentar. No permite reactivar un perfil eliminado o pendiente.

Aplicar `npm run db:migrate` para añadir los campos de la migración 002 antes de desplegar esta versión. Las cuentas existentes conservan el alcance que tenían.
