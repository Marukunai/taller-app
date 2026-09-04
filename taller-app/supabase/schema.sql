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
  cliente_id uuid references clientes(id) on delete cascade,
  -- Coche o moto (batch 24) — determina qué listas de sugerencia de
  -- marca/modelo y qué opciones de neumáticos se muestran en el Check-in,
  -- y qué icono se usa en las listas. Por defecto 'coche' para no romper
  -- ningún vehículo ya existente al añadir esta columna.
  tipo_vehiculo text not null default 'coche' check (tipo_vehiculo in ('coche', 'moto'))
);

-- 3. TABLA DE ÓRDENES DE TRABAJO
create table if not exists ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  vehiculo_id uuid references vehiculos(id),
  estado text default 'solicitado', -- 'solicitado' | 'recepcionado' | 'en_proceso' | 'listo' | 'entregado' | 'cancelado'
  tipo_servicio text not null,      -- 'mantenimiento' | 'neumaticos' | 'averia' | 'pre_itv'
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
  created_at timestamp with time zone default now(),
  -- Documentación del conductor/vehículo — se exige al menos una de las
  -- dos en el check-in (ver validación en InspectionForm.tsx), nunca las
  -- dos obligatoriamente.
  permiso_conducir_url text,
  ficha_tecnica_url text
);
alter table inspecciones_entrada add column if not exists permiso_conducir_url text;
alter table inspecciones_entrada add column if not exists ficha_tecnica_url text;

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
  -- numeric (no int): hay consumos fraccionarios, ej. 0.5 o 5.5 litros de
  -- aceite en una revisión — ver piezas_usadas.cantidad más abajo.
  cantidad numeric(10,2) not null default 0,
  -- 'ud' (piezas contables, por defecto) o 'L'/'kg' para consumibles a
  -- granel (aceites, líquidos, grasa) — batch 21, para poder llevar el
  -- stock de estos en litros/kilos reales en vez de "número de envases".
  unidad text not null default 'ud' check (unidad in ('ud', 'L', 'kg')),
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
  -- numeric: algunos coches consumen cantidades fraccionarias de aceite u
  -- otros líquidos (ej. 0.5 L o 5.5 L), no solo unidades enteras de pieza.
  cantidad numeric(10,2) not null check (cantidad > 0)
);

-- 7. TABLA DE PERFILES (rol de cada cuenta de Supabase Auth)
-- Todo el mundo con sesión iniciada es un usuario de Supabase Auth, pero
-- puede ser una de varias cosas muy distintas. Desde el batch 19, jerarquía
-- de personal: 'admin' (cuenta de arranque, se crea solo por SQL directo,
-- únicamente para crear al primer 'dueno' — no ve nada más de la app),
-- 'dueno' (gestiona el taller entero, incluida Gestión de personal
-- completa: crear/editar/desactivar/eliminar CUALQUIER cuenta), 'encargado'
-- (mismo acceso operativo que antes — inventario, precios, presupuestos,
-- flota, estadísticas — pero YA NO ve Gestión de personal), 'mecanico'
-- (check-in/panel/entrega/inventario en solo lectura, SIN precios/costes,
-- SIN Gestión de personal, SIN Flota/Estadísticas/Próximas revisiones),
-- 'recepcionista' (solicitud de cita/agenda/panel de gestión de cara al
-- cliente, SIN inventario, SIN próximas revisiones), o 'cliente' (una
-- cuenta que el propio cliente se crea desde el Portal de cliente para
-- pedir cita sin pasar por el mecánico). Sin esta distinción, cualquier
-- cliente con sesión iniciada tendría acceso total a los datos de TODOS los
-- clientes y al inventario — por eso las políticas de abajo ya no usan solo
-- "auth.role() = 'authenticated'", sino "es_personal()" (nivel lectura,
-- cualquier rol de personal), "es_encargado()" (nivel gestión operativa:
-- admin/dueno/encargado) o "es_gestion_cuentas()" (nivel cuentas: solo
-- admin/dueno).
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null default 'cliente'
    check (rol in ('admin', 'dueno', 'encargado', 'mecanico', 'recepcionista', 'cliente')),
  nombre text,
  email text,
  -- Cuenta de personal desactivada desde "Gestión de personal" (p. ej. un
  -- mecánico que ya no trabaja en el taller) — no se borra nada, solo deja
  -- de contar como personal a efectos de es_personal()/es_encargado()/
  -- es_gestion_cuentas() de abajo, y se le bloquea el login (ban_duration)
  -- desde la Edge Function administrar-cuenta-personal. Siempre true para
  -- cuentas de cliente.
  activo boolean not null default true,
  created_at timestamp with time zone default now()
);
alter table perfiles add column if not exists activo boolean not null default true;
-- Instalación ya existente (de antes del batch 19): amplía el check
-- constraint del rol para admitir los roles nuevos sin perder los datos.
alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check
  check (rol in ('admin', 'dueno', 'encargado', 'mecanico', 'recepcionista', 'cliente'));

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

  -- Batch 22: vincula retroactivamente cualquier solicitud que el
  -- personal ya le hubiera creado (llamada telefónica, o check-in directo
  -- sin solicitud previa) antes de que este cliente tuviera cuenta, para
  -- que le aparezca en su Portal nada más registrarse.
  if new.email is not null then
    update solicitudes
       set cliente_auth_id = new.id
     where cliente_auth_id is null
       and email_cliente is not null
       and lower(email_cliente) = lower(new.email);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Si ya tenías cuentas de personal creadas ANTES de ejecutar esto (el
-- trigger de arriba solo actúa en registros nuevos), se les da rol 'dueno'
-- automáticamente aquí, asumiendo que toda cuenta que existiera ya en tu
-- proyecto es del personal del taller (el Portal de cliente es nuevo, así
-- que a fecha de hoy no puede haber todavía clientes reales). Se les da
-- 'dueno' (el rol operativo con más permisos, sin llegar a 'admin', que es
-- solo de arranque) porque son las cuentas que ya usa el taller a diario —
-- el resto del personal (encargados, mecánicos, recepcionistas) se crea
-- después, uno a uno, desde la pantalla de Gestión de personal.
insert into perfiles (id, rol, nombre, email)
select id, 'dueno', raw_user_meta_data->>'full_name', email from auth.users
on conflict (id) do nothing;

