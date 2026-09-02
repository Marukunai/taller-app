-- =============================================================
-- Taller App · Migración batch 18. Ejecutar una sola vez en el SQL Editor
-- de Supabase. Idempotente: se puede volver a ejecutar sin fallar ni
-- duplicar nada. Incluye 4 cambios independientes:
--
-- 1. Precio por hora en coches de sustitución.
-- 2. Documentación obligatoria del check-in (permiso de conducir o ficha
--    técnica — al menos una de las dos).
-- 3. Cancelar una orden devuelve automáticamente al stock las piezas que
--    se hubieran registrado como usadas en ella (antes se quedaban
--    descontadas del inventario para siempre, aunque el trabajo nunca
--    llegara a completarse).
-- 4. Bucket de Storage para los documentos del punto 2.
--
-- Nota: el tipo de servicio nuevo "PRE ITV" NO necesita ningún cambio de
-- base de datos — la columna `tipo_servicio` de `ordenes_trabajo` y
-- `solicitudes` siempre ha sido texto libre sin restricción CHECK, así que
-- el nuevo valor 'pre_itv' que usa la app ya es válido sin tocar nada aquí.
-- =============================================================

-- --- 1. Precio por hora en coches de sustitución ---
alter table coches_repuesto add column if not exists precio_hora numeric(10,2);

-- --- 2. Documentación del check-in ---
alter table inspecciones_entrada add column if not exists permiso_conducir_url text;
alter table inspecciones_entrada add column if not exists ficha_tecnica_url text;

-- --- 3. Cancelar una orden devuelve las piezas al stock ---
-- `security definer` por el mismo motivo que registrar_pieza_usada/
-- quitar_pieza_usada (schema.sql): un mecánico debe poder cancelar una
-- orden aunque no tenga UPDATE directo sobre inventario_items. Hace en una
-- sola operación atómica lo que antes había que hacer a mano quitando cada
-- pieza usada una a una antes de cancelar (y que nadie hacía en la
-- práctica, dejando el inventario descuadrado).
create or replace function cancelar_orden_devolviendo_stock(
  p_orden_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_pieza record;
begin
  if not es_personal() then
    raise exception 'No autorizado';
  end if;

  for v_pieza in
    select id, item_id, cantidad from piezas_usadas where orden_id = p_orden_id
  loop
    if v_pieza.item_id is not null then
      update inventario_items
      set cantidad = cantidad + v_pieza.cantidad
      where id = v_pieza.item_id;
    end if;
    delete from piezas_usadas where id = v_pieza.id;
  end loop;

  update ordenes_trabajo
  set estado = 'cancelado', motivo_cancelacion = p_motivo
  where id = p_orden_id;
end;
$$;

grant execute on function cancelar_orden_devolviendo_stock(uuid, text) to authenticated;

-- --- 4. Storage: bucket para permiso de conducir / ficha técnica ---
-- Crear desde el panel de Supabase (Storage → New bucket) como "Public" si
-- prefieres hacerlo a mano, o dejar que este script lo cree solo (igual
-- que se hizo con 'inventario-imagenes' en schema.sql):
insert into storage.buckets (id, name, public)
values ('documentos-cliente', 'documentos-cliente', true)
on conflict (id) do nothing;

-- Son documentos internos del taller (igual que fotos-vehiculos/firmas):
-- solo el personal puede subir/ver/gestionar.
drop policy if exists "Personal Storage documentos-cliente" on storage.objects;
create policy "Personal Storage documentos-cliente"
on storage.objects
for all
using (bucket_id = 'documentos-cliente' and es_personal())
with check (bucket_id = 'documentos-cliente' and es_personal());
