-- =============================================================
-- Migración incremental — Batch 20: mejoras varias sobre el MVP ya en
-- producción, todas independientes entre sí. Segura de re-ejecutar más de
-- una vez (usa `if not exists` / `drop policy if exists` / bloques con
-- manejo de excepción donde hace falta). NO toca nada de lo aparcado a
-- propósito para más adelante (suscripción/multi-tenant, envío automático
-- real del aviso anual).
--
-- Incluye:
-- 1. Mecánico asignado a una orden (para filtrar en el Panel de gestión).
-- 2. "Pagado" en el presupuesto/factura interna.
-- 3. Valoración del cliente (1-5 estrellas + comentario) al entregar.
-- 4. Consentimiento RGPD del cliente al crear una solicitud desde el Portal.
-- 5. Acceso de lectura del cliente a su propia orden e inspección de
--    entrada (para ver la barra de progreso, fotos/daños y los PDF desde
--    el Portal), y de escritura ÚNICAMENTE sobre su valoración.
-- 6. `ordenes_trabajo` añadida a la publicación de Realtime (para el
--    aviso visual en el Portal cuando cambia el estado de su solicitud).
-- =============================================================

-- --- 1. Mecánico asignado ---
alter table ordenes_trabajo add column if not exists mecanico_asignado_id uuid references perfiles(id);

-- --- 2. Pagado (presupuesto/factura interna) ---
alter table presupuestos add column if not exists pagado boolean not null default false;
alter table presupuestos add column if not exists pagado_en timestamp with time zone;

-- --- 3. Valoración del cliente al entregar ---
alter table ordenes_trabajo add column if not exists valoracion_estrellas smallint
  check (valoracion_estrellas is null or (valoracion_estrellas between 1 and 5));
alter table ordenes_trabajo add column if not exists valoracion_comentario text;
alter table ordenes_trabajo add column if not exists valoracion_en timestamp with time zone;

-- --- 4. Consentimiento RGPD en la solicitud del Portal ---
alter table solicitudes add column if not exists rgpd_aceptado boolean not null default false;
alter table solicitudes add column if not exists rgpd_aceptado_en timestamp with time zone;

-- --- 5. Lectura del cliente sobre su propia orden e inspección de entrada ---
-- Hasta ahora "Personal Ordenes"/"Personal Inspecciones" eran las ÚNICAS
-- políticas de estas dos tablas — un cliente no podía leer ninguna fila.
-- Estas políticas nuevas se apoyan en el mismo patrón ya usado en
-- `presupuestos` (schema.sql): solo por `solicitud_id` +
-- `solicitudes.cliente_auth_id`, nunca dan acceso a nada de otro cliente.
drop policy if exists "Cliente ve su propia orden" on ordenes_trabajo;
create policy "Cliente ve su propia orden" on ordenes_trabajo
  for select using (
    solicitud_id is not null
    and exists (select 1 from solicitudes where id = ordenes_trabajo.solicitud_id and cliente_auth_id = auth.uid())
  );

drop policy if exists "Cliente ve su propia inspección de entrada" on inspecciones_entrada;
create policy "Cliente ve su propia inspección de entrada" on inspecciones_entrada
  for select using (
    exists (
      select 1 from ordenes_trabajo o
      join solicitudes s on s.id = o.solicitud_id
      where o.id = inspecciones_entrada.orden_id and s.cliente_auth_id = auth.uid()
    )
  );

-- El cliente puede dejar su valoración (1-5 estrellas + comentario
-- opcional) SOLO cuando la orden ya está 'entregado' y es la suya —
-- ver el trigger de abajo, que bloquea con RAISE EXCEPTION cualquier otro
-- cambio que no sea a las 3 columnas de valoración (RLS no distingue
-- columnas, solo filas, así que la protección real vive en el trigger).
drop policy if exists "Cliente valora su orden entregada" on ordenes_trabajo;
create policy "Cliente valora su orden entregada" on ordenes_trabajo
  for update
  using (
    estado = 'entregado'
    and solicitud_id is not null
    and exists (select 1 from solicitudes where id = ordenes_trabajo.solicitud_id and cliente_auth_id = auth.uid())
  )
  with check (
    estado = 'entregado'
    and solicitud_id is not null
    and exists (select 1 from solicitudes where id = ordenes_trabajo.solicitud_id and cliente_auth_id = auth.uid())
  );

create or replace function bloquear_cambio_cliente_orden()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- El personal (cualquier rol) sigue teniendo vía libre — esta
  -- comprobación es solo para la política nueva de arriba, que es la
  -- única que permite a una cuenta 'cliente' hacer un UPDATE aquí.
  if es_personal() then
    return new;
  end if;
  if old.valoracion_estrellas is not null then
    raise exception 'Esta orden ya tiene una valoración registrada.';
  end if;
  if new.valoracion_estrellas is null then
    raise exception 'Elige una puntuación de 1 a 5 estrellas.';
  end if;
  -- Cualquier columna que no sea una de las 3 de valoración debe quedar
  -- EXACTAMENTE igual — así un cliente no puede aprovechar esta política
  -- de UPDATE para tocar el estado, las fechas, el presupuesto implícito,
  -- etc. de su propia orden llamando directamente a la API.
  if (to_jsonb(new) - array['valoracion_estrellas', 'valoracion_comentario', 'valoracion_en'])
     is distinct from
     (to_jsonb(old) - array['valoracion_estrellas', 'valoracion_comentario', 'valoracion_en'])
  then
    raise exception 'Un cliente solo puede dejar su valoración en una orden ya entregada.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_cambio_cliente_orden on ordenes_trabajo;
create trigger trg_bloquear_cambio_cliente_orden
  before update on ordenes_trabajo
  for each row execute function bloquear_cambio_cliente_orden();

-- --- 6. Realtime para `ordenes_trabajo` ---
-- Igual que ya se hizo para `solicitudes` (schema.sql): permite que el
-- Portal de cliente reciba el cambio de estado de su orden al instante,
-- sin recargar la página, para el badge/toast visual. Supabase Realtime
-- respeta la RLS de la tabla con el token de quien está conectado, así que
-- un cliente solo recibe eventos de SUS propias órdenes (las que le deja
-- ver la política "Cliente ve su propia orden" de arriba) — el personal
-- (con "Personal Ordenes") las recibe todas, como ya ocurre con
-- `solicitudes`.
do $$
begin
  execute 'alter publication supabase_realtime add table ordenes_trabajo';
exception when duplicate_object then
  null;
end $$;
