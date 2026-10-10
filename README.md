# Farmacias Alvarado — plantilla de demostración

React + JavaScript + CSS y API Node.js/Express para sucursales, inventario, traslados, caja, personal, nómina, activos, pedidos y usuarios. Moneda GTQ y zona horaria America/Guatemala.

Esta copia utiliza datos ficticios. No contiene credenciales, usuarios reales, exportaciones de bases de datos ni vínculos a una instalación privada. Es una base para pruebas y desarrollo; no constituye un sistema certificado para operación farmacéutica o contabilidad normativa.

## Ejecutar localmente

Instala Node.js 24 LTS y Git. Desde la carpeta del proyecto:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Abre http://localhost:5173. Detén ambos servicios con Ctrl+C. El modo inicial es demo; no necesita Supabase. Si hay problemas con el lanzador npm en Windows, usa scripts/start.ps1.

Para la versión compilada: npm run build y npm start; abre http://localhost:3001.

## Cuentas ficticias

Correo: administrador@farmaalvar.demo. Contraseña pública de demostración: FarmaDemo2026!

También existen auditor, gerente, cajero, logistica y rrhh con el mismo dominio y contraseña. Son cuentas ficticias de uso local. El modo demo guarda su estado en server/data/demo.json, excluido de Git. El gerente y cajero tienen inicialmente acceso a Sucursal Demo Central.

## Funciones

- Inventario por lote, caducidad y reservas; traslados entre sucursales.
- Caja, activos, empleados y registro de nómina, sin ejecutar transferencias bancarias.
- Pedidos con disponibilidad, reserva, despacho y entrega; no procesa tarjetas ni tráfico real.
- Roles administrador, auditor, gerente, cajero, logistica y rrhh.
- Una, varias o Todas las sucursales por usuario. RRHH puede registrar pagos de nómina en su alcance.
- Eliminación de usuarios con bloqueo de autoeliminación y conservación del historial.
- Creación de cuentas con UID automático cuando se conecta un proyecto Supabase propio. En demo se utilizan las cuentas ficticias incluidas; la creación Auth requiere Supabase.

## Conectar un Supabase propio

1. Crea un proyecto de pruebas y completa en .env las variables de .env.example: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y DATABASE_URL. Usa la conexión Session pooler con contraseña codificada para URL.
2. Verifica la CA pública de Supabase en deploy/certs/supabase-ca.crt y configura DATABASE_CA_FILE. La conexión valida certificado y nombre del servidor.
3. Ejecuta npm run db:migrate. Para una base exclusivamente de pruebas, ejecuta npm run db:seed.
4. Crea el primer usuario en Supabase Auth y adapta supabase/bootstrap-admin.sql con su UID, nombre y correo. No publiques la versión con datos personales; guárdala en supabase/local/.
5. Cambia APP_MODE=supabase y reinicia el servidor.
6. Para crear o eliminar cuentas desde Usuarios y roles, configura SUPABASE_SECRET_KEY solo en el servidor. Nunca uses el prefijo VITE_ para esa clave.

Las cuentas demo no se copian a Supabase Auth. Nunca ejecutes el seed en una base de datos con información real.

## Pruebas y publicación

```powershell
npm test
npm run build
git add .
npm run check:privacy
```

La revisión de privacidad inspecciona el contenido preparado para commit. Conserva fuera de Git los .env, contraseñas, cuentas reales, capturas, exportaciones, respaldos y datos de ejecución.

El certificado CA incluido es público; no contiene una clave privada. El archivo .env.example contiene campos vacíos para los secretos y una contraseña pública del modo demo.

## Docker y documentación

Docker Compose está preparado para un despliegue con Supabase propio, dominio y HTTPS. El modo demo local no se permite con NODE_ENV=production. Sigue docs/DESPLIEGUE.md.

- docs/ARQUITECTURA.md: capas, permisos y límites.
- docs/API.md: endpoints y contratos.
- docs/SQL_EDITOR.md: scripts SQL de plantilla.
- docs/GITHUB.md: mantenimiento de la copia publicable.

## Organización

client/src contiene components, pages, views, services y utils. server/src contiene config, controllers, middleware, models, routes, services y utils. Las migraciones y datos ficticios están en supabase; la configuración de despliegue, en deploy.
