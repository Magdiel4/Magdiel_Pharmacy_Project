# Verificación de la plantilla

Ejecutar npm ci, npm test y npm run build desde la raíz. Las pruebas usan datos ficticios y un proveedor Auth simulado; no acceden a Supabase.

La verificación de publicación se ejecuta con npm run check:privacy después de git add. Inspecciona los archivos del índice de Git; no muestra valores detectados. Es una comprobación preventiva y no sustituye una revisión del diff.

La plantilla no incluye resultados ni capturas de una instalación privada. No se ha construido ni desplegado la imagen Docker como parte de esta preparación.

## Resultado de preparación — 10 de octubre de 2026

- Instalación independiente con npm ci.
- 33 pruebas automatizadas aprobadas; proveedor Auth simulado y datos ficticios.
- Compilación React/Vite completada.
- Revisión de archivos preparados para commit sin coincidencias sensibles detectadas.
- Referencias de dependencias sin credenciales incrustadas.
- Configuración predeterminada verificada: modo demo, sin credenciales Supabase.