-- Funciones auxiliares para las políticas de abajo. `security definer` para
-- poder leer `perfiles` sin depender de que la propia política de perfiles
-- se lo permita.
-- ¿La sesión actual es de CUALQUIER personal del taller (admin, dueño,
-- encargado, mecánico o recepcionista)? Se usa para lo que todos esos
-- roles pueden ver/hacer por igual (nivel lectura). Las cuatro funciones
-- exigen además `activo` — una cuenta de personal desactivada (ver columna
-- de arriba) pierde el acceso al instante en TODAS las políticas de abajo,
-- sin depender de que su sesión/token caduque ni de que el ban de Supabase
-- Auth ya haya surtido efecto.
create or replace function es_personal()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid()
      and rol in ('admin', 'dueno', 'encargado', 'mecanico', 'recepcionista')
      and activo
  );
$$;

-- ¿La sesión actual tiene nivel de gestión OPERATIVA (admin, dueño o
-- encargado)? Se usa para lo que un mecánico/recepcionista no debe poder
-- hacer: gestionar el inventario/almacenes, ver precios/costes,
-- presupuestos o la flota de sustitución. Desde el batch 19 YA NO incluye
-- la gestión de CUENTAS de personal — ver es_gestion_cuentas() debajo.
create or replace function es_encargado()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and rol in ('admin', 'dueno', 'encargado') and activo
  );
$$;

-- ¿La sesión actual puede gestionar CUENTAS de personal (crear, editar el
-- rol de otra cuenta, desactivar, reactivar o eliminar)? Desde el batch 19,
-- SOLO admin/dueño — un encargado ya no puede (antes sí podía, cuando
-- 'encargado' era el rol con más permisos). Se usa sobre todo desde las
-- Edge Functions (crear-cuenta-personal / administrar-cuenta-personal, que
-- hacen su propia comprobación de rol con el token de quien llama), no
-- tanto en políticas RLS de tablas — se deja aquí como función de apoyo
-- reutilizable y por si se necesita en el futuro.
create or replace function es_gestion_cuentas()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol in ('admin', 'dueno') and activo
  );
$$;

