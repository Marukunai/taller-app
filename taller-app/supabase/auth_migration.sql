-- =============================================================
-- Taller App · Migración: seguridad antes de producción
-- Ejecutar en el SQL Editor de tu proyecto Supabase.
--
-- Sustituye las políticas RLS "demo" (acceso público total, using(true)/
-- with check(true)) por políticas que exigen un usuario autenticado. Es
-- un único login compartido para el personal del taller (email +
-- contraseña vía Supabase Auth) — no hay multi-tenant ni propiedad de
-- filas por usuario.
--
-- IMPORTANTE — orden de pasos:
--   1. Antes de ejecutar esta migración, crea el usuario del taller en
--      el dashboard: Authentication → Users → Add user (email +
--      contraseña). Puedes crear más de uno si varias personas van a
--      entrar con su propio login; todos comparten el mismo acceso.
--   2. Ejecuta este archivo completo.
--   3. A partir de ahí, la app (que ahora pide login) solo funcionará
--      para quien inicie sesión con un usuario ya creado — no hay
--      registro público desde la propia app.
-- =============================================================

-- 1. TABLAS
drop policy if exists "Acceso Demo Clientes" on clientes;
create policy "Acceso Autenticado Clientes" on clientes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Acceso Demo Vehículos" on vehiculos;
create policy "Acceso Autenticado Vehículos" on vehiculos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Acceso Demo Ordenes" on ordenes_trabajo;
create policy "Acceso Autenticado Ordenes" on ordenes_trabajo
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Acceso Demo Inspecciones" on inspecciones_entrada;
create policy "Acceso Autenticado Inspecciones" on inspecciones_entrada
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 2. STORAGE (fotos, firmas, PDFs)
drop policy if exists "Acceso Demo Storage fotos-vehiculos" on storage.objects;
create policy "Acceso Autenticado Storage fotos-vehiculos"
on storage.objects for all
using (bucket_id = 'fotos-vehiculos' and auth.role() = 'authenticated')
with check (bucket_id = 'fotos-vehiculos' and auth.role() = 'authenticated');

drop policy if exists "Acceso Demo Storage firmas" on storage.objects;
create policy "Acceso Autenticado Storage firmas"
on storage.objects for all
using (bucket_id = 'firmas' and auth.role() = 'authenticated')
with check (bucket_id = 'firmas' and auth.role() = 'authenticated');

drop policy if exists "Acceso Demo Storage documentos-pdf" on storage.objects;
create policy "Acceso Autenticado Storage documentos-pdf"
on storage.objects for all
using (bucket_id = 'documentos-pdf' and auth.role() = 'authenticated')
with check (bucket_id = 'documentos-pdf' and auth.role() = 'authenticated');
