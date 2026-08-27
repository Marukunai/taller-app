-- =============================================================
-- Taller App · Migración: roles finos de personal (encargado/mecánico),
-- reparto de permisos sobre inventario, y notificaciones en tiempo real
-- para el Panel de gestión.
-- Ejecutar en el SQL Editor de tu proyecto Supabase — NO borra nada de lo
-- que ya tengas. Idempotente: se puede ejecutar más de una vez sin fallar
-- ni duplicar nada.
--
-- Requisito: haber ejecutado ya schema.sql o portal_taller_migration.sql
-- (esta migración asume que existen las tablas perfiles, almacenes,
-- inventario_items, solicitudes y la función es_personal()).
-- =============================================================

-- ---------------------------------------------------------------
-- 1. perfiles: de 2 roles ('personal'/'cliente') a 3 ('encargado',
--    'mecanico', 'cliente'). Todo lo que hoy es 'personal' pasa a
--    'encargado' (el rol con más permisos) — los mecánicos con acceso
--    restringido se crean después, uno a uno, desde la pantalla de
--    Gestión de personal (solo visible para un encargado).
-- ---------------------------------------------------------------
alter table perfiles drop constraint if exists perfiles_rol_check;
-- Hay que quitar temporalmente el check para poder actualizar filas que
-- todavía tengan el valor antiguo 'personal', y volver a añadirlo después
-- ya con los 3 valores nuevos.
update perfiles set rol = 'encargado' where rol = 'personal';
alter table perfiles add constraint perfiles_rol_check check (rol in ('encargado', 'mecanico', 'cliente'));

-- ---------------------------------------------------------------
-- 2. Funciones de rol: es_personal() ahora cubre encargado + mecánico, y
--    se añade es_encargado() para lo que solo puede tocar el encargado
--    (inventario/almacenes en escritura, gestión de personal, y en el
--    futuro cualquier precio/coste).
-- ---------------------------------------------------------------
create or replace function es_personal()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol in ('encargado', 'mecanico')
  );
$$;

create or replace function es_encargado()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol = 'encargado'
  );
$$;
grant execute on function es_encargado() to authenticated;

-- ---------------------------------------------------------------
-- 3. Almacenes e inventario: lectura para cualquier personal (un mecánico
--    necesita ver el stock para elegir una pieza usada al cerrar una
--    orden), pero solo el encargado puede crear/editar/borrar.
-- ---------------------------------------------------------------
drop policy if exists "Personal Almacenes" on almacenes;
drop policy if exists "Personal Almacenes lectura" on almacenes;
create policy "Personal Almacenes lectura" on almacenes
  for select using (es_personal());
drop policy if exists "Encargado Almacenes escritura" on almacenes;
create policy "Encargado Almacenes escritura" on almacenes
  for insert with check (es_encargado());
drop policy if exists "Encargado Almacenes actualiza" on almacenes;
create policy "Encargado Almacenes actualiza" on almacenes
  for update using (es_encargado()) with check (es_encargado());
drop policy if exists "Encargado Almacenes borra" on almacenes;
create policy "Encargado Almacenes borra" on almacenes
  for delete using (es_encargado());

drop policy if exists "Personal Inventario" on inventario_items;
drop policy if exists "Personal Inventario lectura" on inventario_items;
create policy "Personal Inventario lectura" on inventario_items
  for select using (es_personal());
drop policy if exists "Encargado Inventario crea" on inventario_items;
create policy "Encargado Inventario crea" on inventario_items
  for insert with check (es_encargado());
drop policy if exists "Encargado Inventario actualiza" on inventario_items;
create policy "Encargado Inventario actualiza" on inventario_items
  for update using (es_encargado()) with check (es_encargado());
drop policy if exists "Encargado Inventario borra" on inventario_items;
create policy "Encargado Inventario borra" on inventario_items
  for delete using (es_encargado());

-- Fotos de inventario: lectura para cualquier personal, escritura solo
-- para el encargado.
drop policy if exists "Personal Storage inventario-imagenes" on storage.objects;
drop policy if exists "Personal Storage inventario-imagenes lectura" on storage.objects;
create policy "Personal Storage inventario-imagenes lectura"
on storage.objects
for select
using (bucket_id = 'inventario-imagenes' and es_personal());
drop policy if exists "Encargado Storage inventario-imagenes escritura" on storage.objects;
create policy "Encargado Storage inventario-imagenes escritura"
on storage.objects
for insert
with check (bucket_id = 'inventario-imagenes' and es_encargado());
drop policy if exists "Encargado Storage inventario-imagenes actualiza" on storage.objects;
create policy "Encargado Storage inventario-imagenes actualiza"
on storage.objects
for update
using (bucket_id = 'inventario-imagenes' and es_encargado())
with check (bucket_id = 'inventario-imagenes' and es_encargado());
drop policy if exists "Encargado Storage inventario-imagenes borra" on storage.objects;
create policy "Encargado Storage inventario-imagenes borra"
on storage.objects
for delete
using (bucket_id = 'inventario-imagenes' and es_encargado());

-- ---------------------------------------------------------------
-- 4. registrar_pieza_usada / quitar_pieza_usada pasan a `security definer`
--    para que un mecánico (sin UPDATE directo sobre inventario_items) siga
--    pudiendo registrar/quitar piezas usadas con normalidad — la función
--    se ejecuta con los privilegios de quien la creó, no con los del
--    mecánico que la invoca.
-- ---------------------------------------------------------------
create or replace function registrar_pieza_usada(
  p_orden_id uuid,
  p_item_id uuid,
  p_cantidad int
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
  v_cantidad int;
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

-- ---------------------------------------------------------------
-- 5. Notificaciones en tiempo real: el Panel de gestión avisa al instante
--    cuando entra una solicitud nueva del Portal de cliente, sin recargar.
--    Envuelto en un bloque con manejo de excepción porque volver a añadir
--    una tabla que ya está en la publicación da error en vez de no hacer
--    nada (por eso esta migración se puede ejecutar más de una vez).
-- ---------------------------------------------------------------
do $$
begin
  execute 'alter publication supabase_realtime add table solicitudes';
exception when duplicate_object then
  null;
end $$;
