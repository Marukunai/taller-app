-- =============================================================
-- Taller App · Migración: piezas usadas en cada reparación, con
-- descuento automático del stock de inventario.
-- Ejecutar en el SQL Editor de tu proyecto Supabase.
--
-- Esta migración NO borra nada de lo que ya tengas (usa "if not
-- exists"/"create or replace" en todo). Puedes ejecutarla tantas
-- veces como quieras.
-- =============================================================

-- Registro de cada pieza del inventario consumida en una orden de
-- trabajo concreta. Guarda también el nombre del item en el momento de
-- usarlo (nombre_item), por si el item se borra o renombra más adelante
-- en el inventario — así el histórico de la orden no se queda vacío.
create table if not exists piezas_usadas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  orden_id uuid not null references ordenes_trabajo(id) on delete cascade,
  item_id uuid references inventario_items(id) on delete set null,
  nombre_item text not null,
  cantidad int not null check (cantidad > 0)
);

alter table piezas_usadas enable row level security;
create policy "Acceso Autenticado Piezas Usadas" on piezas_usadas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =============================================================
-- Funciones para que registrar/quitar una pieza usada y ajustar el
-- stock del inventario sean una sola operación atómica (evita que se
-- descuente el stock pero falle el registro, o al revés).
-- =============================================================
create or replace function registrar_pieza_usada(
  p_orden_id uuid,
  p_item_id uuid,
  p_cantidad int
)
returns void
language plpgsql
as $$
declare
  v_nombre text;
begin
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
as $$
declare
  v_item_id uuid;
  v_cantidad int;
begin
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

grant execute on function registrar_pieza_usada(uuid, uuid, int) to authenticated;
grant execute on function quitar_pieza_usada(uuid) to authenticated;
