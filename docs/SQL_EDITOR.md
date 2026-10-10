# Consultas SQL de la plantilla

Esta copia no está conectada a ningún proyecto Supabase. No contiene enlaces a consultas, identificadores de usuarios ni credenciales de una instalación real.

| Archivo | Contenido |
|---|---|
| supabase/migrations/001_initial.sql | Tablas, relaciones, índices y seguridad del esquema pharmacy |
| supabase/migrations/002_user_branches_and_deletion.sql | Varias sucursales por usuario y eliminación con historial conservado |
| supabase/seed.sql | Registros ficticios; no crea usuarios Auth |
| supabase/bootstrap-admin.sql | Plantilla del primer perfil; sustituir UUID, nombre y correo |

Para un proyecto nuevo, ejecuta npm run db:migrate y luego, solo en una base de pruebas, npm run db:seed. Guarda copias de referencia en el SQL Editor de tu propio proyecto si lo necesitas; no vuelvas a ejecutar manualmente migraciones ya aplicadas.

Los datos de prueba contienen 4 sucursales, 6 medicamentos, 24 lotes, 6 empleados, 4 activos y 8 movimientos de caja. Las cuentas del modo demo existen únicamente en el repositorio local de demostración.
