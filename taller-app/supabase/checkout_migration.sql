-- =============================================================
-- Taller App · Migración: checkout de salida (segunda firma)
-- Ejecutar en el SQL Editor de Supabase. Necesaria para que la
-- pantalla de "Entrega del vehículo" pueda guardar la firma de
-- conformidad y la fecha real de entrega.
-- =============================================================

alter table ordenes_trabajo
  add column if not exists firma_salida_url text,
  add column if not exists fecha_entrega timestamp with time zone;
