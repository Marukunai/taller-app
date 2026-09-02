-- =============================================================
-- Migración incremental — Batch 19, parte 3: agenda mensual, préstamo de
-- sustitución mejorado, aviso anual de revisión y datalists de
-- vehículo/neumático.
--
-- Segura de re-ejecutar más de una vez (todo con "if not exists").
-- No hace falta desplegar ninguna Edge Function nueva para esta parte: son
-- solo columnas nuevas, todas opcionales — nada dejará de funcionar en las
-- pantallas ya existentes si no se rellenan.
-- =============================================================

-- 1. Vehículo: combustible / año / motor (datalists) y aceptación del aviso
-- anual de revisión (checkbox junto a la firma de salida en la Entrega).
alter table vehiculos add column if not exists combustible text;
alter table vehiculos add column if not exists anio integer;
alter table vehiculos add column if not exists motor text;
alter table vehiculos add column if not exists aviso_anual_aceptado boolean not null default false;

-- 2. Orden de trabajo: fecha prevista de devolución del coche de
-- sustitución (préstamo mejorado) y medida de neumático por datalist
-- (ancho/perfil/llanta/índice de carga/índice de velocidad/estación) además
-- de la foto que ya existía.
alter table ordenes_trabajo add column if not exists fecha_devolucion_repuesto_prevista timestamp with time zone;
alter table ordenes_trabajo add column if not exists neumatico_ancho text;
alter table ordenes_trabajo add column if not exists neumatico_perfil text;
alter table ordenes_trabajo add column if not exists neumatico_llanta text;
alter table ordenes_trabajo add column if not exists neumatico_indice_carga text;
alter table ordenes_trabajo add column if not exists neumatico_indice_velocidad text;
alter table ordenes_trabajo add column if not exists neumatico_estacion text;

-- Nota sobre permisos: estas columnas nuevas viven en `vehiculos` y
-- `ordenes_trabajo`, que ya tienen RLS "for all using (es_personal())" —
-- cualquier cuenta de personal puede escribirlas, igual que el resto de
-- columnas de esas tablas. La restricción de "solo dueño/encargado/admin
-- pueden prestar un coche de sustitución" pedida por el usuario se aplica
-- SOLO en la interfaz (se oculta el botón a mecánico/recepcionista, ver
-- ManagementPanel.tsx/FlotaRepuestoPanel.tsx), igual que ya se hacía con el
-- botón de Presupuesto — no es una restricción a nivel de base de datos. Si
-- en el futuro hiciera falta impedirlo también por RLS (por ejemplo, si un
-- mecánico pudiera saltarse la restricción llamando directamente a la API),
-- se puede añadir una política aparte para `coche_repuesto_id`/
-- `fecha_prestamo_repuesto`/`fecha_devolucion_repuesto_prevista` que exija
-- `es_encargado()`.
