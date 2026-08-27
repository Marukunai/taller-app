-- =============================================================
-- Taller App · Reset completo de la base de datos
-- Ejecutar en el SQL Editor de Supabase SOLO si quieres borrar TODOS
-- los datos DE CLIENTES (clientes, vehículos, órdenes, inspecciones,
-- solicitudes del Portal de cliente) y volver a crear ese esquema desde
-- cero con la versión más reciente.
--
-- A PROPÓSITO no toca `inventario_items`/`almacenes` (catálogo propio del
-- taller, no datos de prueba de clientes) ni `perfiles` (va ligado a las
-- cuentas de Supabase Auth, no se recrea con schema.sql). Sí borra
-- `piezas_usadas` y `solicitudes`, que van ligadas a órdenes/clientes de
-- prueba — son dato de prueba, no catálogo.
--
-- No borra los buckets de Storage ni los archivos ya subidos (fotos,
-- firmas, PDFs) — para vaciar eso también, hazlo aparte desde el
-- panel de Storage.
--
-- Uso:
--   1. Ejecuta este archivo completo primero.
--   2. A continuación, ejecuta el contenido completo de
--      supabase/schema.sql — ya incluye las tablas, las políticas RLS
--      basadas en autenticación y unos datos de prueba. No hace falta
--      ejecutar storage_policies.sql, checkout_migration.sql,
--      auth_migration.sql, features_migration.sql,
--      piezas_usadas_migration.sql ni portal_taller_migration.sql aparte:
--      al partir de cero, schema.sql ya lo trae todo junto y al día.
--   3. Si aún no lo has hecho, crea el usuario de acceso a la app en
--      Authentication → Users → Add user (email + contraseña).
-- =============================================================

-- Borra las tablas (y con ellas, sus datos y sus políticas RLS, que
-- van ligadas a la tabla y desaparecen solas al borrarla).
drop table if exists solicitudes cascade;
drop table if exists piezas_usadas cascade;
drop table if exists inspecciones_entrada cascade;
drop table if exists ordenes_trabajo cascade;
drop table if exists vehiculos cascade;
drop table if exists clientes cascade;

-- Las políticas de storage.objects NO se borran solas (esa tabla es
-- del propio Supabase, no de esta app, y no se borra nunca) — se
-- quitan a mano. Se incluyen tanto los nombres "demo" antiguos como
-- los "autenticado" más recientes, por si ya tenías unos u otros:
drop policy if exists "Acceso Demo Storage fotos-vehiculos" on storage.objects;
drop policy if exists "Acceso Demo Storage firmas" on storage.objects;
drop policy if exists "Acceso Demo Storage documentos-pdf" on storage.objects;
drop policy if exists "Acceso Autenticado Storage fotos-vehiculos" on storage.objects;
drop policy if exists "Acceso Autenticado Storage firmas" on storage.objects;
drop policy if exists "Acceso Autenticado Storage documentos-pdf" on storage.objects;