-- ¿La sesión actual es la cuenta de arranque 'admin'? Uso muy puntual (en
-- la práctica, casi todo lo que necesita "nivel admin" ya lo cubre
-- es_gestion_cuentas() admitiendo también 'dueno') — se deja definida por
-- si hiciera falta distinguir el caso "solo admin" en el futuro (p. ej. de
-- cara al planteamiento de multi-taller).
create or replace function es_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol = 'admin' and activo
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
  -- Nulo cuando la crea el propio personal desde la pestaña "Solicitud de
  -- cita" (llamada telefónica o cliente sin cuenta del Portal) en vez de un
  -- cliente desde su propia cuenta — ver el nuevo SolicitudCitaPanel.tsx.
  cliente_auth_id uuid references auth.users(id) on delete cascade,
  nombre_cliente text not null,
  -- Nulo también en el caso anterior: un cliente sin cuenta del Portal
  -- puede no haber dado ningún email por teléfono.
  email_cliente text,
  telefono_cliente text,
  matricula text,
  marca text,
  modelo text,
  tipo_servicio text not null,
  descripcion text,
  neumaticos_cantidad text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada', 'cancelada')),
  respuesta_taller text,
  -- Coche o moto (batch 24) — se captura ya en la propia solicitud (antes
  -- de que exista una fila en `vehiculos`) para poder mostrar el
  -- formulario/datalist correcto desde el principio. Igual que en
  -- `vehiculos`, por defecto 'coche'.
  tipo_vehiculo text not null default 'coche' check (tipo_vehiculo in ('coche', 'moto'))
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
  baja boolean not null default false,
  -- Precio por hora de uso (opcional) — null = no se cobra el préstamo.
  precio_hora numeric(10,2),
  -- Coche o moto (batch 24) — el nombre de la tabla/columnas se queda
  -- como está (coches_repuesto, coche_repuesto_id en ordenes_trabajo) para
  -- no renombrar media base de datos por esto; en la UI ya se habla de
  -- "vehículo de sustitución" en general.
  tipo_vehiculo text not null default 'coche' check (tipo_vehiculo in ('coche', 'moto'))
);
alter table coches_repuesto add column if not exists precio_hora numeric(10,2);
alter table coches_repuesto add column if not exists tipo_vehiculo text not null default 'coche';
do $$
begin
  alter table coches_repuesto add constraint coches_repuesto_tipo_vehiculo_check check (tipo_vehiculo in ('coche', 'moto'));
exception when duplicate_object then
  null;
end $$;

-- 9b. CONFIGURACIÓN DEL TALLER (fila única, id fijo = 1) — batch 19, parte
-- 4. De momento solo guarda cuántas citas caben a la vez en la misma
-- franja horaria de la Agenda ("plazas de trabajo simultáneas": nº de
-- elevadores/puestos, independiente de cuántos mecánicos haya), editable
-- por dueño/encargado/admin desde la propia Agenda (ver AgendaPanel.tsx).
-- Cualquier personal puede LEERLA (hace falta para pintar los colores/
-- franjas de la Agenda a cualquier rol que la vea), pero solo
-- dueño/encargado/admin puede EDITARLA.
create table if not exists configuracion_taller (
  id smallint primary key default 1 check (id = 1),
  plazas_simultaneas integer not null default 2
);
insert into configuracion_taller (id, plazas_simultaneas)
  values (1, 2)
  on conflict (id) do nothing;

alter table configuracion_taller enable row level security;
drop policy if exists "Personal lee configuración" on configuracion_taller;
create policy "Personal lee configuración" on configuracion_taller
  for select using (es_personal());
drop policy if exists "Encargado edita configuración" on configuracion_taller;
create policy "Encargado edita configuración" on configuracion_taller
  for update using (es_encargado()) with check (es_encargado());

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

-- Batch 19, parte 3: fecha prevista de devolución del coche de sustitución
-- (préstamo mejorado) y medida de neumático por datalist, además de la
-- foto que ya existía. Estas columnas ya se distribuyeron como migración
-- incremental aparte (`batch19_parte3_migration.sql`) pero no se habían
-- añadido aquí a `schema.sql` (instalación nueva) — corregido de paso al
-- tocar esta sección en el batch 19, parte 4.
alter table ordenes_trabajo add column if not exists fecha_devolucion_repuesto_prevista timestamp with time zone;
alter table ordenes_trabajo add column if not exists neumatico_ancho text;
alter table ordenes_trabajo add column if not exists neumatico_perfil text;
alter table ordenes_trabajo add column if not exists neumatico_llanta text;
alter table ordenes_trabajo add column if not exists neumatico_indice_carga text;
alter table ordenes_trabajo add column if not exists neumatico_indice_velocidad text;
alter table ordenes_trabajo add column if not exists neumatico_estacion text;

-- Batch 19, parte 3: combustible/año/motor del vehículo (datalists) y
-- aceptación del aviso anual de revisión (checkbox junto a la firma de
-- salida en la Entrega) — mismo motivo que arriba, añadidas aquí también
-- en el batch 19, parte 4 para que una instalación nueva quede igual que
-- una ya migrada.
alter table vehiculos add column if not exists combustible text;
alter table vehiculos add column if not exists anio integer;
alter table vehiculos add column if not exists motor text;
alter table vehiculos add column if not exists aviso_anual_aceptado boolean not null default false;

