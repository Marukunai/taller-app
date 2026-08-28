-- =============================================================
-- TallerGo · Migración incremental: solicitud del Portal → orden de trabajo
-- Ejecutar en el SQL Editor de tu proyecto Supabase si ya tenías la app
-- instalada (si es una instalación nueva, `schema.sql` ya incluye esto).
--
-- Permite que, al aceptar una solicitud del Portal de cliente, se cree ya
-- una orden de trabajo en estado "solicitado" (visible en el Panel de
-- gestión para hacerle seguimiento hasta que el cliente trae el coche),
-- en vez de que la solicitud aceptada se quede solo en su propia bandeja.
--
-- La orden creada así todavía no tiene vehículo/cliente en las tablas
-- `vehiculos`/`clientes` (eso se rellena en la recepción real, cuando el
-- cliente presenta el coche) — por eso `vehiculo_id` pasa a admitir NULL
-- y la orden guarda de momento los datos que dio el cliente a través de
-- la relación con `solicitudes`.
-- =============================================================

alter table ordenes_trabajo alter column vehiculo_id drop not null;
alter table ordenes_trabajo add column if not exists solicitud_id uuid references solicitudes(id);
