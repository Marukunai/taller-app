import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, Loader2, Search, Trash2, Wrench, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { InventarioItem, PiezaUsada } from '../lib/types';

interface PiezasUsadasModalProps {
  open: boolean;
  ordenId: string;
  matricula: string;
  onClose: () => void;
}

/**
 * Modal para registrar (y quitar) las piezas del inventario consumidas en
 * una orden de trabajo concreta. Añadir/quitar una pieza descuenta o repone
 * el stock del inventario automáticamente vía las funciones SQL
 * `registrar_pieza_usada` / `quitar_pieza_usada` (una sola operación
 * atómica en la base de datos, para que el registro y el descuento de
 * stock nunca queden desincronizados).
 */
export default function PiezasUsadasModal({ open, ordenId, matricula, onClose }: PiezasUsadasModalProps) {
  const [piezas, setPiezas] = useState<PiezaUsada[]>([]);
  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemSeleccionado, setItemSeleccionado] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [guardando, setGuardando] = useState(false);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);
  // Buscador del desplegable de inventario: con catálogos largos, encontrar
  // "Aceite motor 10W40 5L" en una lista sin filtrar es tedioso — se filtra
  // por nombre o categoría igual que en el propio Inventario.
  const [busquedaItem, setBusquedaItem] = useState('');

  useEffect(() => {
    if (!open) return;
    (async () => {
      setCargando(true);
      setError(null);
      const [piezasRes, inventarioRes] = await Promise.all([
        supabase
          .from('piezas_usadas')
          .select('id, orden_id, item_id, nombre_item, cantidad, created_at')
          .eq('orden_id', ordenId)
          .order('created_at', { ascending: true }),
        supabase
          .from('inventario_items')
          .select('id, nombre, tipo, tamano, cantidad, unidad, imagen_url')
          .order('tipo', { ascending: true })
          .order('nombre', { ascending: true }),
      ]);
      if (piezasRes.error) setError(piezasRes.error.message);
      else setPiezas((piezasRes.data ?? []) as PiezaUsada[]);
      if (inventarioRes.error) setError(inventarioRes.error.message);
      else setInventario((inventarioRes.data ?? []) as InventarioItem[]);
      setCargando(false);
    })();
  }, [open, ordenId]);

  const itemActual = useMemo(
    () => inventario.find((i) => i.id === itemSeleccionado) ?? null,
    [inventario, itemSeleccionado],
  );

  const inventarioFiltrado = useMemo(() => {
    const q = busquedaItem.trim().toLowerCase();
    if (!q) return inventario;
    return inventario.filter(
      (i) => i.nombre.toLowerCase().includes(q) || i.tipo.toLowerCase().includes(q),
    );
  }, [inventario, busquedaItem]);

  if (!open) return null;

  const recargarTrasCambio = async () => {
    const [piezasRes, inventarioRes] = await Promise.all([
      supabase
        .from('piezas_usadas')
        .select('id, orden_id, item_id, nombre_item, cantidad, created_at')
        .eq('orden_id', ordenId)
        .order('created_at', { ascending: true }),
      supabase
        .from('inventario_items')
        .select('id, nombre, tipo, tamano, cantidad, unidad, imagen_url')
        .order('tipo', { ascending: true })
        .order('nombre', { ascending: true }),
    ]);
    if (!piezasRes.error) setPiezas((piezasRes.data ?? []) as PiezaUsada[]);
    if (!inventarioRes.error) setInventario((inventarioRes.data ?? []) as InventarioItem[]);
  };

  const handleAgregar = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemSeleccionado) {
      setError('Selecciona un item del inventario.');
      return;
    }
    const cantidadNum = Number(cantidad);
    if (!cantidadNum || cantidadNum <= 0) {
      setError('Indica una cantidad válida.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('registrar_pieza_usada', {
      p_orden_id: ordenId,
      p_item_id: itemSeleccionado,
      p_cantidad: cantidadNum,
    });
    setGuardando(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await recargarTrasCambio();
    setItemSeleccionado('');
    setCantidad('1');
  };

  const handleQuitar = async (registroId: string) => {
    setQuitandoId(registroId);
    setError(null);
    const { error: rpcError } = await supabase.rpc('quitar_pieza_usada', {
      p_registro_id: registroId,
    });
    setQuitandoId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await recargarTrasCambio();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <Wrench className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Piezas usadas</h2>
              <p className="text-xs text-gray-500">Vehículo {matricula}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </p>
        ) : (
          <>
            {piezas.length === 0 ? (
              <p className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
                Todavía no se ha registrado ninguna pieza para esta orden.
              </p>
            ) : (
              <ul className="mb-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                {piezas.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-gray-800">{p.nombre_item}</span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 shadow-sm">
                      x{p.cantidad}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuitar(p.id)}
                      disabled={quitandoId === p.id}
                      className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      aria-label="Quitar pieza"
                    >
                      {quitandoId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              onSubmit={handleAgregar}
              className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Item del inventario</label>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    value={busquedaItem}
                    onChange={(e) => setBusquedaItem(e.target.value)}
                    placeholder="Buscar item por nombre o categoría..."
                    className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm"
                  />
                </div>
                <select
                  value={itemSeleccionado}
                  onChange={(e) => setItemSeleccionado(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecciona un item...</option>
                  {inventarioFiltrado.map((i) => (
                    <option key={i.id} value={i.id} disabled={i.cantidad === 0}>
                      {i.nombre}
                      {i.tamano ? ` (${i.tamano})` : ''} —{' '}
                      {i.cantidad === 0 ? 'Agotado' : `${i.cantidad}${sufijoUnidad(i.unidad)} disponibles`}
                    </option>
                  ))}
                </select>
                {busquedaItem.trim() && inventarioFiltrado.length === 0 && (
                  <p className="mt-1 text-xs text-gray-400">Ningún item coincide con esa búsqueda.</p>
                )}
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Cantidad</label>
                  <p className="mb-1 -mt-0.5 text-xs text-gray-400">
                    Admite decimales — ej. 0.5 o 5.5 para litros de aceite.
                  </p>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  {itemActual && itemActual.unidad !== 'ud' && (
                    <div className="mt-1.5 flex gap-1.5">
                      {[0.5, 1, 2].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setCantidad(String(v))}
                          className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
                        >
                          {v} {itemActual.unidad}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                >
                  {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                  {guardando ? 'Guardando...' : 'Añadir'}
                </button>
              </div>
              {itemActual && cantidad && Number(cantidad) > itemActual.cantidad && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Solo quedan {itemActual.cantidad}
                  {itemActual.unidad === 'ud' ? ' unidades' : ` ${itemActual.unidad}`} en el inventario.
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/** Sufijo a mostrar junto a una cantidad — vacío para 'ud' (una pieza
 *  contable sigue viéndose como un número pelado), " L" / " kg" para
 *  consumibles a granel (batch 21). */
function sufijoUnidad(unidad: string): string {
  return unidad === 'ud' ? '' : ` ${unidad}`;
}

