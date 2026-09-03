-- =============================================================
-- Migración incremental — Batch 19, parte 4: franjas horarias configurables
-- en la Agenda (plazas de trabajo simultáneas) y restricción de préstamo de
-- coche de sustitución también a nivel de base de datos (antes solo era de
-- interfaz).
--
-- Segura de re-ejecutar más de una vez. No añade ninguna columna a tablas
-- ya existentes que el usuario tuviera datos — es una tabla nueva
-- (`configuracion_taller`, con una única fila) más un trigger nuevo.
-- =============================================================

-- 1. Configuración del taller (fila única, id fijo = 1): de momento solo
-- guarda cuántas citas caben a la vez en la misma franja horaria de la
-- Agenda ("plazas de trabajo simultáneas" — elevadores/puestos), editable
-- por dueño/encargado/admin desde la propia Agenda. Por defecto 2, hasta
-- que se cambie desde la app.
create table if not exists configuracion_taller (
  id smallint primary key default 1 check (id = 1),
  plazas_simultaneas integer not null default 2
);
insert into configuracion_taller (id, plazas_simultaneas)
  values (1, 2)
  on conflict (id) do nothing;

alter table configuracion_taller enable row level security;
drop policy if exists "Personal lee configuración" on configuracion_taller;
create policy "Personal lee configuración" on configuracion_taller
  for select using (es_personal());
drop policy if exists "Encargado edita configuración" on configuracion_taller;
create policy "Encargado edita configuración" on configuracion_taller
  for update using (es_encargado()) with check (es_encargado());

-- 2. Restringe la ASIGNACIÓN de un coche de sustitución (préstamo) a
-- dueño/encargado/admin a nivel de BASE DE DATOS. Hasta ahora (batch 19,
-- parte 3) esto solo se ocultaba en la interfaz — un mecánico con acceso
-- directo a la API podía saltárselo. Se dispara solo cuando
-- `coche_repuesto_id` CAMBIA a un valor no nulo (se presta un coche nuevo o
-- se reasigna); DEVOLVER uno (que solo toca `fecha_devolucion_repuesto`)
-- sigue abierto a cualquier personal, como ya se pedía.
create or replace function restringir_prestamo_repuesto()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.coche_repuesto_id is distinct from old.coche_repuesto_id
     and new.coche_repuesto_id is not null
     and not es_encargado() then
    raise exception 'Solo un dueño, encargado o administrador puede prestar un coche de sustitución.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restringir_prestamo_repuesto on ordenes_trabajo;
create trigger trg_restringir_prestamo_repuesto
  before update on ordenes_trabajo
  for each row execute function restringir_prestamo_repuesto();
