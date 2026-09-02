import { useEffect, useState } from 'react';
import { Car, Check, Loader2, Link2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TipoServicio } from '../lib/types';

const ETIQUETAS_SERVICIO: Record<TipoServicio, string> = {
  mantenimiento: 'Mantenimiento',
  neumaticos: 'Neumáticos',
  averia: 'Avería',
  pre_itv: 'Pre ITV',
};

interface OrdenDisponible {
  id: string;
  tipo_servicio: TipoServicio;
  matricula: string;
  clienteNombre: string;
}

interface EnlazarOrdenModalProps {
  open: boolean;
  coche: { id: string; matricula: string } | null;
  onClose: () => void;
  /** Se llama tras enlazar correctamente, para que Flota recargue y muestre
   *  el coche ya prestado. */
  onEnlazado: () => void;
}

function valorInicialDevolucion(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Enlaza un coche de sustitución concreto a una orden de trabajo, desde la
 * propia pestaña "Flota" (batch 19, parte 3) — el sentido contrario de
 * AsignarRepuestoModal (que parte de una orden y elige un coche libre): aquí
 * se parte del coche y se elige una orden activa que todavía no tenga
 * ninguno asignado. Mismo restultado final en `ordenes_trabajo`, solo
 * cambia desde qué pantalla se empieza.
 */
export default function EnlazarOrdenModal({ open, coche, onClose, onEnlazado }: EnlazarOrdenModalProps) {
  const [ordenes, setOrdenes] = useState<OrdenDisponible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enlazandoId, setEnlazandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fechaPrevista, setFechaPrevista] = useState(valorInicialDevolucion());

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    setError(null);
    setFechaPrevista(valorInicialDevolucion());
    (async () => {
      const { data, error: fetchError } = await supabase
        .from('ordenes_trabajo')
        .select(
          'id, tipo_servicio, vehiculos(matricula, clientes(nombre)), solicitudes(matricula, nombre_cliente)',
        )
        .in('estado', ['recepcionado', 'en_proceso', 'listo'])
        .or('coche_repuesto_id.is.null,fecha_devolucion_repuesto.not.is.null');
      if (fetchError) {
        if (!cancelado) {
          setError(fetchError.message);
          setCargando(false);
        }
        return;
      }
      if (!cancelado) {
        const lista = (data ?? []).map((o) => {
          const orden = o as unknown as {
            id: string;
            tipo_servicio: TipoServicio;
            vehiculos: { matricula: string; clientes: { nombre: string } | null } | null;
            solicitudes: { matricula: string | null; nombre_cliente: string } | null;
          };
          return {
            id: orden.id,
            tipo_servicio: orden.tipo_servicio,
            matricula: orden.vehiculos?.matricula ?? orden.solicitudes?.matricula ?? '—',
            clienteNombre: orden.vehiculos?.clientes?.nombre ?? orden.solicitudes?.nombre_cliente ?? 'Cliente',
          };
        });
        setOrdenes(lista);
        setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open]);

  if (!open || !coche) return null;

  const enlazar = async (orden: OrdenDisponible) => {
    setEnlazandoId(orden.id);
    setError(null);
    const { error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({
        coche_repuesto_id: coche.id,
        fecha_prestamo_repuesto: new Date().toISOString(),
        fecha_devolucion_repuesto: null,
        fecha_devolucion_repuesto_prevista: fechaPrevista ? new Date(fechaPrevista).toISOString() : null,
      })
      .eq('id', orden.id);
    setEnlazandoId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onEnlazado();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <Link2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Enlazar a una orden</h2>
              <p className="text-xs text-gray-500">Prestar {coche.matricula} a...</p>
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

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Devolución prevista (opcional)
          </label>
          <input
            type="datetime-local"
            value={fechaPrevista}
            onChange={(e) => setFechaPrevista(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando órdenes activas...
          </p>
        ) : ordenes.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            No hay ninguna orden activa (recepcionada, en proceso o lista) sin coche de sustitución
            ya asignado.
          </p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {ordenes.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => enlazar(o)}
                disabled={enlazandoId === o.id}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60"
              >
                <span className="flex items-center gap-2 text-left">
                  <Car className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>
                    <span className="block font-medium text-gray-900">{o.matricula}</span>
                    <span className="block text-xs text-gray-500">
                      {o.clienteNombre} · {ETIQUETAS_SERVICIO[o.tipo_servicio]}
                    </span>
                  </span>
                </span>
                {enlazandoId === o.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                ) : (
                  <Check className="h-4 w-4 text-gray-300" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
