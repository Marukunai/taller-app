import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, ImageOff, Loader2, MessageCircle, PenLine, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import SignatureModal from '../components/SignatureModal';
import { generarYSubirInformeSalida } from '../lib/generateExitReportPdf';
import { buildWhatsAppLinkSalida } from '../lib/whatsapp';
import type { EstadoOrden, TipoServicio } from '../lib/types';

const ETIQUETAS_SERVICIO: Record<TipoServicio, string> = {
  mantenimiento: 'Mantenimiento',
  neumaticos: 'Neumáticos',
  averia: 'Avería',
};

interface OrdenListo {
  id: string;
  estado: EstadoOrden;
  tipo_servicio: TipoServicio;
  fecha_entrada: string | null;
  vehiculos: {
    matricula: string;
    marca: string | null;
    modelo: string | null;
    color: string | null;
    clientes: { nombre: string; telefono: string } | null;
  } | null;
  inspecciones_entrada: { fotos_urls: string[] | null; pdf_informe_url: string | null }[] | null;
}

interface CheckoutFormProps {
  /** Id de orden preseleccionada (p. ej. al venir del Panel de gestión). */
  ordenIdInicial?: string | null;
  /** Se llama tras confirmar la entrega, para volver a la pantalla anterior. */
  onEntregado?: () => void;
}

/** Primera foto subida en la inspección de entrada, si hay alguna — se
 *  muestra en grande al confirmar la entrega para evitar equivocarse de
 *  vehículo cuando hay varios listos a la vez. */
function primeraFoto(orden: OrdenListo): string | null {
  const fotos = orden.inspecciones_entrada?.[0]?.fotos_urls;
  return fotos && fotos.length > 0 ? fotos[0] : null;
}

/** Traduce un color en texto libre a un valor CSS aproximado (misma lógica
 *  que en el Panel de gestión, para que la pastilla de color se vea igual
 *  en las dos pantallas). */
function colorCss(color: string): string {
  const normalizado = color.trim().toLowerCase();
  const MAPA: Record<string, string> = {
    blanco: '#f8fafc',
    negro: '#1f2937',
    gris: '#9ca3af',
    'gris plata': '#cbd5e1',
    plata: '#cbd5e1',
    plateado: '#cbd5e1',
    rojo: '#ef4444',
    azul: '#3b82f6',
    verde: '#22c55e',
    amarillo: '#eab308',
    naranja: '#f97316',
    marron: '#78350f',
    marrón: '#78350f',
    beige: '#e7dfc6',
    dorado: '#ca8a04',
    morado: '#8b5cf6',
    violeta: '#8b5cf6',
    rosa: '#f472b6',
    granate: '#7f1d1d',
    turquesa: '#14b8a6',
  };
  return MAPA[normalizado] ?? color ?? '#9ca3af';
}

/**
 * Checkout de salida: selecciona un vehículo marcado como "Listo", recoge la
 * segunda firma (conformidad de entrega) y marca la orden como "entregado".
 * Muestra foto y color del vehículo tanto en la lista como en la tarjeta de
 * confirmación, precisamente para evitar entregar el vehículo equivocado
 * cuando hay varios listos a la vez.
 */
