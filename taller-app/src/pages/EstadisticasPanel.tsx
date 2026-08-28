import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Clock, Euro, Loader2, RefreshCw, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { EstadoOrden } from '../lib/types';

const ETIQUETAS_ESTADO: Record<EstadoOrden, string> = {
  solicitado: 'Solicitado',
  recepcionado: 'Recepcionado',
  en_proceso: 'En proceso',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const COLOR_ESTADO: Record<EstadoOrden, string> = {
  solicitado: 'bg-slate-400',
  recepcionado: 'bg-sky-400',
  en_proceso: 'bg-amber-400',
  listo: 'bg-emerald-400',
  entregado: 'bg-indigo-500',
  cancelado: 'bg-red-400',
};

interface OrdenEstadistica {
  id: string;
  estado: EstadoOrden;
  tipo_servicio: string;
  fecha_entrada: string | null;
  fecha_entrega: string | null;
  created_at: string;
}

interface PiezaAgregada {
  nombre: string;
  cantidad: number;
}

interface MesIngreso {
  mes: string;
  total: number;
}

function euros(n: number): string {
  return `${n.toFixed(2)} €`;
}

/** Clave de mes ordenable + legible, p. ej. "2026-08" → "ago 2026". */
function claveMes(fecha: Date): { clave: string; label: string } {
  const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
  const label = fecha.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
  return { clave, label };
}

/** Barra horizontal simple con CSS puro (ancho en % relativo al máximo del
 *  grupo) — decisión explícita del proyecto: sin librería de gráficos
 *  nueva, para no depender de una instalación npm extra sobre el puente al
 *  dispositivo. Suficiente para los 4 indicadores pedidos. */
function BarraHorizontal({
  label,
  valor,
  max,
  color = 'bg-indigo-500',
  formato,
}: {
  label: string;
  valor: number;
  max: number;
  color?: string;
  formato: (n: number) => string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((valor / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="truncate text-gray-600">{label}</span>
        <span className="shrink-0 font-semibold text-gray-800">{formato(valor)}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-100">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Panel de estadísticas — solo encargado (ver App.tsx e ingresos, que es
 * información económica). Cuatro indicadores elegidos por el usuario:
 * tiempo medio de reparación, piezas más solicitadas, ingresos, y volumen
 * de órdenes por estado/mes. Todo calculado en el cliente a partir de
 * consultas simples — nada de vistas SQL nuevas, para mantenerlo dentro de
 * lo que ya expone la RLS existente.
 */
export default function EstadisticasPanel() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ordenes, setOrdenes] = useState<OrdenEstadistica[]>([]);
  const [piezas, setPiezas] = useState<PiezaAgregada[]>([]);
  const [ingresosPorMes, setIngresosPorMes] = useState<MesIngreso[]>([]);
  const [ingresoTotal, setIngresoTotal] = useState(0);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    const [ordenesRes, piezasRes, presupuestosRes] = await Promise.all([
      supabase.from('ordenes_trabajo').select('id, estado, tipo_servicio, fecha_entrada, fecha_entrega, created_at'),
      supabase.from('piezas_usadas').select('nombre_item, cantidad'),
      supabase.from('presupuestos').select('id, precio_mano_obra, estado, created_at'),
    ]);

    if (ordenesRes.error) {
      setError(ordenesRes.error.message);
      setCargando(false);
      return;
    }
    setOrdenes((ordenesRes.data ?? []) as OrdenEstadistica[]);

    // Piezas más solicitadas: agregado por nombre (nombre_item ya es un
    // texto congelado en el momento de usarla, ver types.ts).
    const mapaPiezas: Record<string, number> = {};
    for (const fila of piezasRes.data ?? []) {
      const f = fila as { nombre_item: string; cantidad: number };
      mapaPiezas[f.nombre_item] = (mapaPiezas[f.nombre_item] ?? 0) + f.cantidad;
    }
    setPiezas(
      Object.entries(mapaPiezas)
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 8),
    );

    // Ingresos: presupuestos aprobados (mano de obra + su detalle de
    // piezas). No se cuentan los que siguen en borrador/enviado/rechazado —
    // el precio "en firme" es el que el cliente aprobó (o, para una orden
    // de check-in directo, el que el encargado marcó aprobado a mano).
    if (!presupuestosRes.error) {
      const aprobados = (presupuestosRes.data ?? []).filter(
        (p) => (p as { estado: string }).estado === 'aprobado',
      ) as { id: string; precio_mano_obra: number; created_at: string }[];
      let totalPiezasPorPresupuesto: Record<string, number> = {};
      if (aprobados.length > 0) {
        const { data: piezasPresupuesto } = await supabase
          .from('presupuesto_piezas')
          .select('presupuesto_id, cantidad, precio_unitario')
          .in(
            'presupuesto_id',
            aprobados.map((p) => p.id),
          );
        totalPiezasPorPresupuesto = (piezasPresupuesto ?? []).reduce<Record<string, number>>((acc, fila) => {
          const f = fila as { presupuesto_id: string; cantidad: number; precio_unitario: number };
          acc[f.presupuesto_id] = (acc[f.presupuesto_id] ?? 0) + f.cantidad * f.precio_unitario;
          return acc;
        }, {});
      }
      const mapaMeses: Record<string, { label: string; total: number }> = {};
      let total = 0;
      for (const p of aprobados) {
        const importe = p.precio_mano_obra + (totalPiezasPorPresupuesto[p.id] ?? 0);
        total += importe;
        const { clave, label } = claveMes(new Date(p.created_at));
        mapaMeses[clave] = { label, total: (mapaMeses[clave]?.total ?? 0) + importe };
      }
      setIngresoTotal(total);
      setIngresosPorMes(
        Object.entries(mapaMeses)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-6)
          .map(([, v]) => ({ mes: v.label, total: v.total })),
      );
    }

    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  // Tiempo medio de reparación: entre fecha_entrada y fecha_entrega, solo
  // para órdenes ya entregadas con ambas fechas.
  const entregadas = ordenes.filter((o) => o.estado === 'entregado' && o.fecha_entrada && o.fecha_entrega);
  const tiempoMedioHoras =
    entregadas.length > 0
      ? entregadas.reduce((acc, o) => {
          const horas =
            (new Date(o.fecha_entrega as string).getTime() - new Date(o.fecha_entrada as string).getTime()) /
            (1000 * 60 * 60);
          return acc + Math.max(0, horas);
        }, 0) / entregadas.length
      : 0;

  const porEstado = (Object.keys(ETIQUETAS_ESTADO) as EstadoOrden[]).map((estado) => ({
    estado,
    cantidad: ordenes.filter((o) => o.estado === estado).length,
  }));
  const maxEstado = Math.max(1, ...porEstado.map((e) => e.cantidad));

  const mapaOrdenesMes: Record<string, { label: string; cantidad: number }> = {};
  for (const o of ordenes) {
    const { clave, label } = claveMes(new Date(o.created_at));
    mapaOrdenesMes[clave] = { label, cantidad: (mapaOrdenesMes[clave]?.cantidad ?? 0) + 1 };
  }
  const ordenesPorMes = Object.entries(mapaOrdenesMes)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, v]) => v);
  const maxOrdenesMes = Math.max(1, ...ordenesPorMes.map((m) => m.cantidad));
  const maxPiezas = Math.max(1, ...piezas.map((p) => p.cantidad));
  const maxIngresoMes = Math.max(1, ...ingresosPorMes.map((m) => m.total));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Estadísticas</h1>
            <p className="text-sm text-gray-500">Vista general del taller.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando estadísticas...
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Clock className="h-4 w-4 text-amber-500" /> Tiempo medio de reparación
            </h2>
            {entregadas.length === 0 ? (
              <p className="text-xs text-gray-400">Todavía no hay órdenes entregadas con fechas completas.</p>
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-900">
                  {tiempoMedioHoras < 24
                    ? `${tiempoMedioHoras.toFixed(1)} h`
                    : `${(tiempoMedioHoras / 24).toFixed(1)} días`}
                </p>
                <p className="text-xs text-gray-400">
                  Calculado sobre {entregadas.length} orden{entregadas.length !== 1 ? 'es' : ''} entregada
                  {entregadas.length !== 1 ? 's' : ''} (entrada → entrega).
                </p>
              </>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Euro className="h-4 w-4 text-emerald-500" /> Ingresos (presupuestos aprobados)
            </h2>
            <p className="text-3xl font-bold text-gray-900">{euros(ingresoTotal)}</p>
            {ingresosPorMes.length === 0 ? (
              <p className="text-xs text-gray-400">Sin presupuestos aprobados todavía.</p>
            ) : (
              <div className="space-y-2 pt-1">
                {ingresosPorMes.map((m) => (
                  <BarraHorizontal
                    key={m.mes}
                    label={m.mes}
                    valor={m.total}
                    max={maxIngresoMes}
                    color="bg-emerald-500"
                    formato={euros}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Wrench className="h-4 w-4 text-violet-500" /> Piezas más solicitadas
            </h2>
            {piezas.length === 0 ? (
              <p className="text-xs text-gray-400">Todavía no se ha registrado ninguna pieza usada.</p>
            ) : (
              <div className="space-y-2">
                {piezas.map((p) => (
                  <BarraHorizontal
                    key={p.nombre}
                    label={p.nombre}
                    valor={p.cantidad}
                    max={maxPiezas}
                    color="bg-violet-500"
                    formato={(n) => String(n)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <BarChart3 className="h-4 w-4 text-sky-500" /> Órdenes por estado
            </h2>
            <div className="space-y-2">
              {porEstado.map((e) => (
                <BarraHorizontal
                  key={e.estado}
                  label={ETIQUETAS_ESTADO[e.estado]}
                  valor={e.cantidad}
                  max={maxEstado}
                  color={COLOR_ESTADO[e.estado]}
                  formato={(n) => String(n)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <BarChart3 className="h-4 w-4 text-indigo-500" /> Volumen de órdenes por mes
            </h2>
            {ordenesPorMes.length === 0 ? (
              <p className="text-xs text-gray-400">Sin datos todavía.</p>
            ) : (
              <div className="space-y-2">
                {ordenesPorMes.map((m) => (
                  <BarraHorizontal
                    key={m.label}
                    label={m.label}
                    valor={m.cantidad}
                    max={maxOrdenesMes}
                    color="bg-indigo-500"
                    formato={(n) => String(n)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
