# Grupos de artículos, proveedores y compras

Actualización del 13/10/2026 sobre el proyecto original.

## Artículos

El campo anterior Tipo ahora se llama **Grupo de artículos**. Hay tres grupos: Medicamentos (`MED`), Suministros (`SUM`) y Activos (`ACT`). Al guardar se asigna el siguiente código, con al menos tres dígitos: `MED-001`, `SUM-001`, `ACT-001`; después de 999 continúa 1000.

El código no se escribe manualmente. Editar el nombre o precio lo conserva. Cambiar de grupo asigna el siguiente código del nuevo grupo, conservando el UUID y las relaciones con lotes y activos. Los números asignados a otros artículos no se reutilizan. PostgreSQL serializa cada secuencia dentro de la transacción; un fallo completo revierte tanto el artículo como su contador.

La migración 005 normalizó los códigos existentes ordenando por fecha de creación y UUID dentro del grupo. Conservó el código anterior en `products.previous_sku`, las fotografías y todas las relaciones. No fue necesario eliminar artículos. Las líneas históricas de compras conservan el código y nombre registrados en ese momento.

## Proveedores

Administrador y gerente pueden crear y editar; auditor y logística pueden consultar. El directorio es compartido entre sucursales.

Campos: Cuenta de proveedor, Nombre, Tipo de proveedor (Laboratorio, Distribuidor, Fabricante, Servicios u Otro), Descripción, NIT, Dirección, Correo electrónico, Teléfono y Activo. Cuenta, nombre, tipo y NIT son obligatorios. Cuenta y NIT son únicos; la cuenta se normaliza a mayúsculas y el NIT elimina espacios/guiones. Se valida el formato básico del NIT, no su existencia ante SAT.

Los nombres de proveedores de compras antiguas se conservaron como registros inactivos con cuenta `LEG-…` y estado **Pendiente de completar**. No se inventaron NIT. Edita el proveedor, completa el NIT y actívalo antes de usarlo en nuevas compras o confirmar compras creadas previamente. Las compras conservan el nombre histórico del proveedor aunque luego se edite su catálogo.

## Órdenes de compra

1. Crea primero el proveedor en su módulo.
2. En Nueva orden de compra selecciona proveedor y sucursal receptora.
3. Captura artículo, cantidad y costo en el único recuadro **Agregar línea** y pulsa el botón del mismo nombre. La línea aparece en **Líneas agregadas**, debajo del recuadro, y la captura se limpia para el siguiente artículo. Puedes quitar una línea antes de guardar. No se permiten artículos repetidos ni más de 100 líneas.
4. **Crear orden** guarda el estado **Creado**, que sustituye a Borrador. Si queda un artículo pendiente en la captura, agrégalo antes de guardar.
5. Desde el listado puedes **Eliminar** únicamente órdenes en estado Creado, con confirmación. El servidor vuelve a validar estado, rol y sucursal bajo bloqueo. Se trata de una baja lógica: desaparecen la orden y sus líneas de la consulta operativa, mientras se conserva la trazabilidad. Una orden eliminada no se puede confirmar ni recibir. Las confirmadas, recibidas o canceladas no se eliminan.
6. Confirmar y recibir continúan el flujo anterior. Eliminar compite con confirmar bajo el mismo bloqueo para impedir estados inconsistentes.

## Traslados

Selecciona primero Sucursal de origen. Lote de origen solo ofrece lotes de esa sucursal con unidades disponibles y sin vencimiento cumplido. Cambiar el origen limpia el lote y la cantidad; si el destino coincide con el nuevo origen también se limpia. La API valida nuevamente la pertenencia del lote y la existencia bajo bloqueo. El registro del traslado y los movimientos mantienen origen, destino, artículo y lote.

## Departamentos de Guatemala

Sucursales usa un desplegable con los 22 departamentos. El servidor rechaza valores fuera de la lista. Fuente: [Instituto Nacional de Estadística](https://www.ine.gob.gt/perfil_estadistico/). Los registros anteriores no se reescriben; si alguno tenía un nombre no estándar, debe seleccionarse un departamento válido al editarlo.

## Actualización y verificación

En el proyecto original la migración 005 ya está aplicada. En otra instalación: `npm run db:migrate`, y luego reiniciar con `npm run dev`. No ejecutar seed en una base con datos reales. Docker incluye `shared/`, donde se definen grupos, tipos de proveedor y departamentos utilizados por React y Node.

Las pruebas automatizadas cubren códigos concurrentes, cambio de grupo, rollback, proveedores duplicados/inactivos, eliminación y confirmación simultáneas, alcance de sucursal y lote ajeno. `node server/scripts/verify-business-postgres.js` comprueba el flujo con PostgreSQL dentro de una transacción que revierte todos los registros de prueba.
