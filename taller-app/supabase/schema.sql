-- =============================================================
-- Taller App · Esquema de base de datos (Supabase / PostgreSQL)
-- Ejecutar completo en el SQL Editor de tu proyecto Supabase.
-- =============================================================

-- 1. TABLA DE CLIENTES
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  nombre text not null,
  dni text unique not null,
  telefono text not null,
  email text
);

-- 2. TABLA DE VEHÍCULOS
create table if not exists vehiculos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  matricula text unique not null,
  marca text,
  modelo text,
  color text,        -- para distinguir el vehículo de un vistazo en el panel
  cliente_id uuid references clientes(id) on delete cascade
);

-- 3. TABLA DE ÓRDENES DE TRABAJO
create table if not exists ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  vehiculo_id uuid references vehiculos(id),
  estado text default 'solicitado', -- 'solicitado' | 'recepcionado' | 'en_proceso' | 'listo' | 'entregado' | 'cancelado'
  tipo_servicio text not null,      -- 'mantenimiento' | 'neumaticos' | 'averia'
  descripcion_averia text,
  fecha_entrada timestamp with time zone,
  fecha_salida_estimada timestamp with time zone,
  firma_salida_url text,        -- firma de conformidad al entregar el vehículo
  fecha_entrega timestamp with time zone,
  -- Solo se rellenan cuando tipo_servicio = 'neumaticos':
  neumaticos_cantidad text,     -- '2_delanteros' | '2_traseros' | 'las_4' | 'delantero_izquierdo' | ...
  neumaticos_foto_url text,     -- foto del neumático actual, para ver el estado/medida sin escribirla a mano
  -- Cancelación: la orden NO se borra, solo cambia de estado (histórico
  -- completo conservado) — motivo_cancelacion es opcional, texto libre.
  motivo_cancelacion text,
  -- Cita concertada con el cliente para recoger el vehículo, al marcarlo
  -- como "Listo" desde el Panel de gestión.
  cita_recogida timestamp with time zone,
  -- Informe PDF generado al ENTREGAR el vehículo (distinto del informe de
  -- entrada, que vive en inspecciones_entrada.pdf_informe_url).
  pdf_salida_url text
);

-- 4. TABLA DE INSPECCIONES DE ENTRADA (CHECK-IN & DAÑOS)
create table if not exists inspecciones_entrada (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid references ordenes_trabajo(id) on delete cascade,
  kilometraje int not null,
  nivel_combustible text not null, -- '1/4' | '1/2' | '3/4' | 'Lleno'
  fotos_urls text[],               -- URLs en Supabase Storage
  daños_coordenadas jsonb,         -- [{ longitudinal, lateral, altura, tipo, observacion? }, ...]
  observaciones text,               -- notas generales del estado del vehículo
  firma_cliente_url text not null,
  pdf_informe_url text,
  created_at timestamp with time zone default now()
);

-- 5a. TABLA DE ALMACENES
-- La mayoría de talleres tienen uno solo ("Almacén 1"), pero una cadena con
-- varias naves puede tener más — cada uno con su propio stock. Se crea
-- siempre al menos un "Almacén 1" para que la app funcione sin configurar
-- nada más en talleres de una sola nave.
create table if not exists almacenes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  nombre text not null unique
);
insert into almacenes (nombre) values ('Almacén 1') on conflict (nombre) do nothing;

-- 5b. TABLA DE INVENTARIO (repuestos y materiales del taller)
-- Catálogo propio del taller, independiente de clientes/vehículos/órdenes.
-- Cada item pertenece a un almacén (almacen_id) — el mismo repuesto en dos
-- almacenes son dos filas independientes, con su propio stock.
create table if not exists inventario_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  nombre text not null,
  tipo text not null,      -- categoría: 'Frenos', 'Filtros', 'Neumáticos'...
  tamano text,             -- talla/medida si aplica (ej. '205/55 R16'), si no null
  cantidad int not null default 0,
  imagen_url text,         -- foto opcional para distinguir el item visualmente
  almacen_id uuid not null references almacenes(id) on delete cascade,
  unique (nombre, almacen_id)
);