-- Batch 24: coche o moto (ver también solicitudes y coches_repuesto más
-- abajo) — mismo motivo, para que una instalación nueva quede igual que
-- una ya migrada con batch24_migration.sql.
alter table vehiculos add column if not exists tipo_vehiculo text not null default 'coche';
do $$
begin
  alter table vehiculos add constraint vehiculos_tipo_vehiculo_check check (tipo_vehiculo in ('coche', 'moto'));
exception when duplicate_object then
  null;
end $$;

-- 10. PRECIOS DE INVENTARIO — tabla APARTE de inventario_items a propósito:
-- así un mecánico, que SÍ puede leer inventario_items para elegir piezas
-- usadas, nunca puede leer el precio ni aunque inspeccione las peticiones
-- de red — la separación la impone la RLS de esta tabla nueva, no solo que
-- la app no lo muestre en pantalla.
create table if not exists inventario_precios (
  item_id uuid primary key references inventario_items(id) on delete cascade,
  precio_unitario numeric(10,2) not null default 0
);

-- 11. PRESUPUESTOS / FACTURA INTERNA (por orden de trabajo)
-- Documento de gestión interna (NO una factura fiscal con numeración
-- oficial ni desglose de IVA) que resume mano de obra + piezas usadas de
-- una orden. Lo crea/edita el encargado; si la orden viene de una
-- solicitud del Portal de cliente, el cliente puede verlo y aprobarlo/
-- rechazarlo desde su propia cuenta. Una orden tiene como mucho un
-- presupuesto (sin versiones/histórico).
create table if not exists presupuestos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null unique references ordenes_trabajo(id) on delete cascade,
  -- Copia de ordenes_trabajo.solicitud_id — se guarda aquí TAMBIÉN,
  -- redundante a propósito, para que el cliente pueda ver/responder su
  -- presupuesto sin necesitar acceso de lectura a `ordenes_trabajo` (que
  -- está reservada al personal): las políticas de abajo solo miran esta
  -- columna + `solicitudes.cliente_auth_id`, nunca la orden.
  solicitud_id uuid references solicitudes(id),
  concepto_mano_obra text,
  precio_mano_obra numeric(10,2) not null default 0,
  estado text not null default 'borrador' check (estado in ('borrador', 'enviado', 'aprobado', 'rechazado')),
  nota_cliente text,
  created_at timestamp with time zone default now(),
  enviado_en timestamp with time zone,
  respondido_en timestamp with time zone,
  -- PDF de factura final, generado al ENTREGAR el vehículo (checkout) a
  -- partir de este presupuesto + el detalle de piezas de abajo.
  factura_pdf_url text
);

-- 12. DETALLE DE PIEZAS DE UN PRESUPUESTO — snapshot de precio, EN UNA
-- TABLA APARTE de `piezas_usadas` (que sigue sin precio y sigue siendo
-- legible por cualquier personal, mecánico incluido). El encargado
-- recalcula estas filas desde `piezas_usadas` + `inventario_precios` al
-- abrir/enviar el presupuesto — no se sincroniza sola.
create table if not exists presupuesto_piezas (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references presupuestos(id) on delete cascade,
  pieza_usada_id uuid references piezas_usadas(id) on delete set null,
  nombre_item text not null,
  -- numeric (no int, desde el batch 21): copia la cantidad de
  -- `piezas_usadas`, que admite decimales (ej. 0.5 L de aceite) — con
  -- `int` aquí, recalcular el presupuesto de una orden con una pieza
  -- decimal fallaba.
  cantidad numeric(10,2) not null,
  precio_unitario numeric(10,2) not null default 0
);

-- 13. AGENDA: cita para TRAER el vehículo (check-in), elegida por el
-- cliente al pedir el servicio desde el Portal — con la misma sencillez
-- que la cita de RECOGIDA que ya existía (ordenes_trabajo.cita_recogida).
alter table solicitudes add column if not exists fecha_cita_checkin timestamp with time zone;

-- Batch 24: coche o moto, capturado ya en la propia solicitud.
alter table solicitudes add column if not exists tipo_vehiculo text not null default 'coche';
do $$
begin
  alter table solicitudes add constraint solicitudes_tipo_vehiculo_check check (tipo_vehiculo in ('coche', 'moto'));
exception when duplicate_object then
  null;
