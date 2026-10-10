-- Primero crea tu usuario con contraseña en Supabase > Authentication > Users.
-- Sustituye los tres valores antes de ejecutar en SQL Editor.
INSERT INTO pharmacy.profiles (id,name,email,role,branch_id,active)
VALUES ('REEMPLAZAR-UUID-DE-AUTH','Tu nombre','tu-correo@empresa.com','administrador',NULL,true);
