-- =============================================================
-- Taller App · Migración: almacenes múltiples, cancelación de órdenes,
-- servicio de neumáticos, informe de salida y Portal de cliente.
-- Ejecutar en el SQL Editor de tu proyecto Supabase — NO borra nada de lo
-- que ya tengas (clientes, vehículos, órdenes, inspecciones, inventario).
-- Idempotente: se puede ejecutar más de una vez sin duplicar nada.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Almacenes múltiples
-- ---------------------------------------------------------------
create table if not exists almacenes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  nombre text not null unique
);
insert into almacenes (nombre) values ('Almacén 1') on conflict (nombre) do nothing;

-- inventario_items pasa de "nombre único" a "nombre único DENTRO de un
-- almacén" — todo lo que ya tenías se asigna al "Almacén 1" recién creado.
alter table inventario_items add column if not exists almacen_id uuid references almacenes(id);
update inventario_items set almacen_id = (select id from almacenes where nombre = 'Almacén 1')
where almacen_id is null;
alter table inventario_items alter column almacen_id set not null;
alter table inventario_items drop constraint if exists inventario_items_nombre_key;
alter table inventario_items drop constraint if exists inventario_items_nombre_almacen_id_key;
alter table inventario_items add constraint inventario_items_nombre_almacen_id_key unique (nombre, almacen_id);

alter table almacenes enable row level security;

-- ---------------------------------------------------------------
-- 2. Cancelación de órdenes, servicio de neumáticos, cita de recogida e
--    informe de salida — todo columnas nuevas en ordenes_trabajo.
-- ---------------------------------------------------------------
alter table ordenes_trabajo add column if not exists neumaticos_cantidad text;
alter table ordenes_trabajo add column if not exists neumaticos_foto_url text;
alter table ordenes_trabajo add column if not exists motivo_cancelacion text;
alter table ordenes_trabajo add column if not exists cita_recogida timestamp with time zone;
alter table ordenes_trabajo add column if not exists pdf_salida_url text;
-- El estado 'cancelado' no necesita ningún cambio de esquema — `estado` ya
-- era texto libre sin restricción `check`, así que ya lo admite.

-- ---------------------------------------------------------------
-- 3. Perfiles (rol personal/cliente) y función es_personal()
-- ---------------------------------------------------------------
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null default 'cliente' check (rol in ('personal', 'cliente')),
  nombre text,
  email text,
  created_at timestamp with time zone default now()
);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into perfiles (id, rol, nombre, email)
  values (new.id, 'cliente', new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- IMPORTANTE: esto da rol 'personal' a TODAS las cuentas que ya existan en
-- tu proyecto ahora mismo (asumiendo que son las del taller, ya que el
-- Portal de cliente es nuevo y hoy no puede haber todavía clientes reales
-- registrados). Si ejecutas esta migración más adelante y para entonces ya
-- hay clientes reales registrados, avísame antes de correr esta línea —
-- habría que excluirlos a mano.
insert into perfiles (id, rol, nombre, email)
select id, 'personal', raw_user_meta_data->>'full_name', email from auth.users
on conflict (id) do nothing;

create or replace function es_personal()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol = 'personal'
  );
$$;
grant execute on function es_personal() to authenticated;

alter table perfiles enable row level security;
drop policy if exists "Ver propio perfil o ser personal" on perfiles;
create policy "Ver propio perfil o ser personal" on perfiles
  for select using (auth.uid() = id or es_personal());
drop policy if exists "Editar propio perfil" on perfiles;
create policy "Editar propio perfil" on perfiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------
-- 4. Solicitudes (peticiones de servicio desde el Portal de cliente)
-- ---------------------------------------------------------------
create table if not exists solicitudes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  cliente_auth_id uuid not null references auth.users(id) on delete cascade,
  nombre_cliente text not null,
  email_cliente text not null,
  telefono_cliente text,
  matricula text,
  marca text,
  modelo text,
  tipo_servicio text not null,
  descripcion text,
  neumaticos_cantidad text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada', 'cancelada')),
  respuesta_taller text
);
alter table solicitudes enable row level security;
drop policy if exists "Cliente crea sus solicitudes" on solicitudes;
create policy "Cliente crea sus solicitudes" on solicitudes
  for insert with check (auth.uid() = cliente_auth_id);
