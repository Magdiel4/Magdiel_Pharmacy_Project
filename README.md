# Farmacias Alvarado

Sistema web en español para administrar sucursales, artículos, compras, inventario por lotes, traslados, clientes, caja, empleados, nómina, activos, pedidos y accesos. React + JavaScript + CSS, API Node.js/Express y PostgreSQL/Supabase Auth. Moneda GTQ; zona horaria America/Guatemala.

**Estado:** primera versión funcional para pruebas y piloto. No representa todavía una certificación de operación farmacéutica, contable ni una plataforma validada para toda una cadena nacional. Ver límites y ampliaciones en `docs/ARQUITECTURA.md`.

## Iniciar en Windows

Node.js está instalado. Si el comando `npm` muestra una ruta incorrecta, este script utiliza el npm de la instalación de Node sin modificar tu configuración global:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start.ps1
```

Abrir http://localhost:5173. El script inicia API y frontend y se detiene con Ctrl+C. También puedes usar `npm install` y `npm run dev` cuando npm esté correctamente configurado.

Para ejecutar la versión compilada:

```powershell
& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run build
node server/src/index.js
```

En este caso abrir http://localhost:3001 y usar `PUBLIC_ORIGIN=http://localhost:3001` en `.env`.

## Acceso de demostración

Con `APP_MODE=demo`, los datos ficticios se guardan en `server/data/demo.json`. No se escriben en Supabase. El backend escucha únicamente en la computadora local y se niega a iniciar demo con `NODE_ENV=production`.

- Correo: `administrador@farmaalvar.demo`
- Contraseña inicial: `FarmaDemo2026!` (configurable en `DEMO_PASSWORD`).
- Otros roles: `auditor`, `gerente`, `cajero`, `logistica`, `rrhh`, con el mismo dominio y contraseña demo.
- Gerente y cajero están restringidos a Oakland · Zona 10.

## Conexión Supabase

El proyecto configurado localmente es **Magdiel_Pharmacy_Project**. Los secretos están exclusivamente en `.env`, excluido de Git y de la imagen Docker. `.env.example` es una plantilla sin secretos.

1. Completar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `DATABASE_URL`. El `Session pooler` se obtiene en **Connect** de Supabase. Codificar caracteres especiales de la contraseña en la URI (por ejemplo, `@` se convierte en `%40`).
2. Configurar `DATABASE_CA_FILE=deploy/certs/supabase-ca.crt`. Se incluye el certificado público de Supabase; no es una clave privada. La conexión valida certificado y nombre del servidor.
3. Ejecutar desde la raíz:

```powershell
node server/scripts/check-db.js
node server/scripts/database.js migrate
node server/scripts/database.js seed
```

La migración crea el esquema **pharmacy** con tablas, índices, restricciones, RLS y protección de libros inmutables. No modifica tablas de `public`. El comando seed agrega datos ficticios conocidos de manera idempotente y conserva los existentes. No usar seed en una instalación destinada a datos reales.

4. En Supabase → **Authentication → Users → Add user**, crear un usuario con correo y contraseña propios. Copiar su UUID. El personal registrado en Empleados no necesita este paso.
5. Adaptar y ejecutar `supabase/bootstrap-admin.sql` en el SQL Editor para asignar el primer perfil administrador. Para usuarios posteriores, utilizar **Usuarios y roles → Nuevo usuario** con la clave privada del servidor configurada. También se puede crear la cuenta Auth en Supabase y usar **Asignar acceso existente**.
6. Cambiar `APP_MODE=supabase` y reiniciar el servidor. Entrar con la cuenta recién creada. La clave pública se usa para autenticar; todas las operaciones de negocio pasan por la API Node.

La clave `SUPABASE_SECRET_KEY` es necesaria para **Nuevo usuario** y para el script de invitaciones `npm run user:create`; el inicio de sesión normal no la necesita. Guarda una clave secret (o service_role) únicamente en `.env` del servidor, sin prefijo `VITE_`, y reinicia Node después de configurarla. Las invitaciones requieren configurar correo y URL de redirección en Supabase. No son necesarias si se crean cuentas con contraseña en el panel.

## Flujos incluidos

| Módulo | Operaciones |
|---|---|
| Dashboard | Indicadores calculados, ingresos/egresos por sucursal, alertas de mínimos y vencimientos |
| Sucursales | Crear, editar y desactivar; coordenadas y botón Ver ubicación en Google Maps |
| Artículos | Grupos Medicamentos/Suministros/Activos; código automático MED/SUM/ACT, precios, vencimiento y estado |
| Proveedores | Cuenta y NIT obligatorios y únicos; nombre, tipo, descripción y datos de contacto |
| Órdenes de compra | Proveedor del catálogo, captura fija de líneas, estado Creado eliminable, confirmación y recepciones |
| Inventario | Disponible por artículo/sucursal, recepción de compra o directa y detalle por lote |
| Traslados | Envío descuenta origen; recepción confirmada ingresa destino una sola vez |
| Caja | Registro inmutable de ingresos/egresos por medio de pago; referencias únicas; CSV |
| Empleados | Crear y editar personal sin usuario, salario y sucursal |
| Nómina | Preparar por empleado/período, bonos y deducciones manuales; registrar comprobante de pago y egreso |
| Activos | Artículo obligatorio, registro, fotografías, estado y depreciación lineal mensual estimada |
| Clientes | Directorio con código, contacto y coordenadas; crear pedidos desde el cliente |
| Pedidos | Cliente registrado, consulta de cobertura/stock, reserva FEFO, despacho y entrega con cobro |
| Usuarios | Crear cuenta en Supabase Auth con UID automático; asignar/editar perfil, rol, sucursal y estado |
| Auditoría | Historial de acciones, actor, detalle y exportación CSV |

