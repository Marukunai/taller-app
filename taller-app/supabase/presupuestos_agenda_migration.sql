-- =============================================================
-- TallerGo · Migración incremental: precios de inventario, presupuestos/
-- factura interna, y cita de check-in reservable desde el Portal.
-- Ejecutar en el SQL Editor de tu proyecto Supabase si ya tenías la app
-- instalada (si es una instalación nueva, `schema.sql` ya incluye esto).
-- =============================================================

-- 1. PRECIOS DE INVENTARIO — tabla APARTE de inventario_items a propósito:
-- así un mecánico, que SÍ puede leer inventario_items para elegir piezas
-- usadas, nunca puede leer el precio ni aunque inspeccione las peticiones
-- de red — la separación la impone la RLS de esta tabla nueva, no solo que
-- la app no lo muestre en pantalla.
create table if not exists inventario_precios (
  item_id uuid primary key references inventario_items(id) on delete cascade,
  precio_unitario numeric(10,2) not null default 0
);

-- 2. PRESUPUESTOS / FACTURA INTERNA (por orden de trabajo)
-- Documento de gestión interna (NO una factura fiscal con numeración
-- oficial ni desglose de IVA) que resume mano de obra + piezas usadas de
-- una orden. Lo crea/edita el encargado; si la orden viene de una
-- solicitud del Portal de cliente, el cliente puede verlo y aprobarlo/
-- rechazarlo desde su propia cuenta (para una orden de check-in directo,
-- sin solicitud de por medio, el presupuesto solo lo ve el encargado, que
-- puede compartirlo con el cliente por WhatsApp igual que otros avisos).
-- Una orden tiene como mucho un presupuesto (sin versiones/histórico).
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

-- 3. DETALLE DE PIEZAS DE UN PRESUPUESTO — snapshot de precio, EN UNA
-- TABLA APARTE de `piezas_usadas` (que sigue sin precio y sigue siendo
-- legible por cualquier personal, mecánico incluido). Si el precio
-- viviera en `piezas_usadas` directamente, un mecánico podría leerlo
-- porque esa tabla ya es de lectura/escritura para todo el personal — al
-- guardarlo aquí, en una tabla con RLS solo para encargado, el precio
-- nunca es visible ni con acceso directo a la API. El encargado recalcula
-- estas filas desde `piezas_usadas` + `inventario_precios` al abrir/enviar
-- el presupuesto (ver PresupuestoModal.tsx) — no se sincroniza sola.
create table if not exists presupuesto_piezas (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references presupuestos(id) on delete cascade,
  pieza_usada_id uuid references piezas_usadas(id) on delete set null,
  nombre_item text not null,
  cantidad int not null,
  precio_unitario numeric(10,2) not null default 0
);

-- 4. AGENDA: cita para TRAER el vehículo (check-in), elegida por el
-- cliente al pedir el servicio desde el Portal — con la misma sencillez
-- que la cita de RECOGIDA que ya existía (ordenes_trabajo.cita_recogida):
-- una fecha/hora concreta que el cliente propone, sin gestión de franjas
-- horarias ni de aforo (el taller puede negociarla por teléfono si no le
-- viene bien, igual que ya hace con la nota de respuesta a la solicitud).
alter table solicitudes add column if not exists fecha_cita_checkin timestamp with time zone;

-- =============================================================
-- Row Level Security
-- =============================================================

-- Precios de inventario: SOLO el encargado puede leer o escribir — ni
-- siquiera un mecánico puede hacer un SELECT que los incluya.
alter table inventario_precios enable row level security;
drop policy if exists "Encargado Inventario Precios" on inventario_precios;
create policy "Encargado Inventario Precios" on inventario_precios
  for all using (es_encargado()) with check (es_encargado());

-- Presupuestos: el encargado gestiona todo (igual que con el inventario,
-- un mecánico no tiene ningún acceso a esta tabla). El cliente dueño de la
-- solicitud que originó la orden puede VER su propio presupuesto, y
-- responder (aprobar/rechazar + nota) SOLO cuando está en estado
-- 'enviado' — no puede crearlo, editarlo, ni tocar el importe.
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
