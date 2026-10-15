# Verificación de la primera entrega

## Actualización: grupos, proveedores y captura de compras — 13/10/2026

- 58 pruebas automatizadas aprobadas. Se agregaron casos de secuencias concurrentes, cambio de grupo, códigos de más de tres dígitos, rollback de contador, cuenta/NIT únicos, proveedor activo, eliminación de Creado, carrera con confirmación, permisos, departamentos y lote ajeno a sucursal.
- Compilación de React/Vite completada; Dockerfile actualizado para incluir catálogos compartidos. No se ejecutó Docker en este equipo.
- Migración 005 aplicada en Supabase; prueba transaccional real de secuencias, proveedor, eliminación de orden creada y flujo hasta entrega completada con rollback final.
- Navegador con datos en memoria: proveedor nuevo seleccionable en compra, artículo Suministros con código SUM-001, dos líneas agregadas bajo el recuadro fijo, creación en estado Creado y diálogo Eliminar. La eliminación HTTP fue verificada por prueba automática.
- Selector de lotes comprobado: al cambiar Oakland por Pradera Xela cambian los lotes y la selección queda vacía. Desplegable de departamentos verificado. Consola sin errores.
- Consultas 08 y 09 guardadas en SQL Editor; la plantilla no se ejecutó en la base actual. Artículos existentes normalizados conservando UUID, historial, inventario y fotos.

## Actualización: catálogo, compras y clientes — 13/10/2026

- 50 pruebas automatizadas aprobadas: incluye compras con varias líneas, recepciones parciales, concurrencia, sobrerrecepción, comprobantes repetidos, permisos, clientes activos, rollback, artículos sin vencimiento, traslados y agrupación por artículo/sucursal.
- Compilación React/Vite completada y formato Prettier aplicado.
- Migración 004 aplicada en Supabase; referencias históricas de activos y pedidos verificadas sin valores nulos.
- `node server/scripts/verify-business-postgres.js`: catálogo, compra de dos líneas, recepción, traslado sin vencimiento, activo, cliente, reserva y entrega comprobados en PostgreSQL. Transacción revertida al finalizar; no quedaron datos ficticios de esta verificación.
- Prueba en navegador con un servidor temporal y datos exclusivamente en memoria: alta de artículo, compra de 5 unidades, recepción de 3, saldo pendiente de 2, traslado de 1 y existencias finales 2/1 por sucursal; alta de cliente y pedido con reserva. Sin errores de consola registrados.
- Enlaces Google Maps comprobados con coordenadas de las sucursales. Fotografías de inventario siguen en el detalle por lote.
- Consultas 06 (migración aplicada) y 07 (plantilla actualizada sin ejecutar) guardadas en SQL Editor. Enlaces en `SQL_EDITOR.md`.
- No se realizaron pagos reales, cambios de credenciales ni publicación en GitHub. La copia independiente Demo se conserva como estaba.

## Verificación inicial

Fecha local de trabajo: 7 de octubre de 2026, America/Guatemala.

- Compilación de React/Vite completada.
- Auditoría npm: cero vulnerabilidades después de retirar una dependencia de desarrollo afectada.
- Pruebas automatizadas: API, permisos, sesiones, reservas concurrentes, FEFO, vencimientos, cobertura, traslados, rollback, dinero, pagos y auditoría de edición.
- Conexión real a Supabase verificada con TLS, validación de certificado/hostname y CA de Supabase.
- 14 tablas verificadas con RLS en el esquema pharmacy (13 de negocio y una de migraciones).
- Reserva, despacho, entrega, caja, movimientos de stock y nómina probados contra PostgreSQL dentro de una transacción revertida. No quedaron pedidos ni pagos generados por esa verificación.
- Protección contra UPDATE en el libro de caja probada.
- Datos de prueba cargados; ejecución repetida del archivo seed.sql completada sin duplicados.
- Perfil del primer administrador asignado; el usuario confirmó que pudo entrar al sistema.
- SQL Editor: tres consultas guardadas y visibles después de recargar. El texto del script de inserciones se comparó con el contenido preparado y coincidió completo.
- Revisión visual de acceso y dashboard; vista de navegación adaptable a pantalla estrecha/escritorio.

Pendiente: Docker no está instalado/disponible en este equipo; no se ejecutó una construcción ni un arranque de contenedor. Tampoco se publicó un dominio ni se hicieron pruebas de carga, seguridad independiente, contabilidad normativa o aceptación con personal de sucursales. Consultar ARQUITECTURA.md antes de uso a escala nacional.