end $$;

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
-- El cliente ve su propia orden (batch 20) — por `solicitud_id` +
-- `solicitudes.cliente_auth_id`, igual que en `presupuestos`.
drop policy if exists "Cliente ve su propia orden" on ordenes_trabajo;
create policy "Cliente ve su propia orden" on ordenes_trabajo
  for select using (
    solicitud_id is not null
    and exists (select 1 from solicitudes where id = ordenes_trabajo.solicitud_id and cliente_auth_id = auth.uid())
  );

-- Batch 22: si el check-in crea la orden directamente, sin haber pasado
-- antes por una solicitud (ni del Portal ni de "Solicitud de cita"), se le
-- crea aquí una solicitud "aceptada" a partir de los datos del cliente/
-- vehículo, para que `vincular_solicitud_cliente_auth` (más abajo) pueda
-- vincularla a su cuenta si el email coincide — sin esto, un cliente cuyo
-- vehículo se recepciona directamente en el taller no ve NUNCA nada en su
-- Portal, porque no hay ninguna solicitud a la que esté ligado.
create or replace function vincular_orden_solicitud_directa()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_nombre text;
  v_email text;
  v_telefono text;
  v_matricula text;
  v_marca text;
  v_modelo text;
  v_solicitud_id uuid;
begin
  if new.solicitud_id is not null or new.vehiculo_id is null then
    return new;
  end if;

  select c.nombre, c.email, c.telefono, v.matricula, v.marca, v.modelo
    into v_nombre, v_email, v_telefono, v_matricula, v_marca, v_modelo
    from vehiculos v
    join clientes c on c.id = v.cliente_id
   where v.id = new.vehiculo_id;

  if v_nombre is null then
    return new;
  end if;

  insert into solicitudes (
    nombre_cliente, email_cliente, telefono_cliente,
    matricula, marca, modelo, tipo_servicio, descripcion, neumaticos_cantidad,
    estado, respuesta_taller
  ) values (
    v_nombre, v_email, v_telefono,
    v_matricula, v_marca, v_modelo,
    new.tipo_servicio, new.descripcion_averia, new.neumaticos_cantidad,
    'aceptada',
    'Vehículo recepcionado directamente en el check-in, sin solicitud previa.'
  )
  returning id into v_solicitud_id;

  new.solicitud_id := v_solicitud_id;
  return new;
end;
$$;

drop trigger if exists trg_vincular_orden_solicitud_directa on ordenes_trabajo;
create trigger trg_vincular_orden_solicitud_directa
  before insert on ordenes_trabajo
  for each row execute function vincular_orden_solicitud_directa();

-- Restringe la ASIGNACIÓN de un coche de sustitución (préstamo) a
-- dueño/encargado/admin a nivel de BASE DE DATOS, no solo de interfaz —
-- batch 19, parte 4, a petición del usuario tras el feedback de la parte 3
-- (antes la restricción solo ocultaba el botón en ManagementPanel.tsx/
-- FlotaRepuestoPanel.tsx, pero un mecánico podía saltársela llamando
-- directamente a la API). Se dispara solo cuando `coche_repuesto_id`
-- CAMBIA a un valor no nulo (es decir, se presta un coche nuevo o se
-- reasigna). Desde el batch 21, DEVOLVER uno (que solo toca
-- `fecha_devolucion_repuesto`) también se restringe a dueño/encargado/
-- admin — antes estaba abierto a cualquier personal.
create or replace function restringir_prestamo_repuesto()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.coche_repuesto_id is distinct from old.coche_repuesto_id
     and new.coche_repuesto_id is not null
     and not es_encargado() then
    raise exception 'Solo un dueño, encargado o administrador puede prestar un coche de sustitución.';
  end if;
  if new.fecha_devolucion_repuesto is distinct from old.fecha_devolucion_repuesto
     and new.fecha_devolucion_repuesto is not null
     and old.fecha_devolucion_repuesto is null
     and not es_encargado() then
    raise exception 'Solo un dueño, encargado o administrador puede marcar devuelto un coche de sustitución.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restringir_prestamo_repuesto on ordenes_trabajo;
create trigger trg_restringir_prestamo_repuesto
  before update on ordenes_trabajo
  for each row execute function restringir_prestamo_repuesto();

alter table inspecciones_entrada enable row level security;
create policy "Personal Inspecciones" on inspecciones_entrada
  for all using (es_personal()) with check (es_personal());
