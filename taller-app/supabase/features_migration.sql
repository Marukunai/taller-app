-- =============================================================
-- Taller App · Migración: observaciones, color del vehículo e
-- inventario de repuestos/materiales del taller.
-- Ejecutar en el SQL Editor de tu proyecto Supabase.
--
-- Esta migración NO borra nada de lo que ya tengas (usa "if not
-- exists" / "on conflict do nothing" en todo). Puedes ejecutarla
-- tantas veces como quieras sin duplicar datos.
-- =============================================================

-- 1. Observaciones generales de la inspección de entrada (además de la
--    observación puntual que ya tenía cada daño marcado en el esquema).
alter table inspecciones_entrada
  add column if not exists observaciones text;

-- 2. Color del vehículo — para distinguirlo de un vistazo en el Panel de
--    gestión y en la pantalla de Entrega, sobre todo cuando hay varios
--    vehículos listos a la vez.
alter table vehiculos
  add column if not exists color text;

-- =============================================================
-- 3. Inventario de repuestos y materiales del taller.
-- Es un catálogo propio del taller (no depende de clientes/vehículos):
-- lo gestiona el propio taller, con opción de añadir sus propios items
-- y una foto para distinguirlos. Por eso NO se borra con
-- reset_database.sql (ese reset es solo para datos de prueba de
-- clientes/vehículos/órdenes).
-- =============================================================
create table if not exists inventario_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  nombre text not null unique,
  tipo text not null,      -- categoría: 'Frenos', 'Filtros', 'Neumáticos'...
  tamano text,             -- talla/medida si aplica (ej. '205/55 R16'), si no null
  cantidad int not null default 0,
  imagen_url text          -- foto opcional para distinguir el item visualmente
);

alter table inventario_items enable row level security;
create policy "Acceso Autenticado Inventario" on inventario_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Bucket de Storage para las fotos de los items del inventario. Se crea
-- directamente aquí por SQL (no hace falta crearlo a mano en el panel de
-- Storage como los otros 3 buckets).
insert into storage.buckets (id, name, public)
values ('inventario-imagenes', 'inventario-imagenes', true)
on conflict (id) do nothing;

create policy "Acceso Autenticado Storage inventario-imagenes"
on storage.objects for all
using (bucket_id = 'inventario-imagenes' and auth.role() = 'authenticated')
with check (bucket_id = 'inventario-imagenes' and auth.role() = 'authenticated');

