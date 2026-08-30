-- Migración incremental — ejecutar una sola vez en el SQL Editor de
-- Supabase. Añade dos cosas independientes de la misma tanda de cambios:
--
-- 1. Cantidades decimales en inventario/piezas usadas: hasta ahora
--    `cantidad` era `int`, así que un consumo fraccionario (ej. 0.5 L o
--    5.5 L de aceite, según el coche) se rechazaba. Se pasa a `numeric`.
--
-- 2. Solicitudes de cita creadas por el propio personal (no solo desde el
--    Portal de cliente): para la nueva pestaña "Solicitud de cita", que
--    separa la reserva de la cita (datos del dueño y del vehículo, sin
--    coche físicamente en el taller todavía) del check-in real (daños,
--    kilometraje y firma) — útil para una llamada telefónica o un cliente
--    sin cuenta del Portal. Antes, `solicitudes.cliente_auth_id` era
--    obligatorio (solo lo podía crear un cliente desde su propia cuenta).

-- --- 1. Cantidades decimales ---

alter table inventario_items alter column cantidad type numeric(10,2);
alter table piezas_usadas alter column cantidad type numeric(10,2);

create or replace function registrar_pieza_usada(
  p_orden_id uuid,
  p_item_id uuid,
  p_cantidad numeric
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_nombre text;
begin
  if not es_personal() then
    raise exception 'No autorizado';
  end if;

  select nombre into v_nombre from inventario_items where id = p_item_id;
  if v_nombre is null then
    raise exception 'Item de inventario no encontrado';
  end if;
  if p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  insert into piezas_usadas (orden_id, item_id, nombre_item, cantidad)
  values (p_orden_id, p_item_id, v_nombre, p_cantidad);

  update inventario_items
  set cantidad = greatest(0, cantidad - p_cantidad)
  where id = p_item_id;
end;
$$;

create or replace function quitar_pieza_usada(p_registro_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item_id uuid;
  v_cantidad numeric;
begin
  if not es_personal() then
    raise exception 'No autorizado';
  end if;

  select item_id, cantidad into v_item_id, v_cantidad
  from piezas_usadas
  where id = p_registro_id;

  if not found then
    raise exception 'Registro no encontrado';
  end if;

  delete from piezas_usadas where id = p_registro_id;

  if v_item_id is not null then
    update inventario_items
    set cantidad = cantidad + v_cantidad
    where id = v_item_id;
  end if;
end;
$$;

-- --- 2. Solicitud de cita creada por el personal ---

alter table solicitudes alter column cliente_auth_id drop not null;
alter table solicitudes alter column email_cliente drop not null;

drop policy if exists "Personal crea solicitudes" on solicitudes;
create policy "Personal crea solicitudes" on solicitudes
  for insert with check (es_personal());
