-- =============================================================
-- TallerGo · Limpiar datos de prueba antes de producción
-- Ejecutar en el SQL Editor de tu proyecto Supabase.
--
-- A diferencia de reset_database.sql (que BORRA Y RECREA las tablas
-- desde cero — hay que volver a correr schema.sql después, y siempre
-- vuelve a insertar el cliente de ejemplo "Juan Pérez"), este script
-- solo BORRA FILAS de las tablas de prueba: las tablas, las políticas
-- RLS y el resto de la estructura se quedan tal cual están, no hace
-- falta ejecutar nada más después.
--
-- Qué borra:
--   - Todos los clientes, vehículos, órdenes de trabajo, inspecciones
--     de entrada, piezas usadas registradas y solicitudes del Portal
--     de cliente (incluido el cliente de ejemplo "Juan Pérez" si sigue
--     ahí).
--   - Todo el inventario actual, y lo vuelve a dejar en su catálogo
--     inicial de 55 items "de fábrica" (mismas cantidades que al
--     instalar la app por primera vez) en "Almacén 1". Si has creado
--     más de un almacén, o items propios que no estaban en el
--     catálogo original, se pierden con este paso.
--
-- Qué NO toca:
--   - Las cuentas de personal/encargado (tabla `perfiles` + Supabase
--     Auth) — nadie pierde su acceso a la app.
--   - Las cuentas de cliente del Portal ya registradas en Supabase
--     Auth (solo se borran sus solicitudes, no la cuenta en sí; para
--     borrar también esas cuentas, hazlo aparte desde
--     Authentication → Users).
--   - Los archivos ya subidos a Storage (fotos, firmas, PDFs de
--     prueba) — borrar filas de la base de datos no borra los
--     archivos ya subidos. Para vaciarlos, hazlo aparte desde el
--     panel de Storage de Supabase (ver README, sección 24).
-- =============================================================

-- 1. Datos de prueba de clientes/vehículos/pedidos.
delete from piezas_usadas;
delete from inspecciones_entrada;
delete from solicitudes;
delete from ordenes_trabajo;
delete from vehiculos;
delete from clientes;

-- 2. Inventario: vuelve al catálogo inicial de 55 items "de fábrica",
--    todos en "Almacén 1".
delete from inventario_items;
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