-- =============================================================
-- Catálogo inicial — items habituales de un taller mecánico
-- generalista, para no empezar de cero. Si os falta algo, se añade
-- desde la propia app (pestaña "Inventario").
-- =============================================================
insert into inventario_items (nombre, tipo, tamano, cantidad) values
  -- Aceites y lubricantes
  ('Aceite motor 5W30', 'Aceites y lubricantes', '5L', 20),
  ('Aceite motor 5W40', 'Aceites y lubricantes', '5L', 20),
  ('Aceite motor 10W40', 'Aceites y lubricantes', '5L', 15),
  ('Aceite motor 15W40', 'Aceites y lubricantes', '5L', 10),
  ('Líquido de frenos DOT4', 'Aceites y lubricantes', '500ml', 15),
  ('Líquido refrigerante concentrado', 'Aceites y lubricantes', '5L', 10),
  ('Grasa multiusos', 'Aceites y lubricantes', '400g', 8),

  -- Filtros
  ('Filtro de aceite (genérico turismo)', 'Filtros', null, 30),
  ('Filtro de aire (genérico turismo)', 'Filtros', null, 25),
  ('Filtro de habitáculo / polen', 'Filtros', null, 25),
  ('Filtro de combustible diésel', 'Filtros', null, 15),
  ('Filtro de combustible gasolina', 'Filtros', null, 15),

  -- Frenos
  ('Pastillas de freno delanteras', 'Frenos', null, 15),
  ('Pastillas de freno traseras', 'Frenos', null, 15),
  ('Discos de freno delanteros (par)', 'Frenos', null, 8),
  ('Discos de freno traseros (par)', 'Frenos', null, 8),
  ('Latiguillo de freno', 'Frenos', null, 10),
  ('Zapatas de freno trasero (tambor)', 'Frenos', null, 6),

  -- Neumáticos
  ('Neumático 175/65 R14', 'Neumáticos', '175/65 R14', 4),
  ('Neumático 195/65 R15', 'Neumáticos', '195/65 R15', 4),
  ('Neumático 205/55 R16', 'Neumáticos', '205/55 R16', 4),
  ('Neumático 215/45 R17', 'Neumáticos', '215/45 R17', 4),
  ('Válvula de neumático (juego)', 'Neumáticos', null, 20),
  ('Sensor de presión de neumáticos (TPMS)', 'Neumáticos', null, 4),

  -- Correas y transmisión
  ('Correa de distribución (kit con tensores)', 'Correas y transmisión', null, 6),
  ('Correa de accesorios (poly-V)', 'Correas y transmisión', null, 10),
  ('Kit de embrague completo', 'Correas y transmisión', null, 4),
  ('Rodamiento de rueda delantero', 'Correas y transmisión', null, 8),
  ('Rodamiento de rueda trasero', 'Correas y transmisión', null, 8),

  -- Encendido
  ('Bujía de encendido', 'Encendido', null, 40),
  ('Bujía de precalentamiento diésel', 'Encendido', null, 20),
  ('Bobina de encendido', 'Encendido', null, 8),
  ('Cable de bujía (juego)', 'Encendido', null, 6),

  -- Eléctrico
  ('Batería 12V 45Ah', 'Eléctrico', '45Ah', 5),
  ('Batería 12V 60Ah', 'Eléctrico', '60Ah', 5),
  ('Batería 12V 70Ah', 'Eléctrico', '70Ah', 4),
  ('Bombilla H1', 'Eléctrico', null, 15),
  ('Bombilla H4', 'Eléctrico', null, 15),
  ('Bombilla H7', 'Eléctrico', null, 20),
  ('Bombilla LED W5W', 'Eléctrico', null, 20),
  ('Fusibles surtidos (caja)', 'Eléctrico', null, 10),
  ('Escobillas de motor de arranque', 'Eléctrico', null, 6),

  -- Suspensión y dirección
  ('Amortiguador delantero', 'Suspensión y dirección', null, 8),
  ('Amortiguador trasero', 'Suspensión y dirección', null, 8),
  ('Rótula de dirección', 'Suspensión y dirección', null, 10),
  ('Terminal de dirección', 'Suspensión y dirección', null, 10),
  ('Muelle de suspensión', 'Suspensión y dirección', null, 6),

  -- Refrigeración
  ('Radiador de agua (genérico)', 'Refrigeración', null, 3),
  ('Termostato', 'Refrigeración', null, 10),
  ('Manguito de refrigerante', 'Refrigeración', null, 8),
  ('Electroventilador', 'Refrigeración', null, 3),

  -- Escape
  ('Silencioso trasero (genérico)', 'Escape', null, 3),
  ('Catalizador (genérico)', 'Escape', null, 2),
  ('Junta de escape', 'Escape', null, 15),

  -- Limpieza y consumibles
  ('Escobilla limpiaparabrisas 500mm', 'Limpieza y consumibles', '500mm', 10),
  ('Escobilla limpiaparabrisas 600mm', 'Limpieza y consumibles', '600mm', 10),
  ('Líquido limpiaparabrisas', 'Limpieza y consumibles', '5L', 15),
  ('Guantes de nitrilo (caja 100)', 'Limpieza y consumibles', null, 10),
  ('Trapos industriales (paquete)', 'Limpieza y consumibles', null, 10),
  ('Abrazaderas surtidas (caja)', 'Limpieza y consumibles', null, 10)
on conflict (nombre) do nothing;
