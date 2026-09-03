-- =============================================================
-- Migración incremental — Batch 22: 2 cambios independientes.
-- Segura de re-ejecutar más de una vez.
--
-- 1. Arregla un bug real de sobrecarga de función en Postgres: la
--    migración de decimales (`checkin_split_y_decimales_migration.sql`)
--    creó `registrar_pieza_usada(uuid, uuid, numeric)` con
--    `create or replace`, pero como el tipo del 3er parámetro cambió
--    (antes `int`), Postgres NO reemplazó la función original — creó una
--    SEGUNDA función con el mismo nombre. Desde entonces existen DOS
--    `registrar_pieza_usada` (una con `int`, otra con `numeric`), y
--    cualquier llamada es ambigua ("Could not choose the best candidate
--    function..."), incluso después de aplicar batch20/batch21. Se borra
--    la versión vieja (`int`) y se deja solo la de `numeric`.
--
-- 2. El cliente no veía NUNCA en su Portal una solicitud/orden que no
--    hubiera creado él mismo desde su propia cuenta — ni la "Solicitud de
--    cita" que crea el personal por teléfono (`cliente_auth_id` queda
--    NULL), ni un check-in hecho directamente en el taller sin solicitud
--    previa (esas órdenes ni siquiera tenían fila en `solicitudes`). Se
--    añaden 2 triggers para que, cuando el nombre/email coincidan con una
--    cuenta de cliente ya existente (o se cree después), la solicitud/
--    orden se vincule sola y le aparezca en su Portal:
--    - `vincular_solicitud_cliente_auth`: al crear (o editar el email de)
--      una solicitud sin `cliente_auth_id`, busca una cuenta de cliente
--      con ese mismo email y la vincula.
--    - `vincular_orden_solicitud_directa`: al crear una orden de trabajo
--      SIN `solicitud_id` (check-in directo), le crea automáticamente una
--      solicitud "aceptada" con los datos del cliente/vehículo, para que
--      tenga algo que vincular (el trigger anterior se encarga de
--      vincularla si el email coincide).
--    - `handle_new_user` (ya existía) ahora también vincula, al
--      registrarse una cuenta nueva, cualquier solicitud antigua que ya
--      coincidiera por email y se hubiera quedado sin vincular — cubre el
--      caso de que el cliente se registre DESPUÉS de que el personal ya
--      le creara la solicitud/orden.
--    De paso, se añaden a `schema.sql` (para instalaciones nuevas) las
--    políticas "Cliente ve su propia orden"/"...inspección de entrada" de
--    batch20, que se quedaron solo en `batch20_migration.sql` por
--    despiste y nunca se copiaron al documento de referencia.
-- =============================================================

-- --- 1. Arreglar la sobrecarga ambigua de registrar_pieza_usada ---
drop function if exists registrar_pieza_usada(uuid, uuid, int);
-- (por si algún proyecto llegó a tener también una versión con integer
-- explícito en vez de int — son sinónimos en Postgres, pero por si acaso)
drop function if exists registrar_pieza_usada(uuid, uuid, integer);
grant execute on function registrar_pieza_usada(uuid, uuid, numeric) to authenticated;

-- --- 2a. Vincular solicitud a cuenta de cliente existente por email ---
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

-- --- 2b. Crear una solicitud "aceptada" para un check-in directo sin ---
-- --- solicitud previa, para que tenga algo que vincular al cliente   ---
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

  -- cliente_auth_id se deja NULL a propósito: lo rellena el trigger
  -- `vincular_solicitud_cliente_auth` de arriba si el email coincide con
  -- una cuenta de cliente ya existente.
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

-- --- 2c. Vincular retroactivamente al registrarse una cuenta nueva ---
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into perfiles (id, rol, nombre, email)
  values (new.id, 'cliente', new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;

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

-- --- 2d. Políticas de lectura de batch20 que faltaban por sincronizar ---
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
