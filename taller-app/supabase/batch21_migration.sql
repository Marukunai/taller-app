-- =============================================================
-- Migración incremental — Batch 21: 3 cambios independientes.
-- Segura de re-ejecutar más de una vez.
--
-- 1. Solo dueño/encargado/admin puede marcar DEVUELTO un coche de
--    sustitución (antes cualquier personal podía) — se refuerza también
--    a nivel de base de datos, no solo ocultando el botón en la interfaz.
-- 2. Arregla un fallo real: `presupuesto_piezas.cantidad` seguía siendo
--    `int`, así que una pieza usada con cantidad decimal (ej. 0.5 L de
--    aceite) rompía el cálculo del presupuesto/factura al "Recalcular
--    piezas". De paso, salvaguarda por si nunca llegó a ejecutarse
--    `checkin_split_y_decimales_migration.sql`: reintenta pasar
--    `inventario_items.cantidad` / `piezas_usadas.cantidad` a numeric (no
--    hace nada si ya lo eran).
-- 3. Unidad de medida por item de inventario (ud/L/kg), para poder
--    llevar el stock de aceites/líquidos/grasa en litros o kilos reales
--    en vez de "número de envases", con incrementos de 1 o 0.5.
-- =============================================================

-- --- 1. Restringir devolución de coche de sustitución ---
-- Reemplaza la función creada en batch19_parte4_migration.sql — el
-- trigger `trg_restringir_prestamo_repuesto` ya existe y sigue apuntando
-- a esta misma función, no hace falta volver a crearlo.
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

-- --- 2. Cantidades decimales: arreglo de presupuesto_piezas + salvaguarda ---
alter table presupuesto_piezas alter column cantidad type numeric(10,2);
alter table inventario_items alter column cantidad type numeric(10,2);
alter table piezas_usadas alter column cantidad type numeric(10,2);

-- --- 3. Unidad de medida por item de inventario ---
alter table inventario_items add column if not exists unidad text not null default 'ud'
  check (unidad in ('ud', 'L', 'kg'));

-- Solo ETIQUETA los items del catálogo inicial que reconoce por nombre —
-- NO toca `cantidad` en absoluto: la cantidad de hoy de estos items sigue
-- contando "envases/garrafas" (ej. "20" = 20 garrafas de 5L), no litros o
-- kilos reales. Una vez aplicada esta migración, hay que revisar y
-- corregir a mano, una vez por item, la `cantidad` de cada uno desde el
-- propio Inventario para que pase a representar el stock real en L/kg
-- (ver README, sección 33) — solo el taller sabe cuánto queda de verdad.
update inventario_items set unidad = 'L'
where unidad = 'ud' and nombre in (
  'Aceite motor 5W30', 'Aceite motor 5W40', 'Aceite motor 10W40', 'Aceite motor 15W40',
  'Líquido de frenos DOT4', 'Líquido refrigerante concentrado', 'Líquido limpiaparabrisas'
);
update inventario_items set unidad = 'kg'
where unidad = 'ud' and nombre = 'Grasa multiusos';