-- 6. TABLA DE PIEZAS USADAS (consumo de inventario por orden de trabajo)
-- Cada fila es una pieza del inventario gastada en una reparación concreta.
-- Guarda el nombre del item en el momento de usarlo, para conservar el
-- histórico aunque el item se borre o renombre después en el inventario.
create table if not exists piezas_usadas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  orden_id uuid not null references ordenes_trabajo(id) on delete cascade,
  item_id uuid references inventario_items(id) on delete set null,
  nombre_item text not null,
  cantidad int not null check (cantidad > 0)
);

-- 7. TABLA DE PERFILES (rol de cada cuenta de Supabase Auth)
-- Todo el mundo con sesión iniciada es un usuario de Supabase Auth, pero
-- puede ser una de tres cosas muy distintas: 'encargado' (gestiona el
-- taller: inventario, personal y todo lo demás), 'mecanico' (personal del
-- taller pero SIN acceso a Inventario ni a Gestión de personal, ni a
-- ningún dato de precios/costes que pueda añadirse en el futuro), o
-- 'cliente' (una cuenta que el propio cliente se crea desde el Portal de
-- cliente para pedir cita sin pasar por el mecánico). Sin esta distinción,
-- cualquier cliente con sesión iniciada tendría acceso total a los datos
-- de TODOS los clientes y al inventario — por eso las políticas de abajo ya
-- no usan solo "auth.role() = 'authenticated'", sino "es_personal()" (o
-- "es_encargado()" para lo que solo puede tocar el encargado).
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null default 'cliente' check (rol in ('encargado', 'mecanico', 'cliente')),
  nombre text,
  email text,
  -- Cuenta de personal desactivada desde "Gestión de personal" (p. ej. un
  -- mecánico que ya no trabaja en el taller) — no se borra nada, solo deja
  -- de contar como personal a efectos de es_personal()/es_encargado() de
  -- abajo, y se le bloquea el login (ban_duration) desde la Edge Function
  -- administrar-cuenta-personal. Siempre true para cuentas de cliente.
  activo boolean not null default true,
  created_at timestamp with time zone default now()
);
alter table perfiles add column if not exists activo boolean not null default true;

-- Se crea automáticamente un perfil (por defecto 'cliente') cada vez que
-- se registra una cuenta nueva en Supabase Auth — así el Portal de cliente
-- funciona nada más registrarse, sin ningún paso manual.
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

-- Si ya tenías cuentas de personal creadas ANTES de ejecutar esto (el
-- trigger de arriba solo actúa en registros nuevos), se les da rol
-- 'encargado' automáticamente aquí, asumiendo que toda cuenta que existiera
-- ya en tu proyecto es del personal del taller (el Portal de cliente es
-- nuevo, así que a fecha de hoy no puede haber todavía clientes reales).
-- Se les da 'encargado' (el rol con más permisos) porque son las cuentas
-- que ya usa el taller a diario — los mecánicos con acceso restringido se
-- crean después, uno a uno, desde la pantalla de Gestión de personal.
insert into perfiles (id, rol, nombre, email)
select id, 'encargado', raw_user_meta_data->>'full_name', email from auth.users
on conflict (id) do nothing;

-- Funciones auxiliares para las políticas de abajo. `security definer` para
-- poder leer `perfiles` sin depender de que la propia política de perfiles
-- se lo permita.
-- ¿La sesión actual es de CUALQUIER personal del taller (encargado o
-- mecánico)? Se usa para lo que ambos roles pueden ver/hacer por igual.
-- Ambas funciones exigen además `activo` — una cuenta de personal
-- desactivada (ver columna de arriba) pierde el acceso al instante en
-- TODAS las políticas de abajo, sin depender de que su sesión/token
-- caduque ni de que el ban de Supabase Auth ya haya surtido efecto.
create or replace function es_personal()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol in ('encargado', 'mecanico') and activo
  );
$$;

-- ¿La sesión actual es del ENCARGADO? Se usa para lo que un mecánico no
-- debe poder hacer: gestionar el inventario/almacenes, crear/gestionar
-- cuentas de personal, o (en el futuro) ver precios/costes.
create or replace function es_encargado()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol = 'encargado' and activo
  );
$$;

