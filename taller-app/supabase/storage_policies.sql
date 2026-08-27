-- =============================================================
-- Taller App · Políticas de Storage (faltaban en schema.sql)
-- Ejecutar en el SQL Editor de Supabase. Arregla el error:
--   "new row violates row-level security policy"
-- que aparece al subir fotos, firmas o PDFs desde la app.
--
-- Motivo: marcar un bucket como "Public" en el dashboard solo permite
-- LEER los archivos públicamente; seguir necesitando políticas propias
-- en storage.objects para poder subir (INSERT) con la clave anon/publishable.
-- Igual de permisivas que el resto del esquema demo — sustituir por
-- políticas basadas en auth.uid() antes de producción.
-- =============================================================

create policy "Acceso Demo Storage fotos-vehiculos"
on storage.objects
for all
using (bucket_id = 'fotos-vehiculos')
with check (bucket_id = 'fotos-vehiculos');

create policy "Acceso Demo Storage firmas"
on storage.objects
for all
using (bucket_id = 'firmas')
with check (bucket_id = 'firmas');

create policy "Acceso Demo Storage documentos-pdf"
on storage.objects
for all
using (bucket_id = 'documentos-pdf')
with check (bucket_id = 'documentos-pdf');
