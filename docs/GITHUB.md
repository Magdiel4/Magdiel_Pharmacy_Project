# Copia preparada para GitHub

Esta carpeta es una plantilla independiente. Su configuración y sus datos de demostración no modifican ninguna instalación original.

Antes de cada commit:

1. Revisa git status y git diff.
2. Prepara solo los cambios que quieres compartir con git add.
3. Ejecuta npm run check:privacy. Revisa también git diff --cached.
4. Crea el commit y realiza el push.

No uses git add -f para secretos o archivos excluidos. Los patrones .gitignore no eliminan información ya publicada en el historial. Si posteriormente publicas una credencial por error, revócala y limpia el historial correspondiente.

Se excluyen .env y sus variantes (salvo .env.example), datos locales, SQL personal del administrador, capturas, respaldos, claves privadas, cachés, dependencias e imágenes compiladas. Solo se incluye la CA pública de Supabase.

Los nombres de sucursales, personal y usuarios incluidos son ejemplos; los importes y ubicaciones no representan operaciones reales.