-- El cliente ve su propia inspección de entrada (batch 20).
drop policy if exists "Cliente ve su propia inspección de entrada" on inspecciones_entrada;
create policy "Cliente ve su propia inspección de entrada" on inspecciones_entrada
  for select using (
    exists (
      select 1 from ordenes_trabajo o
      join solicitudes s on s.id = o.solicitud_id
      where o.id = inspecciones_entrada.orden_id and s.cliente_auth_id = auth.uid()
    )
  );

-- Batch 22: si una solicitud se crea (o se le corrige el email) sin
-- `cliente_auth_id` — "Solicitud de cita" del personal, o la que crea
-- automáticamente `vincular_orden_solicitud_directa` de arriba — y el
-- email coincide con una cuenta de cliente ya existente, se vincula sola.
create or replace function vincular_solicitud_cliente_auth()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if new.cliente_auth_id is null and new.email_cliente is not null then
    select id into v_id
      from perfiles
     where rol = 'cliente' and lower(email) = lower(new.email_cliente)
     limit 1;
    if v_id is not null then
      new.cliente_auth_id := v_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vincular_solicitud_cliente_auth on solicitudes;
create trigger trg_vincular_solicitud_cliente_auth
  before insert or update of email_cliente, cliente_auth_id on solicitudes
  for each row execute function vincular_solicitud_cliente_auth();

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

-- IMPORTANTE (batch 19): la política de arriba deja que CUALQUIER cuenta
-- edite su PROPIA fila de `perfiles` (necesario para que el autoservicio de
-- nombre/email funcione) — pero RLS solo restringe QUÉ FILAS se pueden
-- tocar, no QUÉ COLUMNAS, así que sin este trigger cualquier cuenta
-- (mecánico, recepcionista, cliente...) podría auto-ascenderse a 'dueno' o
-- incluso 'admin' con un simple `update` directo a la tabla, saltándose
-- por completo la Edge Function administrar-cuenta-personal y su
-- comprobación de "solo admin/dueño pueden cambiar el rol de una cuenta".
-- Este trigger bloquea cualquier cambio a `rol`/`activo` que NO venga de la
-- clave service_role (que es la que usan las Edge Functions tras haber
-- comprobado ya, en su propio código, que quien llama tiene permiso).
create or replace function bloquear_cambio_rol_propio()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.rol is distinct from old.rol or new.activo is distinct from old.activo)
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo un dueño o administrador puede cambiar el rol o el estado de una cuenta.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_cambio_rol_propio on perfiles;
create trigger trg_bloquear_cambio_rol_propio
  before update on perfiles
  for each row execute function bloquear_cambio_rol_propio();

alter table solicitudes enable row level security;
-- El cliente crea y ve sus propias solicitudes; el personal las ve todas.
create policy "Cliente crea sus solicitudes" on solicitudes
  for insert with check (auth.uid() = cliente_auth_id);
-- El personal también puede crear solicitudes directamente (pestaña
-- "Solicitud de cita"), para una llamada telefónica o un cliente sin cuenta
-- del Portal — sin esto, un insert de personal con cliente_auth_id nulo
-- quedaría bloqueado por RLS (ninguna política de insert lo cubría).
drop policy if exists "Personal crea solicitudes" on solicitudes;
create policy "Personal crea solicitudes" on solicitudes
  for insert with check (es_personal());
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

-- Precios de inventario: SOLO el encargado puede leer o escribir — ni
-- siquiera un mecánico puede hacer un SELECT que los incluya.
alter table inventario_precios enable row level security;
drop policy if exists "Encargado Inventario Precios" on inventario_precios;
create policy "Encargado Inventario Precios" on inventario_precios
  for all using (es_encargado()) with check (es_encargado());

-- Presupuestos: el encargado gestiona todo (un mecánico no tiene ningún
-- acceso a esta tabla). El cliente dueño de la solicitud que originó la
-- orden puede VER su propio presupuesto, y responder (aprobar/rechazar +
-- nota) SOLO cuando está en estado 'enviado' — no puede crearlo, editarlo,
-- ni tocar el importe.
alter table presupuestos enable row level security;
drop policy if exists "Encargado gestiona presupuestos" on presupuestos;
create policy "Encargado gestiona presupuestos" on presupuestos
  for all using (es_encargado()) with check (es_encargado());
drop policy if exists "Cliente ve su presupuesto" on presupuestos;
create policy "Cliente ve su presupuesto" on presupuestos
  for select using (
    solicitud_id is not null
    and exists (select 1 from solicitudes where id = presupuestos.solicitud_id and cliente_auth_id = auth.uid())
  );