-- 8. TABLA DE SOLICITUDES (peticiones de servicio desde el Portal de cliente)
-- Un cliente con su propia cuenta pide un servicio ("quiero una revisión de
-- mantenimiento...") sin llamar por teléfono ni pasar por el mecánico. Es un
-- aviso previo, NO un check-in — cuando el vehículo llega físicamente al
-- taller, el check-in real (fotos, daños, firma) se sigue haciendo desde el
-- Check-in normal, igual que siempre.
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

-- Notificaciones en tiempo real: el Panel de gestión avisa al instante
-- (sin recargar) cuando entra una solicitud nueva del Portal de cliente.
-- Envuelto en un bloque con manejo de excepción porque volver a añadir una
-- tabla que ya está en la publicación da error en vez de no hacer nada
-- (por eso este script se puede ejecutar más de una vez sin fallar).
do $$
begin
  execute 'alter publication supabase_realtime add table solicitudes';
exception when duplicate_object then
  null;
end $$;

-- 9. TABLA DE COCHES DE SUSTITUCIÓN (flota propia de préstamo)
-- Catálogo propio del taller (como `almacenes`), independiente de
-- clientes/vehículos/órdenes. A quién se le presta cada uno, y cuándo, se
-- guarda en `ordenes_trabajo` (ver columnas añadidas más abajo) — un coche
-- está "libre" si ninguna orden sin devolver lo tiene asignado. `baja` es
-- un dado de baja de la flota (p. ej. se vendió) SIN borrar la fila, para
-- no perder el histórico de préstamos que la referencian.
create table if not exists coches_repuesto (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  matricula text not null unique,
  marca text,
  modelo text,
  notas text,
  baja boolean not null default false
);

-- Columnas añadidas a `ordenes_trabajo` en batches posteriores al DDL
-- original de la tabla (arriba, sección 3) — con `alter table ... add
-- column if not exists` porque referencian tablas (`solicitudes`,
-- `coches_repuesto`) creadas más abajo en este mismo script, así que no
-- podían ir en el CREATE TABLE inicial de la sección 3.
alter table ordenes_trabajo add column if not exists solicitud_id uuid references solicitudes(id);
alter table ordenes_trabajo
  add column if not exists coche_repuesto_id uuid references coches_repuesto(id);
alter table ordenes_trabajo add column if not exists fecha_prestamo_repuesto timestamp with time zone;
alter table ordenes_trabajo add column if not exists fecha_devolucion_repuesto timestamp with time zone;

-- =============================================================
-- Row Level Security
-- =============================================================
alter table clientes enable row level security;
create policy "Personal Clientes" on clientes
  for all using (es_personal()) with check (es_personal());

alter table vehiculos enable row level security;
create policy "Personal Vehículos" on vehiculos
  for all using (es_personal()) with check (es_personal());

alter table ordenes_trabajo enable row level security;
create policy "Personal Ordenes" on ordenes_trabajo
  for all using (es_personal()) with check (es_personal());

alter table inspecciones_entrada enable row level security;
create policy "Personal Inspecciones" on inspecciones_entrada
  for all using (es_personal()) with check (es_personal());

-- Almacenes e inventario: CUALQUIER personal (encargado o mecánico) puede
-- CONSULTARLOS (un mecánico necesita ver el stock para elegir una pieza
-- usada al cerrar una orden), pero solo el ENCARGADO puede crear almacenes
-- o editar/crear/borrar items del inventario — no se puede tener un único
-- "for all" con distinto USING según la operación, así que se separa en
-- una política de lectura y otra de escritura por tabla.
alter table almacenes enable row level security;
drop policy if exists "Personal Almacenes" on almacenes;
create policy "Personal Almacenes lectura" on almacenes
  for select using (es_personal());
create policy "Encargado Almacenes escritura" on almacenes
  for insert with check (es_encargado());
create policy "Encargado Almacenes actualiza" on almacenes
  for update using (es_encargado()) with check (es_encargado());
create policy "Encargado Almacenes borra" on almacenes
  for delete using (es_encargado());

alter table inventario_items enable row level security;
drop policy if exists "Personal Inventario" on inventario_items;
create policy "Personal Inventario lectura" on inventario_items
  for select using (es_personal());
create policy "Encargado Inventario crea" on inventario_items
  for insert with check (es_encargado());
create policy "Encargado Inventario actualiza" on inventario_items
  for update using (es_encargado()) with check (es_encargado());
create policy "Encargado Inventario borra" on inventario_items
  for delete using (es_encargado());

alter table piezas_usadas enable row level security;
create policy "Personal Piezas Usadas" on piezas_usadas
  for all using (es_personal()) with check (es_personal());

alter table perfiles enable row level security;
-- Cada cuenta ve/edita su propio perfil (necesario para que el Portal de
-- cliente pueda leer su propio rol/nombre); el personal puede ver todos.
create policy "Ver propio perfil o ser personal" on perfiles
  for select using (auth.uid() = id or es_personal());
create policy "Editar propio perfil" on perfiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

alter table solicitudes enable row level security;
-- El cliente crea y ve sus propias solicitudes; el personal las ve todas.
create policy "Cliente crea sus solicitudes" on solicitudes
  for insert with check (auth.uid() = cliente_auth_id);
create policy "Ver solicitudes propias o ser personal" on solicitudes
  for select using (auth.uid() = cliente_auth_id or es_personal());
-- El personal puede actualizar cualquier solicitud (aceptar/rechazar).
create policy "Personal gestiona solicitudes" on solicitudes
  for update using (es_personal()) with check (es_personal());
-- El cliente solo puede cancelar (pendiente → cancelada) su propia
-- solicitud, no editar ningún otro campo de fondo.
create policy "Cliente cancela su propia solicitud pendiente" on solicitudes
  for update
  using (auth.uid() = cliente_auth_id and estado = 'pendiente')
  with check (auth.uid() = cliente_auth_id and estado = 'cancelada');

-- Coches de sustitución: CUALQUIER personal puede consultarlos (un
-- mecánico necesita ver la flota para asignar uno al entregar el suyo al
-- cliente), pero solo el ENCARGADO puede dar de alta/editar/dar de baja
-- coches de la flota — igual que con almacenes/inventario. Asignar o
-- devolver un coche a una orden concreta es un UPDATE sobre
-- `ordenes_trabajo`, ya cubierto por "Personal Ordenes" de arriba (no hace
-- falta ninguna política nueva para eso).
alter table coches_repuesto enable row level security;
create policy "Personal Coches Repuesto lectura" on coches_repuesto
  for select using (es_personal());
create policy "Encargado Coches Repuesto crea" on coches_repuesto
  for insert with check (es_encargado());
create policy "Encargado Coches Repuesto actualiza" on coches_repuesto
  for update using (es_encargado()) with check (es_encargado());
create policy "Encargado Coches Repuesto borra" on coches_repuesto
  for delete using (es_encargado());

-- =============================================================
-- Storage: crea estos 3 buckets desde el panel de Supabase
-- (Storage → New bucket) y márcalos como "Public":
--   - fotos-vehiculos   (fotos de la inspección)
--   - firmas            (PNG de las firmas manuscritas)
--   - documentos-pdf    (informes/PDF generados)
-- El cuarto bucket, de las fotos del inventario, se crea solo con este
-- script (no hace falta crearlo a mano):
-- =============================================================
insert into storage.buckets (id, name, public)
values ('inventario-imagenes', 'inventario-imagenes', true)
on conflict (id) do nothing;

-- IMPORTANTE: marcar un bucket como "Public" solo permite LEER los
-- archivos públicamente. Para poder SUBIRLOS hacen falta además estas
-- políticas propias en storage.objects — son datos internos del taller
-- (fotos de vehículos, firmas, informes, inventario), así que solo el
-- personal puede subir/gestionar, igual que con las tablas de arriba:
-- =============================================================
create policy "Personal Storage fotos-vehiculos"
on storage.objects
for all
using (bucket_id = 'fotos-vehiculos' and es_personal())
with check (bucket_id = 'fotos-vehiculos' and es_personal());

create policy "Personal Storage firmas"
on storage.objects
for all
using (bucket_id = 'firmas' and es_personal())
with check (bucket_id = 'firmas' and es_personal());

create policy "Personal Storage documentos-pdf"
on storage.objects
for all
using (bucket_id = 'documentos-pdf' and es_personal())
with check (bucket_id = 'documentos-pdf' and es_personal());

-- Las fotos de inventario se pueden VER por cualquier personal, pero solo
-- el encargado puede subir/reemplazar/borrar (igual que con las tablas).
drop policy if exists "Personal Storage inventario-imagenes" on storage.objects;
create policy "Personal Storage inventario-imagenes lectura"
on storage.objects
for select
using (bucket_id = 'inventario-imagenes' and es_personal());
create policy "Encargado Storage inventario-imagenes escritura"
on storage.objects
for insert
with check (bucket_id = 'inventario-imagenes' and es_encargado());
create policy "Encargado Storage inventario-imagenes actualiza"
on storage.objects
for update
using (bucket_id = 'inventario-imagenes' and es_encargado())
with check (bucket_id = 'inventario-imagenes' and es_encargado());
create policy "Encargado Storage inventario-imagenes borra"
on storage.objects
for delete
using (bucket_id = 'inventario-imagenes' and es_encargado());

-- =============================================================
-- Funciones para registrar/quitar una pieza usada en una orden y
-- ajustar el stock del inventario como una sola operación atómica
-- (evita que se descuente el stock pero falle el registro, o al revés).
-- Comprueban es_personal() ellas mismas (además de la RLS de las tablas
-- que tocan) para dar un error claro si algún día se llaman sin ser
-- personal del taller, en vez de fallar a medias por RLS.
-- =============================================================
-- `security definer`: un mecánico puede llamar a esta función aunque no
-- tenga permiso de UPDATE directo sobre inventario_items (reservado al
-- encargado) — la función se ejecuta con los privilegios de quien la creó,
-- no con los del mecánico que la invoca, así que el descuento de stock
-- funciona igual para ambos roles. La comprobación interna es_personal()
-- sigue ahí para dar un error claro si algún día se llama sin ser
-- personal del taller, en vez de fallar a medias por RLS.
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

-- `security definer` por el mismo motivo que registrar_pieza_usada de
-- arriba: un mecánico debe poder revertir el registro de una pieza usada
-- aunque no tenga UPDATE directo sobre inventario_items.
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

grant execute on function registrar_pieza_usada(uuid, uuid, int) to authenticated;
grant execute on function quitar_pieza_usada(uuid) to authenticated;
grant execute on function es_personal() to authenticated;
grant execute on function es_encargado() to authenticated;

-- =============================================================
-- Datos de prueba (seed) — opcional, útil para probar el formulario
-- =============================================================
insert into clientes (id, nombre, dni, telefono, email)
values ('a1b2c3d4-e5f6-7890-abcd-1234567890ab', 'Juan Pérez', '12345678X', '600112233', 'juan@example.com')
on conflict (dni) do nothing;

insert into vehiculos (id, matricula, marca, modelo, color, cliente_id)
values ('b2c3d4e5-f6a7-8901-bcde-2345678901bc', '1234BBB', 'Seat', 'Ibiza', 'Rojo', 'a1b2c3d4-e5f6-7890-abcd-1234567890ab')
on conflict (matricula) do nothing;

-- =============================================================
-- Catálogo inicial de inventario — items habituales de un taller
-- mecánico generalista, para no empezar de cero. Si os falta algo, se
-- añade desde la propia app (pestaña "Inventario"). Todo va al "Almacén 1"
-- creado más arriba — si el taller tiene más de una nave, los items de las
-- demás se añaden a mano desde la app tras crear el almacén correspondiente.
-- =============================================================
insert into inventario_items (nombre, tipo, tamano, cantidad, almacen_id)
select v.nombre, v.tipo, v.tamano, v.cantidad, (select id from almacenes where nombre = 'Almacén 1')
from (values
  ('Aceite motor 5W30', 'Aceites y lubricantes', '5L', 20),
  ('Aceite motor 5W40', 'Aceites y lubricantes', '5L', 20),
  ('Aceite motor 10W40', 'Aceites y lubricantes', '5L', 15),
  ('Aceite motor 15W40', 'Aceites y lubricantes', '5L', 10),
  ('Líquido de frenos DOT4', 'Aceites y lubricantes', '500ml', 15),
  ('Líquido refrigerante concentrado', 'Aceites y lubricantes', '5L', 10),
  ('Grasa multiusos', 'Aceites y lubricantes', '400g', 8),
  ('Filtro de aceite (genérico turismo)', 'Filtros', null, 30),
  ('Filtro de aire (genérico turismo)', 'Filtros', null, 25),
  ('Filtro de habitáculo / polen', 'Filtros', null, 25),
  ('Filtro de combustible diésel', 'Filtros', null, 15),
  ('Filtro de combustible gasolina', 'Filtros', null, 15),
  ('Pastillas de freno delanteras', 'Frenos', null, 15),
  ('Pastillas de freno traseras', 'Frenos', null, 15),
  ('Discos de freno delanteros (par)', 'Frenos', null, 8),
  ('Discos de freno traseros (par)', 'Frenos', null, 8),
  ('Latiguillo de freno', 'Frenos', null, 10),
  ('Zapatas de freno trasero (tambor)', 'Frenos', null, 6),
  ('Neumático 175/65 R14', 'Neumáticos', '175/65 R14', 4),
  ('Neumático 195/65 R15', 'Neumáticos', '195/65 R15', 4),
  ('Neumático 205/55 R16', 'Neumáticos', '205/55 R16', 4),
  ('Neumático 215/45 R17', 'Neumáticos', '215/45 R17', 4),
  ('Válvula de neumático (juego)', 'Neumáticos', null, 20),
  ('Sensor de presión de neumáticos (TPMS)', 'Neumáticos', null, 4),
  ('Correa de distribución (kit con tensores)', 'Correas y transmisión', null, 6),
  ('Correa de accesorios (poly-V)', 'Correas y transmisión', null, 10),
  ('Kit de embrague completo', 'Correas y transmisión', null, 4),
  ('Rodamiento de rueda delantero', 'Correas y transmisión', null, 8),
  ('Rodamiento de rueda trasero', 'Correas y transmisión', null, 8),
  ('Bujía de encendido', 'Encendido', null, 40),
  ('Bujía de precalentamiento diésel', 'Encendido', null, 20),
  ('Bobina de encendido', 'Encendido', null, 8),
  ('Cable de bujía (juego)', 'Encendido', null, 6),
  ('Batería 12V 45Ah', 'Eléctrico', '45Ah', 5),
  ('Batería 12V 60Ah', 'Eléctrico', '60Ah', 5),
  ('Batería 12V 70Ah', 'Eléctrico', '70Ah', 4),
  ('Bombilla H1', 'Eléctrico', null, 15),
  ('Bombilla H4', 'Eléctrico', null, 15),
  ('Bombilla H7', 'Eléctrico', null, 20),
  ('Bombilla LED W5W', 'Eléctrico', null, 20),
  ('Fusibles surtidos (caja)', 'Eléctrico', null, 10),
  ('Escobillas de motor de arranque', 'Eléctrico', null, 6),
  ('Amortiguador delantero', 'Suspensión y dirección', null, 8),
  ('Amortiguador trasero', 'Suspensión y dirección', null, 8),
  ('Rótula de dirección', 'Suspensión y dirección', null, 10),
  ('Terminal de dirección', 'Suspensión y dirección', null, 10),
  ('Muelle de suspensión', 'Suspensión y dirección', null, 6),
  ('Radiador de agua (genérico)', 'Refrigeración', null, 3),
  ('Termostato', 'Refrigeración', null, 10),
  ('Manguito de refrigerante', 'Refrigeración', null, 8),
  ('Electroventilador', 'Refrigeración', null, 3),
  ('Silencioso trasero (genérico)', 'Escape', null, 3),
  ('Catalizador (genérico)', 'Escape', null, 2),
  ('Junta de escape', 'Escape', null, 15),
  ('Escobilla limpiaparabrisas 500mm', 'Limpieza y consumibles', '500mm', 10),
  ('Escobilla limpiaparabrisas 600mm', 'Limpieza y consumibles', '600mm', 10),
  ('Líquido limpiaparabrisas', 'Limpieza y consumibles', '5L', 15),
  ('Guantes de nitrilo (caja 100)', 'Limpieza y consumibles', null, 10),
  ('Trapos industriales (paquete)', 'Limpieza y consumibles', null, 10),
  ('Abrazaderas surtidas (caja)', 'Limpieza y consumibles', null, 10)
) as v(nombre, tipo, tamano, cantidad)
on conflict (nombre, almacen_id) do nothing;