drop policy if exists "Ver solicitudes propias o ser personal" on solicitudes;
create policy "Ver solicitudes propias o ser personal" on solicitudes
  for select using (auth.uid() = cliente_auth_id or es_personal());
drop policy if exists "Personal gestiona solicitudes" on solicitudes;
create policy "Personal gestiona solicitudes" on solicitudes
  for update using (es_personal()) with check (es_personal());
drop policy if exists "Cliente cancela su propia solicitud pendiente" on solicitudes;
create policy "Cliente cancela su propia solicitud pendiente" on solicitudes
  for update
  using (auth.uid() = cliente_auth_id and estado = 'pendiente')
  with check (auth.uid() = cliente_auth_id and estado = 'cancelada');

-- ---------------------------------------------------------------
-- 5. IMPORTANTE — cerrar el agujero de seguridad: a partir de ahora puede
--    haber cuentas de CLIENTE (no solo de personal) con sesión iniciada.
--    Las políticas antiguas ("Acceso Autenticado ...") daban acceso total a
--    CUALQUIER sesión iniciada — incluida la de un cliente — a los datos de
--    todos los clientes, vehículos, órdenes e inventario. Se sustituyen
--    aquí por políticas que exigen es_personal().
-- ---------------------------------------------------------------
drop policy if exists "Acceso Autenticado Clientes" on clientes;
create policy "Personal Clientes" on clientes
  for all using (es_personal()) with check (es_personal());

drop policy if exists "Acceso Autenticado Vehículos" on vehiculos;
create policy "Personal Vehículos" on vehiculos
  for all using (es_personal()) with check (es_personal());

drop policy if exists "Acceso Autenticado Ordenes" on ordenes_trabajo;
create policy "Personal Ordenes" on ordenes_trabajo
  for all using (es_personal()) with check (es_personal());

drop policy if exists "Acceso Autenticado Inspecciones" on inspecciones_entrada;
create policy "Personal Inspecciones" on inspecciones_entrada
  for all using (es_personal()) with check (es_personal());

drop policy if exists "Acceso Autenticado Inventario" on inventario_items;
create policy "Personal Inventario" on inventario_items
  for all using (es_personal()) with check (es_personal());

drop policy if exists "Acceso Autenticado Piezas Usadas" on piezas_usadas;
create policy "Personal Piezas Usadas" on piezas_usadas
  for all using (es_personal()) with check (es_personal());

drop policy if exists "Personal Almacenes" on almacenes;
create policy "Personal Almacenes" on almacenes
  for all using (es_personal()) with check (es_personal());

drop policy if exists "Acceso Autenticado Storage fotos-vehiculos" on storage.objects;
create policy "Personal Storage fotos-vehiculos"
on storage.objects for all
using (bucket_id = 'fotos-vehiculos' and es_personal())
with check (bucket_id = 'fotos-vehiculos' and es_personal());

drop policy if exists "Acceso Autenticado Storage firmas" on storage.objects;
create policy "Personal Storage firmas"
on storage.objects for all
using (bucket_id = 'firmas' and es_personal())
with check (bucket_id = 'firmas' and es_personal());

drop policy if exists "Acceso Autenticado Storage documentos-pdf" on storage.objects;
create policy "Personal Storage documentos-pdf"
on storage.objects for all
using (bucket_id = 'documentos-pdf' and es_personal())
with check (bucket_id = 'documentos-pdf' and es_personal());

drop policy if exists "Acceso Autenticado Storage inventario-imagenes" on storage.objects;
create policy "Personal Storage inventario-imagenes"
on storage.objects for all
using (bucket_id = 'inventario-imagenes' and es_personal())
with check (bucket_id = 'inventario-imagenes' and es_personal());

-- ---------------------------------------------------------------
-- 6. Las funciones de piezas usadas ahora también comprueban es_personal()
--    ellas mismas (por claridad del error, además de la RLS de arriba).
-- ---------------------------------------------------------------
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
