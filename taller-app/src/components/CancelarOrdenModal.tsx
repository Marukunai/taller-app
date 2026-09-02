import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CancelarOrdenModalProps {
  open: boolean;
  ordenId: string | null;
  matricula: string;
  onClose: () => void;
  /** Se llama tras cancelar correctamente, para que el Panel de gestión
   *  actualice su lista sin tener que recargar todo. */
  onCancelada: (motivo: string | null) => void;
}

/**
 * Cancela una orden de trabajo (p. ej. el cliente cambia de idea). Por
 * decisión del usuario, cancelar NO borra la orden: pasa a estado
 * "Cancelado" con un motivo opcional, y queda en el histórico. Lo que SÍ
 * hace automáticamente (vía la función SQL `cancelar_orden_devolviendo_
 * stock`, en una sola operación atómica) es devolver al inventario
 * cualquier pieza que se hubiera registrado como usada en esta orden — si
 * el trabajo no llega a completarse, esas piezas nunca se llegaron a
 * consumir de verdad.
 */
export default function CancelarOrdenModal({
  open,
  ordenId,
  matricula,
  onClose,
  onCancelada,
}: CancelarOrdenModalProps) {
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !ordenId) return null;

  const cerrarYResetear = () => {
    setMotivo('');
    setError(null);
    onClose();
  };

  const confirmarCancelacion = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('cancelar_orden_devolviendo_stock', {
      p_orden_id: ordenId,
      p_motivo: motivo.trim() || null,
    });
    setGuardando(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onCancelada(motivo.trim() || null);
    setMotivo('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Cancelar orden</h2>
              <p className="text-xs text-gray-500">Vehículo {matricula}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrarYResetear}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <form onSubmit={confirmarCancelacion} className="space-y-4">
          <p className="text-sm text-gray-500">
            La orden pasará a estado "Cancelado" — no se borra nada, queda en el histórico. Si
            tenía piezas del inventario registradas como usadas, se devuelven automáticamente al
            stock.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Motivo (opcional)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej. El cliente ha cambiado de idea..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={cerrarYResetear}
              className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {guardando ? 'Cancelando...' : 'Confirmar cancelación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