export default function CheckoutForm({ ordenIdInicial, onEntregado }: CheckoutFormProps) {
  const [ordenesListas, setOrdenesListas] = useState<OrdenListo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenListo | null>(null);
  const [modalFirmaAbierto, setModalFirmaAbierto] = useState(false);
  const [entregando, setEntregando] = useState(false);
  const [exito, setExito] = useState(false);
  const [generandoInforme, setGenerandoInforme] = useState(false);
  const [resultado, setResultado] = useState<{ pdfUrl: string; whatsappUrl: string } | null>(null);
  const [avisoInforme, setAvisoInforme] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCargando(true);
      const { data, error: fetchError } = await supabase
        .from('ordenes_trabajo')
        .select(
          'id, estado, tipo_servicio, fecha_entrada, ' +
            'vehiculos(matricula, marca, modelo, color, clientes(nombre, telefono)), ' +
            'inspecciones_entrada(fotos_urls, pdf_informe_url)',
        )
        .eq('estado', 'listo')
        .order('fecha_entrada', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        const lista = (data ?? []) as unknown as OrdenListo[];
        setOrdenesListas(lista);
        if (ordenIdInicial) {
          const preseleccionada = lista.find((o) => o.id === ordenIdInicial);
          if (preseleccionada) setOrdenSeleccionada(preseleccionada);
        }
      }
      setCargando(false);
    })();
  }, [ordenIdInicial]);

  const confirmarEntrega = async (firmaUrl: string) => {
    if (!ordenSeleccionada) return;
    setEntregando(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({
        estado: 'entregado',
        firma_salida_url: firmaUrl,
        fecha_entrega: new Date().toISOString(),
      })
      .eq('id', ordenSeleccionada.id);
    setEntregando(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const orden = ordenSeleccionada;
    setOrdenesListas((prev) => prev.filter((o) => o.id !== orden.id));
    setOrdenSeleccionada(null);
    setExito(true);

    // Informe PDF de salida (client-side) + enlace de WhatsApp — no bloquea
    // la entrega si falla, solo se muestra un aviso aparte (igual que el
    // informe de entrada en el Check-in).
    setGenerandoInforme(true);
    try {
      const pdfUrl = await generarYSubirInformeSalida({
        ordenId: orden.id,
        matricula: orden.vehiculos?.matricula ?? 'sin-matricula',
        cliente: {
          nombre: orden.vehiculos?.clientes?.nombre ?? 'Cliente',
          telefono: orden.vehiculos?.clientes?.telefono,
        },
        vehiculo: {
          matricula: orden.vehiculos?.matricula ?? '—',
          marca: orden.vehiculos?.marca,
          modelo: orden.vehiculos?.modelo,
        },
        tipoServicio: orden.tipo_servicio,
        fechaEntrada: orden.fecha_entrada,
        pdfEntradaUrl: orden.inspecciones_entrada?.[0]?.pdf_informe_url ?? null,
        firmaUrl,
      });

      await supabase.from('ordenes_trabajo').update({ pdf_salida_url: pdfUrl }).eq('id', orden.id);

      const whatsappUrl = buildWhatsAppLinkSalida({
        telefono: orden.vehiculos?.clientes?.telefono,
        nombreCliente: orden.vehiculos?.clientes?.nombre ?? 'Cliente',
        matricula: orden.vehiculos?.matricula ?? '—',
        pdfUrl,
      });
      setResultado({ pdfUrl, whatsappUrl });
    } catch (pdfErr) {
      setAvisoInforme(
        pdfErr instanceof Error
          ? `Vehículo entregado, pero falló la generación del informe de salida: ${pdfErr.message}`
          : 'Vehículo entregado, pero falló la generación del informe de salida.',
      );
    } finally {
      setGenerandoInforme(false);
    }
  };

  if (exito) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
        </span>
        <h1 className="mb-2 text-xl font-bold text-gray-900">Vehículo entregado</h1>
        <p className="mb-6 text-sm text-gray-500">La firma de conformidad se ha guardado correctamente.</p>

        {generandoInforme && (
          <p className="mb-6 flex items-center justify-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generando informe de entrega...
          </p>
        )}

        {resultado && (
          <div className="mb-6 space-y-3 rounded-lg bg-green-50 px-4 py-3 text-left text-sm text-green-700">
            <p className="font-medium">Informe de entrega generado correctamente.</p>
            <div className="flex flex-wrap gap-3">
              <a
                href={resultado.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-3 py-1.5 font-medium text-green-700 hover:bg-green-100"
              >
                <ExternalLink className="h-4 w-4" /> Ver informe (PDF)
              </a>
              <a
                href={resultado.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 font-medium text-white hover:bg-green-700"
              >
                <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
              </a>
            </div>
          </div>
        )}

        {avisoInforme && (
          <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-left text-sm text-amber-700">
            {avisoInforme}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            setExito(false);
            setResultado(null);
            setAvisoInforme(null);
            onEntregado?.();
          }}
          className="rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-blue-700"
        >
          Volver al panel
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
          <Truck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entrega del vehículo</h1>
          <p className="text-sm text-gray-500">
            Selecciona un vehículo listo para entregar y recoge la firma de conformidad del cliente.
          </p>
        </div>
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando vehículos listos...
        </p>
      ) : !ordenSeleccionada ? (
        ordenesListas.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
            No hay vehículos marcados como "Listo" para entregar ahora mismo.
          </p>
        ) : (
          <>
            {ordenesListas.length > 1 && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Hay {ordenesListas.length} vehículos listos a la vez — fíjate en la foto, el color y
                la matrícula antes de confirmar la entrega.
              </p>
            )}
            <ul className="space-y-3">
              {ordenesListas.map((orden) => {
                const foto = primeraFoto(orden);
                return (
                  <li key={orden.id}>
                    <button
                      type="button"
                      onClick={() => setOrdenSeleccionada(orden)}
                      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      {foto ? (
                        <img
                          src={foto}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-lg border border-gray-100 object-cover"
                        />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-300">
                          <ImageOff className="h-6 w-6" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900">{orden.vehiculos?.matricula ?? '—'}</p>
                        <p className="truncate text-sm text-gray-500">
                          {[orden.vehiculos?.marca, orden.vehiculos?.modelo].filter(Boolean).join(' ') ||
                            'Sin marca/modelo'}
                          {' · '}
                          {orden.vehiculos?.clientes?.nombre ?? 'Cliente desconocido'}
                        </p>
                        {orden.vehiculos?.color && (
                          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-500">
                            <span
                              className="h-2.5 w-2.5 rounded-full border border-gray-300"
                              style={{ backgroundColor: colorCss(orden.vehiculos.color) }}
                            />
                            {orden.vehiculos.color}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                        {ETIQUETAS_SERVICIO[orden.tipo_servicio]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )
      ) : (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            {primeraFoto(ordenSeleccionada) ? (
              <img
                src={primeraFoto(ordenSeleccionada) ?? undefined}
                alt=""
                className="h-24 w-24 shrink-0 rounded-xl border border-gray-100 object-cover"
              />
            ) : (
              <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-300">
                <ImageOff className="h-8 w-8" />
              </span>
            )}
            <div>
              <p className="text-sm text-gray-500">Vehículo</p>
              <p className="text-lg font-semibold text-gray-900">{ordenSeleccionada.vehiculos?.matricula}</p>
              <p className="text-sm text-gray-600">
                {[ordenSeleccionada.vehiculos?.marca, ordenSeleccionada.vehiculos?.modelo]
                  .filter(Boolean)
                  .join(' ')}
              </p>
              {ordenSeleccionada.vehiculos?.color && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-gray-600">
                  <span
                    className="h-3 w-3 rounded-full border border-gray-300"
                    style={{ backgroundColor: colorCss(ordenSeleccionada.vehiculos.color) }}
                  />
                  {ordenSeleccionada.vehiculos.color}
                </p>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-500">Cliente</p>
            <p className="text-sm font-medium text-gray-900">{ordenSeleccionada.vehiculos?.clientes?.nombre}</p>
            <p className="text-sm text-gray-500">{ordenSeleccionada.vehiculos?.clientes?.telefono}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setOrdenSeleccionada(null)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cambiar vehículo
            </button>
            <button
              type="button"
              onClick={() => setModalFirmaAbierto(true)}
              disabled={entregando}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-blue-700 disabled:opacity-60"
            >
              {entregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
              Recoger firma de entrega
            </button>
          </div>
        </div>
      )}

      <SignatureModal
        open={modalFirmaAbierto}
        tipo="salida"
        referencia={ordenSeleccionada?.vehiculos?.matricula ?? 'sin-matricula'}
        onClose={() => setModalFirmaAbierto(false)}
        onSaved={(url) => {
          setModalFirmaAbierto(false);
          void confirmarEntrega(url);
        }}
      />
    </div>
  );
}
