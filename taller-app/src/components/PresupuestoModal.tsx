import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Euro, Loader2, RefreshCw, Send, X, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { EstadoPresupuesto, Presupuesto, PresupuestoPieza } from '../lib/types';

interface PresupuestoModalProps {
  open: boolean;
  ordenId: string;
  solicitudId: string | null;
  matricula: string;
  onClose: () => void;
}

const ETIQUETA_ESTADO: Record<EstadoPresupuesto, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'bg-gray-100 text-gray-600' },
  enviado: { texto: 'Enviado al cliente', clase: 'bg-sky-100 text-sky-700' },
  aprobado: { texto: 'Aprobado por el cliente', clase: 'bg-emerald-100 text-emerald-700' },
  rechazado: { texto: 'Rechazado por el cliente', clase: 'bg-red-100 text-red-700' },
};

function euros(n: number): string {
  return `${n.toFixed(2)} €`;
}

/**
 * Modal del encargado para crear/editar el Presupuesto (factura interna) de
 * una orden de trabajo. NO es una factura fiscal (sin numeración oficial ni
 * desglose de IVA) — ver types.ts. Solo el encargado accede a esta pantalla
 * (RLS de `presupuestos`/`presupuesto_piezas` es exclusiva de es_encargado(),
 * y ManagementPanel solo muestra el botón que abre este modal si
 * `esEncargado`), así que un mecánico nunca ve ningún precio aquí.
 */