drop policy if exists "Cliente responde su presupuesto" on presupuestos;
create policy "Cliente responde su presupuesto" on presupuestos
  for update
  using (
    estado = 'enviado' and solicitud_id is not null
    and exists (select 1 from solicitudes where id = presupuestos.solicitud_id and cliente_auth_id = auth.uid())
  )
  with check (
    estado in ('aprobado', 'rechazado') and solicitud_id is not null
    and exists (select 1 from solicitudes where id = presupuestos.solicitud_id and cliente_auth_id = auth.uid())
  );

-- Detalle de piezas del presupuesto: mismas reglas que `presupuestos`
-- (encargado gestiona, cliente solo lee la de su propio presupuesto).
alter table presupuesto_piezas enable row level security;
drop policy if exists "Encargado gestiona piezas de presupuesto" on presupuesto_piezas;
create policy "Encargado gestiona piezas de presupuesto" on presupuesto_piezas
  for all using (es_encargado()) with check (es_encargado());
drop policy if exists "Cliente ve piezas de su presupuesto" on presupuesto_piezas;
create policy "Cliente ve piezas de su presupuesto" on presupuesto_piezas
  for select using (
    exists (
      select 1 from presupuestos p
      join solicitudes s on s.id = p.solicitud_id
      where p.id = presupuesto_piezas.presupuesto_id and s.cliente_auth_id = auth.uid()
    )
  );

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

-- Permiso de conducir / ficha técnica recogidos en el check-in (documentos
-- internos del taller, igual que fotos-vehiculos/firmas/documentos-pdf).
insert into storage.buckets (id, name, public)
values ('documentos-cliente', 'documentos-cliente', true)
on conflict (id) do nothing;
drop policy if exists "Personal Storage documentos-cliente" on storage.objects;
create policy "Personal Storage documentos-cliente"
on storage.objects
for all
using (bucket_id = 'documentos-cliente' and es_personal())
with check (bucket_id = 'documentos-cliente' and es_personal());

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

grant execute on function registrar_pieza_usada(uuid, uuid, numeric) to authenticated;
grant execute on function quitar_pieza_usada(uuid) to authenticated;
grant execute on function es_personal() to authenticated;
grant execute on function es_encargado() to authenticated;
grant execute on function es_gestion_cuentas() to authenticated;
grant execute on function es_admin() to authenticated;

