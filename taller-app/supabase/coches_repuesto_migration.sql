-- =============================================================
-- TallerGo · Migración incremental: coches de sustitución (flota propia)
-- Ejecutar en el SQL Editor de tu proyecto Supabase si ya tenías la app
-- instalada (si es una instalación nueva, `schema.sql` ya incluye esto).
--
-- Añade una flota propia de coches de sustitución que se pueden prestar a
-- un cliente mientras dura el servicio de su vehículo, con disponibilidad
-- (libre/prestado) calculada a partir de las órdenes de trabajo activas —
-- no hace falta gestionar la disponibilidad a mano.
-- =============================================================

-- 1. Catálogo propio de la flota (independiente de clientes/vehículos).
create table if not exists coches_repuesto (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  matricula text not null unique,
  marca text,
  modelo text,
  notas text,
  -- Dado de baja de la flota (p. ej. se vendió) SIN borrar la fila, para
  -- no perder el histórico de préstamos que la referencian.
  baja boolean not null default false
);

-- 2. A quién se le presta cada coche, y cuándo, se guarda directamente en
--    la orden de trabajo — un coche está "libre" si ninguna orden sin
--    devolver lo tiene asignado (fecha_devolucion_repuesto is null).
alter table ordenes_trabajo
  add column if not exists coche_repuesto_id uuid references coches_repuesto(id);
alter table ordenes_trabajo add column if not exists fecha_prestamo_repuesto timestamp with time zone;
alter table ordenes_trabajo add column if not exists fecha_devolucion_repuesto timestamp with time zone;

-- 3. RLS: cualquier personal puede consultar la flota (un mecánico
--    necesita verla para asignar un coche al entregar el suyo al
--    cliente), pero solo el encargado puede dar de alta/editar/dar de
--    baja coches — igual que con almacenes/inventario. Asignar o devolver
--    un coche a una orden es un UPDATE sobre `ordenes_trabajo`, ya
--    cubierto por la política "Personal Ordenes" existente.
alter table coches_repuesto enable row level security;
drop policy if exists "Personal Coches Repuesto lectura" on coches_repuesto;
create policy "Personal Coches Repuesto lectura" on coches_repuesto
  for select using (es_personal());
drop policy if exists "Encargado Coches Repuesto crea" on coches_repuesto;
create policy "Encargado Coches Repuesto crea" on coches_repuesto
  for insert with check (es_encargado());
drop policy if exists "Encargado Coches Repuesto actualiza" on coches_repuesto;
create policy "Encargado Coches Repuesto actualiza" on coches_repuesto
  for update using (es_encargado()) with check (es_encargado());
drop policy if exists "Encargado Coches Repuesto borra" on coches_repuesto;
create policy "Encargado Coches Repuesto borra" on coches_repuesto
  for delete using (es_encargado());