export default function PresupuestoModal({ open, ordenId, solicitudId, matricula, onClose }: PresupuestoModalProps) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null);
  const [piezas, setPiezas] = useState<PresupuestoPieza[]>([]);
  const [conceptoManoObra, setConceptoManoObra] = useState('');
  const [precioManoObra, setPrecioManoObra] = useState('0');
  const [guardando, setGuardando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('presupuestos')
      .select('id, orden_id, solicitud_id, concepto_mano_obra, precio_mano_obra, estado, nota_cliente, created_at, enviado_en, respondido_en, factura_pdf_url')
      .eq('orden_id', ordenId)
      .maybeSingle();
    if (fetchError) {
      setError(fetchError.message);
      setCargando(false);
      return;
    }
    const p = data as Presupuesto | null;
    setPresupuesto(p);
    setConceptoManoObra(p?.concepto_mano_obra ?? '');
    setPrecioManoObra(p ? String(p.precio_mano_obra) : '0');
    if (p) {
      const { data: piezasData, error: piezasError } = await supabase
        .from('presupuesto_piezas')
        .select('id, presupuesto_id, pieza_usada_id, nombre_item, cantidad, precio_unitario')
        .eq('presupuesto_id', p.id);
      if (piezasError) setError(piezasError.message);
      else setPiezas((piezasData ?? []) as PresupuestoPieza[]);
    } else {
      setPiezas([]);
    }
    setCargando(false);
  }, [ordenId]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [open, cargar]);

  if (!open) return null;

  /** Crea el presupuesto en 'borrador' si todavía no existe (al abrir el
   *  modal por primera vez para esta orden), copiando `solicitud_id` para
   *  que el cliente pueda verlo sin acceso a `ordenes_trabajo` (ver
   *  schema.sql). Devuelve la fila (nueva o existente). */
  const asegurarPresupuesto = async (): Promise<Presupuesto | null> => {
    if (presupuesto) return presupuesto;
    const { data, error: insertError } = await supabase
      .from('presupuestos')
      .insert({ orden_id: ordenId, solicitud_id: solicitudId })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
      return null;
    }
    const nuevo = data as Presupuesto;
    setPresupuesto(nuevo);
    return nuevo;
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const p = await asegurarPresupuesto();
    if (!p) {
      setGuardando(false);
      return;
    }
    const precio = Number(precioManoObra.replace(',', '.')) || 0;
    const { error: updateError } = await supabase
      .from('presupuestos')
      .update({ concepto_mano_obra: conceptoManoObra.trim() || null, precio_mano_obra: precio })
      .eq('id', p.id);
    setGuardando(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPresupuesto({ ...p, concepto_mano_obra: conceptoManoObra.trim() || null, precio_mano_obra: precio });
  };

  /** Recalcula el detalle de piezas desde `piezas_usadas` + `inventario_
   *  precios` (borra e inserta de nuevo — es un snapshot, no algo que se
   *  mantenga sincronizado solo). Necesario tras cada cambio de piezas
   *  usadas en la orden, o antes de enviar/generar la factura final. */
  const recalcularPiezas = async () => {
    setRecalculando(true);
    setError(null);
    const p = await asegurarPresupuesto();
    if (!p) {
      setRecalculando(false);
      return;
    }
    const [usadasRes, preciosRes] = await Promise.all([
      supabase.from('piezas_usadas').select('id, item_id, nombre_item, cantidad').eq('orden_id', ordenId),
      supabase.from('inventario_precios').select('item_id, precio_unitario'),
    ]);
    if (usadasRes.error) {
      setError(usadasRes.error.message);
      setRecalculando(false);
      return;
    }
    const mapaPrecios: Record<string, number> = {};
    for (const fila of preciosRes.data ?? []) {
      mapaPrecios[(fila as { item_id: string }).item_id] = Number(
        (fila as { precio_unitario: number }).precio_unitario,
      );
    }
    const nuevasLineas = (usadasRes.data ?? []).map((u) => {
      const usada = u as { id: string; item_id: string | null; nombre_item: string; cantidad: number };
      return {
        presupuesto_id: p.id,
        pieza_usada_id: usada.id,
        nombre_item: usada.nombre_item,
        cantidad: usada.cantidad,
        precio_unitario: usada.item_id ? (mapaPrecios[usada.item_id] ?? 0) : 0,
      };
    });

    const { error: deleteError } = await supabase.from('presupuesto_piezas').delete().eq('presupuesto_id', p.id);
    if (deleteError) {
      setError(deleteError.message);
      setRecalculando(false);
      return;
    }
    if (nuevasLineas.length > 0) {
      const { data: insertadas, error: insertError } = await supabase
        .from('presupuesto_piezas')
        .insert(nuevasLineas)
        .select();
      if (insertError) {
        setError(insertError.message);
        setRecalculando(false);
        return;
      }
      setPiezas((insertadas ?? []) as PresupuestoPieza[]);
    } else {
      setPiezas([]);
    }
    setRecalculando(false);
  };

  const cambiarEstado = async (estado: EstadoPresupuesto) => {
    setEnviando(true);
    setError(null);
    const p = await asegurarPresupuesto();
    if (!p) {
      setEnviando(false);
      return;
    }
    const cambios: Partial<Presupuesto> = { estado };
    if (estado === 'enviado') cambios.enviado_en = new Date().toISOString();
    const { error: updateError } = await supabase.from('presupuestos').update(cambios).eq('id', p.id);
    setEnviando(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPresupuesto({ ...p, ...cambios });
  };

  const totalPiezas = piezas.reduce((acc, p) => acc + p.cantidad * p.precio_unitario, 0);
  const total = totalPiezas + (Number(precioManoObra.replace(',', '.')) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <Euro className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Presupuesto / factura interna</h2>
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
          <div className="space-y-4">
            {presupuesto && (
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ETIQUETA_ESTADO[presupuesto.estado].clase}`}
              >
                {ETIQUETA_ESTADO[presupuesto.estado].texto}
              </span>
            )}
            {presupuesto?.nota_cliente && (
              <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Respuesta del cliente: {presupuesto.nota_cliente}
              </p>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Concepto mano de obra</label>
              <input
                value={conceptoManoObra}
                onChange={(e) => setConceptoManoObra(e.target.value)}
                placeholder="Ej. Mano de obra (2h)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Precio mano de obra (€)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={precioManoObra}
                onChange={(e) => setPrecioManoObra(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Piezas usadas (con precio)</label>
                <button
                  type="button"
                  onClick={recalcularPiezas}
                  disabled={recalculando}
                  className="flex items-center gap-1.5 rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >
                  {recalculando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Recalcular desde piezas usadas
                </button>
              </div>
              {piezas.length === 0 ? (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  Sin piezas calculadas todavía — pulsa "Recalcular" tras registrar las piezas usadas de esta
                  orden.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {piezas.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate text-gray-700">
                        {p.nombre_item} x{p.cantidad}
                      </span>
                      <span className="shrink-0 font-medium text-gray-800">
                        {euros(p.cantidad * p.precio_unitario)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              <span>Total</span>
              <span>{euros(total)}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
              >
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </button>
              {solicitudId && (
                <button
                  type="button"
                  onClick={() => cambiarEstado('enviado')}
                  disabled={enviando}
                  className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" /> Enviar al cliente
                </button>
              )}
              {!solicitudId && (
                <>
                  <button
                    type="button"
                    onClick={() => cambiarEstado('aprobado')}
                    disabled={enviando}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Marcar aprobado
                  </button>
                  <button
                    type="button"
                    onClick={() => cambiarEstado('rechazado')}
                    disabled={enviando}
                    className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" /> Marcar rechazado
                  </button>
                </>
              )}
            </div>
            {!solicitudId && (
              <p className="text-xs text-gray-400">
                Esta orden no viene de una solicitud del Portal, así que el cliente no tiene cuenta para
                responder aquí — puedes compartir el presupuesto por WhatsApp y marcar aprobado/rechazado
                a mano según lo que te confirme.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
