# Consultas guardadas en Supabase

Proyecto: **Magdiel_Pharmacy_Project**. Esquema de datos: **pharmacy**.

**Versión actual:** migraciones 001 a 006 aplicadas. Para una instalación nueva de pruebas, la plantilla vigente es la consulta **09** (también compatible con 006); 02 y 07 son versiones históricas y no deben ejecutarse sobre la estructura actual.

- **10 Pedidos con múltiples líneas**: [consulta guardada](https://supabase.com/dashboard/project/sflyoepicizmvklfefaa/sql/d86f6abc-72d7-4059-bd86-2cd99fb201e1). Copia de `supabase/migrations/006_customer_order_lines.sql`, aplicada y verificada en PostgreSQL. Conserva pedidos anteriores, agrega `order_lines` y vincula reservas con cada línea. No volver a ejecutar.

- **08 Grupos, secuencias y proveedores**: [consulta guardada](https://supabase.com/dashboard/project/sflyoepicizmvklfefaa/sql/92cf0a70-aa8f-4fad-bb4a-3b193ce641c6). Copia de `supabase/migrations/005_article_sequences_suppliers.sql`, ya aplicada y verificada en PostgreSQL. No volver a ejecutar.
- **09 Plantilla con grupos y proveedores**: [consulta guardada](https://supabase.com/dashboard/project/sflyoepicizmvklfefaa/sql/b8d4b2b4-7e1d-4367-ba7b-f414a8e63b10). Copia vigente de `supabase/seed.sql`, con proveedor ficticio y contadores de artículos. Guardada sin ejecutar en la base actual.

Las consultas están guardadas en la sección **PRIVATE** del SQL Editor de la cuenta con la que se inició sesión. No se compartieron con otros usuarios del proyecto.

1. [Farmacias Alvarado · 01 Estructura y seguridad](https://supabase.com/dashboard/project/sflyoepicizmvklfefaa/sql/d3754cc0-3498-4f21-b0dc-ec04343a4fc8). Tablas, relaciones, índices, RLS, protección de libros y registro de la migración. Ya aplicado; ejecutar una sola vez en una base nueva.
2. [Farmacias Alvarado · 02 Datos de prueba](https://supabase.com/dashboard/project/sflyoepicizmvklfefaa/sql/5cfbbddf-13b7-44c6-8714-ea6dfe43c6b6). Inserciones de datos ficticios, con UUID conocidos y `ON CONFLICT (id) DO NOTHING`.
3. [Farmacias Alvarado · 03 Primer administrador](https://supabase.com/dashboard/project/sflyoepicizmvklfefaa/sql/8c71428e-4dd7-432a-9f6f-8fa510152192). Perfil del usuario creado por el propietario en Supabase Auth. No incluye credenciales.

Copias locales: `supabase/migrations/001_initial.sql`, `supabase/seed.sql` y `supabase/local/bootstrap-admin.sql`. La copia específica del administrador se excluye de Git; `supabase/bootstrap-admin.sql` es la plantilla reutilizable.

El script de estructura guardado en el editor contiene la misma migración envuelta en BEGIN/COMMIT y el registro en schema_migrations. La estructura inicial incluía 13 entidades de negocio; con la migración 004 hay 17 entidades y una tabla de control de migraciones.

Para ver las tablas en Table Editor, seleccionar **pharmacy** en el selector de esquema; no están en public.

- **Farmacias Alvarado · 04 Usuarios y múltiples sucursales**: [consulta guardada](https://supabase.com/dashboard/project/sflyoepicizmvklfefaa/sql/fbb00ad6-9924-4eed-92c7-13dc25ab5604), copia de `supabase/migrations/002_user_branches_and_deletion.sql`. Ya aplicada; no ejecutar nuevamente.
- **Farmacias Alvarado · 05 Fotografías de inventario y activos**: [consulta guardada](https://supabase.com/dashboard/project/sflyoepicizmvklfefaa/sql/04910c0a-ca8a-4346-b535-82cafef487fc), copia de `supabase/migrations/003_record_images.sql`. Ya aplicada y verificada en PostgreSQL; no ejecutar nuevamente.
- **Farmacias Alvarado · 06 Artículos, compras y clientes**: [consulta guardada](https://supabase.com/dashboard/project/sflyoepicizmvklfefaa/sql/2e017059-0c61-4cd0-8f00-43ee010b2790), copia de `supabase/migrations/004_catalog_purchases_customers.sql`. Ya aplicada y verificada en PostgreSQL el 13/10/2026. Conserva datos históricos mediante vínculos con los nuevos catálogos. No volver a ejecutar.
- **Farmacias Alvarado · 07 Plantilla de datos de prueba actualizada**: [consulta guardada](https://supabase.com/dashboard/project/sflyoepicizmvklfefaa/sql/cee17855-ead8-4e70-ae03-121d3ac42dda), copia actual de `supabase/seed.sql`. Incluye artículos de equipo para activos y un cliente ficticio. Guardada **sin ejecutar** en la base actual. Para instalaciones nuevas de prueba, usar esta plantilla después de las migraciones 001 a 004; la consulta 02 se conserva como referencia histórica y no debe ejecutarse con la estructura nueva.
