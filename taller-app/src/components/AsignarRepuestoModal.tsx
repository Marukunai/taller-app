import { useEffect, useState } from 'react';
import { Car, Check, Loader2, Truck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CocheDisponible {
  id: string;
  matricula: string;
  marca: string | null;
  modelo: string | null;
}

interface AsignarRepuestoModalProps {
  open: boolean;
  ordenId: string | null;
  matriculaCliente: string;
  onClose: () => void;
  /** Se llama tras asignar correctamente, para que el Panel de gestión
   *  recargue las órdenes y muestre el coche ya asignado. */
  onAsignado: () => void;
}

/**
 * Asigna un coche de sustitución libre de la flota a una orden de trabajo
 * concreta. La disponibilidad no se guarda en ningún sitio aparte: se
 * calcula aquí mismo comparando la flota activa (coches_repuesto donde
 * baja = false) contra las órdenes que ahora mismo tienen uno prestado sin
 * devolver (fecha_devolucion_repuesto is null).
 */
export default function AsignarRepuestoModal({
  open,
  ordenId,
  matriculaCliente,
  onClose,
  onAsignado,
}: AsignarRepuestoModalProps) {
  const [coches, setCoches] = useState<CocheDisponible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [asignandoId, setAsignandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    setError(null);
    (async () => {
      const { data: flota, error: flotaError } = await supabase
        .from('coches_repuesto')
        .select('id, matricula, marca, modelo')
        .eq('baja', false)
        .order('matricula', { ascending: true });
      if (flotaError) {
        if (!cancelado) {
          setError(flotaError.message);
          setCargando(false);
        }
        return;
      }
      const { data: prestados, error: prestadosError } = await supabase
        .from('ordenes_trabajo')
        .select('coche_repuesto_id')
        .not('coche_repuesto_id', 'is', null)
        .is('fecha_devolucion_repuesto', null);
      if (prestadosError) {
        if (!cancelado) {
          setError(prestadosError.message);
          setCargando(false);
        }
        return;
      }
      const idsPrestados = new Set(
        (prestados ?? []).map((p) => p.coche_repuesto_id as string),
      );
      if (!cancelado) {
        setCoches(((flota ?? []) as CocheDisponible[]).filter((c) => !idsPrestados.has(c.id)));
        setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open]);

  if (!open || !ordenId) return null;

  const asignar = async (coche: CocheDisponible) => {
    setAsignandoId(coche.id);
    setError(null);
    const { error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({
        coche_repuesto_id: coche.id,
        fecha_prestamo_repuesto: new Date().toISOString(),
        fecha_devolucion_repuesto: null,
      })
      .eq('id', ordenId);
    setAsignandoId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onAsignado();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <Truck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Coche de sustitución</h2>
              <p className="text-xs text-gray-500">Para el cliente de {matriculaCliente}</p>
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
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando coches libres...
          </p>
        ) : coches.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            No hay ningún coche de sustitución libre ahora mismo. Gestiona la flota desde la
            pestaña "Flota".
          </p>
        ) : (
          <div className="space-y-2">
            {coches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => asignar(c)}
                disabled={asignandoId === c.id}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60"
              >
                <span className="flex items-center gap-2 text-left">
                  <Car className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>
                    <span className="block font-medium text-gray-900">{c.matricula}</span>
                    <span className="block text-xs text-gray-500">
                      {[c.marca, c.modelo].filter(Boolean).join(' ') || 'Sin marca/modelo'}
                    </span>
                  </span>
                </span>
                {asignandoId === c.id ? (
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
