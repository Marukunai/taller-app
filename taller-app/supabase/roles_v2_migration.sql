-- =============================================================
-- Migración incremental — Batch 19: jerarquía de roles admin/dueño/
-- encargado/mecánico/recepcionista/cliente.
--
-- Para un proyecto de Supabase que YA tiene `roles_finos_migration.sql` /
-- `gestion_personal_migration.sql` aplicados (rol 'encargado'/'mecanico'/
-- 'cliente' con columna `activo`). Seguro de re-ejecutar más de una vez.
--
-- Qué cambia:
--   1. El check constraint de `perfiles.rol` admite los 3 roles nuevos:
--      'admin', 'dueno', 'recepcionista'.
--   2. Todas las cuentas 'encargado' existentes pasan a 'dueno' (decisión
--      del usuario: el rol con más permisos hasta ahora se convierte en el
--      nuevo rol de más permisos operativos — 'encargado' queda libre para
--      cuentas nuevas, un nivel por debajo de 'dueno').
--   3. `es_personal()`/`es_encargado()` se amplían para admitir los roles
--      nuevos (misma jerarquía: dueño/admin heredan todo lo de encargado).
--   4. Función nueva `es_gestion_cuentas()` (admin/dueño) y `es_admin()`
--      (solo admin).
--   5. Trigger nuevo `bloquear_cambio_rol_propio` en `perfiles`: cierra un
--      agujero de seguridad que ya existía desde antes de este batch (la
--      política RLS "Editar propio perfil" solo restringe FILAS, no
--      COLUMNAS, así que cualquier cuenta podía auto-ascenderse su propio
--      rol con un `update` directo saltándose la Edge Function) — ahora
--      necesario, no solo bueno tener, porque el rol 'dueno'/'admin' es
--      mucho más potente que el antiguo 'encargado'.
--
-- Después de ejecutar esto:
--   - Despliega (o vuelve a desplegar) las Edge Functions actualizadas:
--       supabase functions deploy crear-cuenta-personal
--       supabase functions deploy administrar-cuenta-personal
--     (la antigua "crear-cuenta-mecanico" ya no la usa la app — puedes
--     borrarla del dashboard si quieres, no es obligatorio).
--   - Si quieres una cuenta 'admin' de arranque (para poder crear un
--     'dueno' nuevo en el futuro sin usar una cuenta dueño existente),
--     conviértela a mano con SQL directo — NUNCA desde la app:
--       update perfiles set rol = 'admin' where email = 'tu-email-admin@ejemplo.com';
--     (la cuenta debe existir ya en Supabase Auth — créala primero desde
--     Authentication → Users → Add user si hace falta).
-- =============================================================

-- 1. Ampliar el check constraint del rol.
alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check
  check (rol in ('admin', 'dueno', 'encargado', 'mecanico', 'recepcionista', 'cliente'));

-- 2. Promocionar las cuentas 'encargado' existentes a 'dueno'.
update perfiles set rol = 'dueno' where rol = 'encargado';

-- 3. Redefinir es_personal()/es_encargado() con la jerarquía nueva.
create or replace function es_personal()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid()
      and rol in ('admin', 'dueno', 'encargado', 'mecanico', 'recepcionista')
      and activo
  );
$$;

create or replace function es_encargado()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and rol in ('admin', 'dueno', 'encargado') and activo
  );
$$;

-- 4. Funciones nuevas.
create or replace function es_gestion_cuentas()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol in ('admin', 'dueno') and activo
  );
$$;

create or replace function es_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol = 'admin' and activo
  );
$$;

grant execute on function es_personal() to authenticated;
grant execute on function es_encargado() to authenticated;
grant execute on function es_gestion_cuentas() to authenticated;
grant execute on function es_admin() to authenticated;

-- 5. Trigger anti-autoescalada: cierra el agujero de "Editar propio perfil"
-- (RLS por fila, no por columna) para rol/activo — solo se puede cambiar
-- desde la clave service_role (Edge Functions, que ya comprueban el
-- permiso de quien llama en su propio código).
create or replace function bloquear_cambio_rol_propio()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.rol is distinct from old.rol or new.activo is distinct from old.activo)
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo un dueño o administrador puede cambiar el rol o el estado de una cuenta.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_cambio_rol_propio on perfiles;
create trigger trg_bloquear_cambio_rol_propio
  before update on perfiles
  for each row execute function bloquear_cambio_rol_propio();
