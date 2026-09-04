-- =============================================================
-- Migración incremental — Batch 24: soporte para motos.
-- Segura de re-ejecutar más de una vez.
--
-- Hasta ahora la app solo contemplaba coches. Se añade una columna
-- `tipo_vehiculo` ('coche' | 'moto', por defecto 'coche' para no romper
-- filas existentes) a las 3 tablas que representan un vehículo:
-- `vehiculos`, `solicitudes` (el cliente ya elige el tipo al pedir cita) y
-- `coches_repuesto` (la flota de vehículos de sustitución también puede
-- tener motos — el nombre de la tabla y de la columna
-- `coche_repuesto_id` en `ordenes_trabajo` se quedan como están para no
-- renombrar media base de datos por esto; en la UI ya se habla de
-- "vehículo de sustitución" en general, no de "coche de sustitución").
--
-- Solo cambia el esquema — no hace falta backfill de datos: todo lo
-- existente queda marcado 'coche' por el valor por defecto, que es
-- correcto porque hasta este batch la app no gestionaba motos.
-- =============================================================

alter table vehiculos add column if not exists tipo_vehiculo text not null default 'coche';
do $$
begin
  alter table vehiculos add constraint vehiculos_tipo_vehiculo_check check (tipo_vehiculo in ('coche', 'moto'));
exception when duplicate_object then
  null;
end $$;

alter table solicitudes add column if not exists tipo_vehiculo text not null default 'coche';
do $$
begin
  alter table solicitudes add constraint solicitudes_tipo_vehiculo_check check (tipo_vehiculo in ('coche', 'moto'));
exception when duplicate_object then
  null;
end $$;

alter table coches_repuesto add column if not exists tipo_vehiculo text not null default 'coche';
do $$
begin
  alter table coches_repuesto add constraint coches_repuesto_tipo_vehiculo_check check (tipo_vehiculo in ('coche', 'moto'));
exception when duplicate_object then
  null;
end $$;