La nómina registra un pago ya realizado: **no realiza transferencias bancarias**. La entrega confirma el cobro y registra el ingreso: **no procesa tarjetas ni pagos en una pasarela**. Los pedidos admiten varias líneas de artículos para un cliente y una sucursal de entrega. El ETA usa distancia en línea recta, 25 km/h y 15 minutos de preparación; debe confirmarse con logística. Consulta el flujo en [docs/PEDIDOS_MULTILINEA.md](docs/PEDIDOS_MULTILINEA.md).

## Pruebas y compilación

```powershell
node --import ./server/test/setup.js --test server/test/*.test.js
& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run build
```

Las pruebas automatizadas usan un repositorio demo aislado. Cubren concurrencia, rollback, FEFO, receta, vencimiento, cobertura, permisos, sesiones, referencia única y pagos/entregas repetidos. No ejecutan pagos ni utilizan datos reales.

## Docker y publicación

Las consultas de creación e inserción también están guardadas en el SQL Editor del proyecto. Enlaces y ubicación: **`docs/SQL_EDITOR.md`**.

Ver **`docs/DESPLIEGUE.md`** para instalación de Docker, dominio, HTTPS, migraciones, despliegue, respaldo y actualización. El contenedor usa Node sin privilegios, sistema de archivos de solo lectura, chequeo de salud y proxy Caddy con HTTPS.

## Organización

```text
client/src/
  components/    Componentes de interfaz y formularios
  pages/         Pantallas y flujos de usuario
  views/         Estructura de navegación
  services/      Cliente HTTP
  utils/         Moneda, fechas, depreciación, CSV
server/src/
  config/        Entorno
  controllers/   Adaptación HTTP
  middleware/    Seguridad y errores
  models/        Validación, repositorios y datos demo
  routes/        Rutas API
  services/      Reglas de negocio, autenticación y permisos
  utils/         Errores, fechas y cálculo monetario
server/test/     Pruebas automatizadas
server/scripts/ Migraciones y utilidades administrativas
supabase/        SQL de estructura y bootstrap
deploy/          Proxy y certificado público
docs/            Arquitectura, API y despliegue
```

## Usuarios con acceso a múltiples sucursales

En **Usuarios y roles**, tanto Nuevo usuario como Editar acceso requieren elegir **Todas las sucursales** o **Una o varias sucursales** y marcar al menos una. Recursos Humanos puede consultar, preparar y registrar pagos de nómina en todas las sucursales asignadas. Todas las sucursales incluye también las futuras.

El botón **Eliminar** requiere confirmación y está deshabilitado para el administrador de la sesión. Se retira la cuenta de acceso de Supabase Auth y se conserva su historial de auditoría y operaciones. La baja no se puede deshacer; si falla la conexión, el usuario queda bloqueado y el administrador puede reintentar.

La migración `002_user_branches_and_deletion.sql` conserva los permisos existentes. En otra instalación, ejecutar `npm run db:migrate` antes de iniciar esta versión.

## Fotografías

En Inventario, abre **Detalle por lote y fotografías** o **Ver lotes / trasladar** para acceder a las imágenes. La vista consolidada agrupa cantidades; cada fotografía sigue perteneciendo a su lote y sucursal.

En **Inventario** y **Activos fijos**, registra primero el lote o activo. Después selecciona **Adjuntar foto** o la miniatura, elige una imagen y pulsa **Guardar fotografía**. El mismo visor permite ampliar, reemplazar o eliminar la foto. Administrador y gerente pueden modificarla dentro de sus sucursales; los demás roles con acceso al módulo pueden visualizarla.

Se admite una imagen por registro, en JPG, PNG o WebP, hasta 5 MB y 25 megapíxeles. El servidor la convierte a WebP y la guarda directamente en `pharmacy.inventory.image_data` o `pharmacy.assets.image_data`. Se requiere la migración 003 (ya aplicada en el proyecto original). Las imágenes forman parte de los respaldos de PostgreSQL.

En modo demo, las imágenes se guardan en base64 en el archivo local de datos. La copia independiente `Farma_Alvar_Demo` no se actualiza automáticamente con los cambios del proyecto original.

## Artículos, compras y clientes

La migración `004_catalog_purchases_customers.sql` ya está aplicada en el proyecto original. En otra instalación ejecuta `npm run db:migrate` antes de iniciar esta versión. Conserva los artículos, lotes, fotografías y movimientos existentes; vincula los activos y pedidos históricos con los nuevos catálogos.

También está aplicada la migración `005_article_sequences_suppliers.sql`: normaliza códigos conservando UUID y relaciones, agrega secuencias y proveedores, y cambia Borrador por Creado. Los proveedores históricos sin NIT quedan inactivos hasta completar sus datos. [Detalle de la actualización](docs/GRUPOS_Y_PROVEEDORES.md).

Guía de uso, permisos y alcance del flujo inspirado en Dynamics 365: [docs/FLUJOS_OPERATIVOS.md](docs/FLUJOS_OPERATIVOS.md). Las compras gestionan solicitud y recepción física; no generan facturas de proveedor ni pagos. Los activos exigen un artículo, pero su alta no descuenta inventario ni capitaliza automáticamente una compra.

## Formato del código

Prettier está instalado como dependencia de desarrollo. Ejecuta `npm run format` para formatear o `npm run format:check` para comprobar el formato. `.prettierrc.json` define sangría de dos espacios y ancho de línea de 100 caracteres. `.prettierignore` excluye datos locales, credenciales y archivos generados.

VS Code recomienda la extensión **Prettier - Code formatter** y configura el formato al guardar. Los comandos npm funcionan sin instalar la extensión.
