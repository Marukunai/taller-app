-- =============================================================
-- Taller App · Migración incremental: editar/desactivar/eliminar cuentas
-- de personal desde "Gestión de personal", con protección anti-bloqueo.
--
-- Para proyectos que YA tienen aplicado roles_finos_migration.sql (o
-- schema.sql al día). Es idempotente: se puede ejecutar más de una vez sin
-- duplicar nada ni dar error.
--
-- Qué añade:
--   1. Columna `perfiles.activo` (boolean, default true) — una cuenta de
--      personal desactivada deja de contar como personal a efectos de RLS
--      al instante, sin depender de que caduque su sesión.
--   2. `es_personal()` / `es_encargado()` actualizadas para exigir además
--      `activo` — ninguna otra política tiene que cambiar, porque todas ya
--      dependen de estas dos funciones.
-- =============================================================

alter table perfiles add column if not exists activo boolean not null default true;

create or replace function es_personal()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol in ('encargado', 'mecanico') and activo
  );
$$;

create or replace function es_encargado()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol = 'encargado' and activo
  );
$$;

grant execute on function es_personal() to authenticated;
grant execute on function es_encargado() to authenticated;