-- Cancelar una orden devuelve al stock, en una sola operación atómica,
-- todas las piezas que se hubieran registrado como usadas en ella (antes
-- se quedaban descontadas del inventario para siempre aunque el trabajo no
-- llegara a completarse). `security definer` por el mismo motivo que
-- registrar_pieza_usada/quitar_pieza_usada de arriba.
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
-- Desde el batch 21, los 8 items a granel (aceites, líquidos, grasa) se
-- siembran ya en litros/kilos REALES (no "número de envases" como antes:
-- ej. antes eran "20" garrafas de 5L, ahora son "100" litros) — `tamano`
-- se conserva como referencia de en qué envase se compra normalmente.
insert into inventario_items (nombre, tipo, tamano, cantidad, unidad, almacen_id)
select v.nombre, v.tipo, v.tamano, v.cantidad, v.unidad, (select id from almacenes where nombre = 'Almacén 1')
from (values
  ('Aceite motor 5W30', 'Aceites y lubricantes', '5L', 100, 'L'),
  ('Aceite motor 5W40', 'Aceites y lubricantes', '5L', 100, 'L'),
  ('Aceite motor 10W40', 'Aceites y lubricantes', '5L', 75, 'L'),
  ('Aceite motor 15W40', 'Aceites y lubricantes', '5L', 50, 'L'),
  ('Líquido de frenos DOT4', 'Aceites y lubricantes', '500ml', 7.5, 'L'),
  ('Líquido refrigerante concentrado', 'Aceites y lubricantes', '5L', 50, 'L'),
  ('Grasa multiusos', 'Aceites y lubricantes', '400g', 3.2, 'kg'),
  ('Filtro de aceite (genérico turismo)', 'Filtros', null, 30, 'ud'),
  ('Filtro de aire (genérico turismo)', 'Filtros', null, 25, 'ud'),
  ('Filtro de habitáculo / polen', 'Filtros', null, 25, 'ud'),
  ('Filtro de combustible diésel', 'Filtros', null, 15, 'ud'),
  ('Filtro de combustible gasolina', 'Filtros', null, 15, 'ud'),
  ('Pastillas de freno delanteras', 'Frenos', null, 15, 'ud'),
  ('Pastillas de freno traseras', 'Frenos', null, 15, 'ud'),
  ('Discos de freno delanteros (par)', 'Frenos', null, 8, 'ud'),
  ('Discos de freno traseros (par)', 'Frenos', null, 8, 'ud'),
  ('Latiguillo de freno', 'Frenos', null, 10, 'ud'),
  ('Zapatas de freno trasero (tambor)', 'Frenos', null, 6, 'ud'),
  ('Neumático 175/65 R14', 'Neumáticos', '175/65 R14', 4, 'ud'),
  ('Neumático 195/65 R15', 'Neumáticos', '195/65 R15', 4, 'ud'),
  ('Neumático 205/55 R16', 'Neumáticos', '205/55 R16', 4, 'ud'),
  ('Neumático 215/45 R17', 'Neumáticos', '215/45 R17', 4, 'ud'),
  ('Válvula de neumático (juego)', 'Neumáticos', null, 20, 'ud'),
  ('Sensor de presión de neumáticos (TPMS)', 'Neumáticos', null, 4, 'ud'),
  ('Correa de distribución (kit con tensores)', 'Correas y transmisión', null, 6, 'ud'),
  ('Correa de accesorios (poly-V)', 'Correas y transmisión', null, 10, 'ud'),
  ('Kit de embrague completo', 'Correas y transmisión', null, 4, 'ud'),
  ('Rodamiento de rueda delantero', 'Correas y transmisión', null, 8, 'ud'),
  ('Rodamiento de rueda trasero', 'Correas y transmisión', null, 8, 'ud'),
  ('Bujía de encendido', 'Encendido', null, 40, 'ud'),
  ('Bujía de precalentamiento diésel', 'Encendido', null, 20, 'ud'),
  ('Bobina de encendido', 'Encendido', null, 8, 'ud'),
  ('Cable de bujía (juego)', 'Encendido', null, 6, 'ud'),
  ('Batería 12V 45Ah', 'Eléctrico', '45Ah', 5, 'ud'),
  ('Batería 12V 60Ah', 'Eléctrico', '60Ah', 5, 'ud'),
  ('Batería 12V 70Ah', 'Eléctrico', '70Ah', 4, 'ud'),
  ('Bombilla H1', 'Eléctrico', null, 15, 'ud'),
  ('Bombilla H4', 'Eléctrico', null, 15, 'ud'),
  ('Bombilla H7', 'Eléctrico', null, 20, 'ud'),
  ('Bombilla LED W5W', 'Eléctrico', null, 20, 'ud'),
  ('Fusibles surtidos (caja)', 'Eléctrico', null, 10, 'ud'),
  ('Escobillas de motor de arranque', 'Eléctrico', null, 6, 'ud'),
  ('Amortiguador delantero', 'Suspensión y dirección', null, 8, 'ud'),
  ('Amortiguador trasero', 'Suspensión y dirección', null, 8, 'ud'),
  ('Rótula de dirección', 'Suspensión y dirección', null, 10, 'ud'),
  ('Terminal de dirección', 'Suspensión y dirección', null, 10, 'ud'),
  ('Muelle de suspensión', 'Suspensión y dirección', null, 6, 'ud'),
  ('Radiador de agua (genérico)', 'Refrigeración', null, 3, 'ud'),
  ('Termostato', 'Refrigeración', null, 10, 'ud'),
  ('Manguito de refrigerante', 'Refrigeración', null, 8, 'ud'),
  ('Electroventilador', 'Refrigeración', null, 3, 'ud'),
  ('Silencioso trasero (genérico)', 'Escape', null, 3, 'ud'),
  ('Catalizador (genérico)', 'Escape', null, 2, 'ud'),
  ('Junta de escape', 'Escape', null, 15, 'ud'),
  ('Escobilla limpiaparabrisas 500mm', 'Limpieza y consumibles', '500mm', 10, 'ud'),
  ('Escobilla limpiaparabrisas 600mm', 'Limpieza y consumibles', '600mm', 10, 'ud'),
  ('Líquido limpiaparabrisas', 'Limpieza y consumibles', '5L', 75, 'L'),
  ('Guantes de nitrilo (caja 100)', 'Limpieza y consumibles', null, 10, 'ud'),
  ('Trapos industriales (paquete)', 'Limpieza y consumibles', null, 10, 'ud'),
  ('Abrazaderas surtidas (caja)', 'Limpieza y consumibles', null, 10, 'ud')
) as v(nombre, tipo, tamano, cantidad, unidad)
on conflict (nombre, almacen_id) do nothing;
