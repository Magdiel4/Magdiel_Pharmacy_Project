# Despliegue paso a paso

## 1. Preparar las herramientas

En esta computadora se detectó Node.js 24, pero Docker no está instalado o no está en PATH. Instalar **Docker Desktop para Windows** desde https://docs.docker.com/desktop/setup/install/windows-install/ . Su instalador puede requerir WSL 2, virtualización y reiniciar Windows; realizar esos pasos cuando lo solicite. Luego abrir Docker Desktop y verificar:

```powershell
docker --version
docker compose version
docker info
```

Para publicar en Internet, preparar un servidor Linux con Docker Engine y el complemento Compose siguiendo https://docs.docker.com/engine/install/ . Usar un dominio propio y configurar su registro DNS A hacia la IP pública del servidor. Abrir 80/TCP y 443/TCP (443/UDP opcional para HTTP/3). El puerto 3001 permanece en la red privada de Docker.

## 2. Revisar la base de datos

Usar un proyecto Supabase dedicado al ambiente de producción. Copiar `.env.example` a `.env` en el servidor y completar:

```dotenv
APP_MODE=supabase
NODE_ENV=production
PORT=3001
DOMAIN=farmacias.tu-dominio.com
PUBLIC_ORIGIN=https://farmacias.tu-dominio.com
SUPABASE_PROJECT_NAME=NombreDelProyecto
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICA
DATABASE_URL=postgresql://USUARIO:CONTRASENA_CODIFICADA@HOST_POOLER:5432/postgres
DATABASE_CA_FILE=deploy/certs/supabase-ca.crt
```

No copiar credenciales de ejemplo. No incluir `sslmode=disable` ni parámetros SSL en la URI: la aplicación define verificación TLS y CA explícitamente. No incluir `.env` en el repositorio, correo, capturas ni imagen Docker. En Linux limitar permisos: `chmod 600 .env`.

El backend actual aplica autorización por rol y sucursal y utiliza un rol SQL con acceso al esquema. Para producción crear un rol PostgreSQL exclusivo con permisos mínimos sobre `pharmacy`, en lugar de operar habitualmente con el propietario `postgres`. Su diseño de políticas y permisos debe probarse con todos los flujos antes del cambio. Las migraciones se ejecutan con el propietario. RLS impide el acceso mediante anon/authenticated; **la autorización de las conexiones administrativas SQL depende del backend**.

## 3. Construir y crear las tablas

Copiar el código al servidor o clonarlo desde tu repositorio privado. Desde la raíz:

```sh
docker compose build
docker compose run --rm --no-deps app node server/scripts/database.js migrate
```

Para un ambiente de pruebas, agregar datos ficticios:

```sh
docker compose run --rm --no-deps app node server/scripts/database.js seed
```

No ejecutar seed en la base de producción. Las migraciones se registran en `pharmacy.schema_migrations` y se aplican una vez. Cada archivo se ejecuta dentro de una transacción; un error revierte el archivo completo.

## 4. Crear el primer administrador

En el panel de Supabase, crear un usuario con correo y contraseña en **Authentication → Users**. Copiar su UUID y ejecutar la plantilla `supabase/bootstrap-admin.sql` con el nombre y correo correctos. No usar las cuentas demo en producción. En **Authentication → URL Configuration**, configurar el dominio público cuando se habiliten invitaciones o recuperación de cuentas.

Si se emplean invitaciones, configurar SMTP y completar el flujo de activación/restablecimiento antes de dar acceso a empleados. Esta primera versión tiene ingreso por contraseña y no incluye una pantalla de recuperación.

## 5. Iniciar con HTTPS

```sh
docker compose up -d
docker compose ps
docker compose logs --tail=100 app proxy
```

Caddy solicita el certificado HTTPS para `DOMAIN`. Es necesario que el DNS ya apunte al servidor y que los puertos 80/443 sean accesibles. Entrar a `https://farmacias.tu-dominio.com`. Las cookies de sesión requieren HTTPS en producción.

Verificar salud:

```sh
curl -fsS https://farmacias.tu-dominio.com/api/health
```

La respuesta debe incluir `status: ok` y `mode: supabase`. El chequeo de salud confirma que el proceso responde; el inicio del backend también prueba PostgreSQL. Probar un ingreso, consulta de inventario y operación controlada antes de abrir acceso general.

## 6. Validación de aceptación

1. Entrar como administrador y verificar sucursales, precios, costos, empleados y permisos.
2. Entrar como cajero y comprobar que no puede consultar otra sucursal ni nómina.
3. Recibir un lote de prueba; enviar y recibir un traslado, verificando ambos saldos.
4. Crear un pedido, despacharlo y registrar entrega/cobro; verificar stock y caja.
5. Preparar una nómina y registrar el comprobante de un pago de prueba; comprobar que no se duplica.
6. Entrar como auditor y comprobar la trazabilidad y ausencia de acciones de escritura.
7. Validar respaldos, restauración, tiempos de respuesta, carga concurrente y alertas con el volumen esperado.

## 7. Operación y actualización

- Configurar los respaldos disponibles en tu plan Supabase y realizar una restauración de ensayo. Un archivo CSV no sustituye el respaldo completo.
- Mantener un ambiente separado de pruebas. Validar migraciones y la imagen antes de reemplazar producción.
- Para actualizar: respaldar, actualizar el código, ejecutar `docker compose build`, aplicar migraciones y ejecutar `docker compose up -d`.
- Conservar una imagen previamente validada para rollback del código. La reversión del esquema necesita un plan específico o restauración; no eliminar tablas a mano.
- Los logs rotan a 10 MB por archivo, hasta tres archivos. No registrar contraseñas, tokens ni datos personales en logs.
- Un único servidor Compose tiene un punto único de falla. Antes del despliegue nacional se requieren redundancia, monitoreo, pruebas de recuperación y capacidad.
- Actualmente el límite de solicitudes es por proceso y, detrás de Caddy, ve la IP del proxy. Antes de atender alto tráfico, configurar confianza de proxy exclusivamente para la red interna conocida y un almacén compartido de límites. No usar `trust proxy=true` sin un límite de confianza.

## Errores frecuentes

| Mensaje | Acción |
|---|---|
| npm busca `AppData/Roaming/npm` | Usar `scripts/start.ps1` o el npm-cli.js de `C:/Program Files/nodejs` |
| `SELF_SIGNED_CERT_IN_CHAIN` | Descargar CA del panel Database Settings → SSL Configuration y configurar DATABASE_CA_FILE |
| `password authentication failed` | Verificar contraseña, usuario del pooler y codificación de la URI |
| `ENETUNREACH` con conexión directa | Utilizar Session pooler IPv4 en lugar del host directo IPv6 |
| `relation pharmacy... does not exist` | Ejecutar migraciones antes de iniciar la aplicación |
| `Tu usuario aún no tiene acceso asignado` | Crear perfil con el UUID exacto de Supabase Auth |
| `Origen no permitido` | PUBLIC_ORIGIN debe coincidir exactamente con el origen del navegador |
| Caddy no obtiene certificado | Comprobar DNS, puertos, dominio y logs del proxy |

Fuentes oficiales: https://docs.docker.com/compose/gettingstarted/ y https://supabase.com/docs/guides/database/connecting-to-postgres .
