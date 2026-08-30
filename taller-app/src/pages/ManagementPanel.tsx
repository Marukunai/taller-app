import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Car,
  Euro,
  ImageOff,
  Loader2,
  Phone,
  RefreshCw,
  Truck,
  Undo2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import PiezasUsadasModal from '../components/PiezasUsadasModal';
import CitaRecogidaModal from '../components/CitaRecogidaModal';
import CancelarOrdenModal from '../components/CancelarOrdenModal';
import AsignarRepuestoModal from '../components/AsignarRepuestoModal';
import PresupuestoModal from '../components/PresupuestoModal';
import type { EstadoOrden, EstadoPresupuesto, OrdenPendienteRecepcion, TipoServicio } from '../lib/types';

/** Estados en los que el vehículo ya está físicamente en el taller — solo
 *  en estos tiene sentido ofrecer/gestionar un coche de sustitución. */
const ESTADOS_CON_VEHICULO_EN_TALLER: EstadoOrden[] = ['recepcionado', 'en_proceso', 'listo'];

const ESTADOS: { value: EstadoOrden; label: string; barra: string; fondo: string }[] = [
  { value: 'solicitado', label: 'Solicitado', barra: 'bg-slate-400', fondo: 'bg-slate-50' },
  { value: 'recepcionado', label: 'Recepcionado', barra: 'bg-sky-400', fondo: 'bg-sky-50' },
  { value: 'en_proceso', label: 'En proceso', barra: 'bg-amber-400', fondo: 'bg-amber-50' },
  { value: 'listo', label: 'Listo', barra: 'bg-emerald-400', fondo: 'bg-emerald-50' },
  { value: 'entregado', label: 'Entregado', barra: 'bg-gray-400', fondo: 'bg-gray-50' },
  { value: 'cancelado', label: 'Cancelado', barra: 'bg-red-400', fondo: 'bg-red-50' },
];

const SIGUIENTE_ESTADO: Partial<Record<EstadoOrden, EstadoOrden>> = {
  solicitado: 'recepcionado',
  recepcionado: 'en_proceso',
  en_proceso: 'listo',
};

/** Estados desde los que todavía tiene sentido cancelar la orden (una vez
 *  entregada o ya cancelada, no aplica). */
const CANCELABLE: EstadoOrden[] = ['solicitado', 'recepcionado', 'en_proceso', 'listo'];

/** La columna "Entregado" deja de mostrar un vehículo pasados 3 días desde
 *  su entrega — no se borra nada: la orden sigue intacta en la base de
 *  datos (fotos, firma, PDF y precio incluidos) y se sigue pudiendo
 *  consultar en el Historial de vehículo por matrícula (ver
 *  HistorialVehiculo.tsx). Es solo para que el tablero de "Panel de
 *  gestión" no se llene de coches ya entregados hace semanas. */
const OCULTAR_ENTREGADOS_TRAS_MS = 3 * 24 * 60 * 60 * 1000;

const ETIQUETAS_SERVICIO: Record<TipoServicio, string> = {
  mantenimiento: 'Mantenimiento',
  neumaticos: 'Neumáticos',
  averia: 'Avería',
};

const ETIQUETA_PRESUPUESTO_CORTA: Record<EstadoPresupuesto, string> = {
  borrador: 'borrador',
  enviado: 'enviado',
  aprobado: 'aprobado',
  rechazado: 'rechazado',
};

interface OrdenPanel {
  id: string;
  estado: EstadoOrden;
  tipo_servicio: TipoServicio;
  descripcion_averia: string | null;
  fecha_entrada: string | null;
  fecha_entrega: string | null;
  cita_recogida: string | null;
  motivo_cancelacion: string | null;
  vehiculos: {
    matricula: string;
    marca: string | null;
    modelo: string | null;
    color: string | null;
    clientes: { nombre: string; telefono: string; email: string | null } | null;
  } | null;
  inspecciones_entrada: { fotos_urls: string[] | null }[] | null;
  piezas_usadas: { id: string }[] | null;
  // Presente solo si esta orden nació de aceptar una solicitud del Portal
  // de cliente (ver SolicitudesPanel) — mientras `vehiculos` sigue siendo
  // null (coche aún no recibido), esto es lo único que hay para mostrar en
  // la tarjeta.
  solicitudes: {
    nombre_cliente: string;
    telefono_cliente: string | null;
    email_cliente: string;
    matricula: string | null;
    marca: string | null;
    modelo: string | null;
  } | null;
  coche_repuesto_id: string | null;
  fecha_devolucion_repuesto: string | null;
  coches_repuesto: { matricula: string; marca: string | null; modelo: string | null } | null;
  solicitud_id: string | null;
}

interface ManagementPanelProps {
  /** Si se pasa, las órdenes en estado "listo" muestran un botón para pasar
   *  a la pantalla de entrega (checkout con segunda firma) en vez de un
   *  simple botón de avanzar estado. */
  onEntregar?: (ordenId: string) => void;
  /** Si se pasa, las órdenes en estado "Solicitado" muestran un botón
   *  "Recibir vehículo" que lleva al Check-in prellenado con los datos que
   *  ya dio el cliente, en vez de un simple botón de avanzar estado (que
   *  saltaría el check-in real: DNI, fotos, daños y firma). */
  onRecibirDesdeSolicitud?: (pendiente: OrdenPendienteRecepcion) => void;
  /** Solo el encargado ve el botón de Presupuesto/factura interna (nunca un
   *  mecánico, ver PresupuestoModal.tsx) — si no se pasa (o es false), ni
   *  siquiera se hace la consulta ligera de presupuestos por orden. */
  esEncargado?: boolean;
}

/** Primera foto subida en la inspección de entrada de una orden, si hay
 *  alguna — se usa como miniatura para reconocer el vehículo de un vistazo
 *  y no confundirlo con otro al entregarlo. */
function primeraFoto(orden: OrdenPanel): string | null {
  const fotos = orden.inspecciones_entrada?.[0]?.fotos_urls;
  return fotos && fotos.length > 0 ? fotos[0] : null;
}

const SELECT_ORDENES =
  'id, estado, tipo_servicio, descripcion_averia, fecha_entrada, fecha_entrega, cita_recogida, motivo_cancelacion, ' +
  'vehiculos(matricula, marca, modelo, color, clientes(nombre, telefono, email)), ' +
  'inspecciones_entrada(fotos_urls), piezas_usadas(id), ' +
  'solicitudes(nombre_cliente, telefono_cliente, email_cliente, matricula, marca, modelo), ' +
  'coche_repuesto_id, fecha_devolucion_repuesto, coches_repuesto(matricula, marca, modelo), solicitud_id';

/**
 * Tablero de órdenes de trabajo agrupadas por estado, con un botón por
 * tarjeta para avanzar al siguiente estado del flujo del taller. Las
 * solicitudes de cita (tanto las que crea el cliente desde el Portal como
 * las que registra el propio personal) viven en su propia pestaña de nivel
 * superior — ver SolicitudCitaPanel.tsx / App.tsx — en vez de aquí dentro,
 * para que el aviso de "hay una cita pendiente de revisar" no dependa de
 * haber entrado primero al Panel de gestión.
 */
export default function ManagementPanel({ onEntregar, onRecibirDesdeSolicitud, esEncargado }: ManagementPanelProps) {
  const [ordenes, setOrdenes] = useState<OrdenPanel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  const [piezasModal, setPiezasModal] = useState<{ ordenId: string; matricula: string } | null>(null);
  const [citaModal, setCitaModal] = useState<OrdenPanel | null>(null);
  const [cancelarModal, setCancelarModal] = useState<OrdenPanel | null>(null);
  const [repuestoModal, setRepuestoModal] = useState<OrdenPanel | null>(null);
  const [devolviendoId, setDevolviendoId] = useState<string | null>(null);
  const [presupuestoModal, setPresupuestoModal] = useState<OrdenPanel | null>(null);
  // Consulta APARTE y ligera (no embebida en SELECT_ORDENES) por dos
  // motivos: 1) `presupuestos.orden_id` es `unique`, y PostgREST puede
  // ambigüar la dirección del embed 1:1 vs 1:muchos; 2) esta pantalla la
  // usa también un mecánico (sin esEncargado), que por RLS nunca podría
  // leer `presupuestos` — mejor no intentarlo en absoluto que fallar en
  // silencio en cada fila.
  const [presupuestosPorOrden, setPresupuestosPorOrden] = useState<
    Record<string, { estado: EstadoPresupuesto }>
  >({});

  const cargarOrdenes = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('ordenes_trabajo')
      .select(SELECT_ORDENES)
      .order('fecha_entrada', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setOrdenes((data ?? []) as unknown as OrdenPanel[]);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    // Carga inicial al montar: sincroniza el estado con Supabase (fuente de
    // datos externa), patrón estándar de "fetch on mount".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarOrdenes();
  }, [cargarOrdenes]);

  const cargarPresupuestos = useCallback(async () => {
    if (!esEncargado) return;
    const { data, error: fetchError } = await supabase.from('presupuestos').select('orden_id, estado');
    if (fetchError) return; // sin ruido: la migración puede no estar aplicada todavía
    const mapa: Record<string, { estado: EstadoPresupuesto }> = {};
    for (const fila of data ?? []) {
      const f = fila as { orden_id: string; estado: EstadoPresupuesto };
      mapa[f.orden_id] = { estado: f.estado };
    }
    setPresupuestosPorOrden(mapa);
  }, [esEncargado]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPresupuestos();
  }, [cargarPresupuestos]);

  const avanzarEstado = async (orden: OrdenPanel) => {
    const siguiente = SIGUIENTE_ESTADO[orden.estado];
    if (!siguiente) return;

    // Pasar a "Listo" concierta antes una cita de recogida con el cliente
    // (día/hora) y ofrece avisarle — se gestiona en su propio modal, que ya
    // hace el update en base de datos.
    if (siguiente === 'listo') {
      setCitaModal(orden);
      return;
    }

    setActualizandoId(orden.id);
    setError(null);
    const { error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({ estado: siguiente })
      .eq('id', orden.id);
    setActualizandoId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOrdenes((prev) => prev.map((o) => (o.id === orden.id ? { ...o, estado: siguiente } : o)));
  };

  /** Botón "Recibir vehículo" de una orden 'solicitado': construye el
   *  prellenado a partir de lo que el cliente dijo en su solicitud y se lo
   *  pasa a App.tsx, que lleva al Check-in — el propio check-in hace el
   *  update de esta orden al guardar (ver InspectionForm). */
  const recibirVehiculo = (orden: OrdenPanel) => {
    if (!onRecibirDesdeSolicitud) return;
    const s = orden.solicitudes;
    onRecibirDesdeSolicitud({
      ordenId: orden.id,
      nombre: s?.nombre_cliente ?? '',
      telefono: s?.telefono_cliente ?? '',
      email: s?.email_cliente ?? '',
      matricula: s?.matricula ?? '',
      marca: s?.marca ?? '',
      modelo: s?.modelo ?? '',
      tipoServicio: orden.tipo_servicio,
      descripcionAveria: orden.descripcion_averia ?? '',
      neumaticosCantidad: null,
    });
  };

  const marcarRepuestoDevuelto = async (orden: OrdenPanel) => {
    setDevolviendoId(orden.id);
    setError(null);
    const { error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({ fecha_devolucion_repuesto: new Date().toISOString() })
      .eq('id', orden.id);
    setDevolviendoId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOrdenes((prev) =>
      prev.map((o) =>
        o.id === orden.id ? { ...o, fecha_devolucion_repuesto: new Date().toISOString() } : o,
      ),
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel de gestión</h1>
          <p className="text-sm text-gray-500">Órdenes de trabajo agrupadas por estado.</p>
        </div>
        <button
          type="button"
          onClick={cargarOrdenes}
          disabled={cargando}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          {cargando && ordenes.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando órdenes...
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {ESTADOS.map((columna) => {
                const ordenesEstado = ordenes.filter((o) => o.estado === columna.value);
                // "Entregado" oculta (que no borra) los coches entregados
                // hace más de 3 días — ver OCULTAR_ENTREGADOS_TRAS_MS.
                const ordenesColumna =
                  columna.value === 'entregado'
                    ? ordenesEstado.filter(
                        (o) =>
                          !o.fecha_entrega ||
                          Date.now() - new Date(o.fecha_entrega).getTime() < OCULTAR_ENTREGADOS_TRAS_MS,
                      )
                    : ordenesEstado;
                const antiguosOcultos = ordenesEstado.length - ordenesColumna.length;
                return (
                  <div key={columna.value} className={`rounded-2xl ${columna.fondo} p-3`}>
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <span className={`h-2.5 w-2.5 rounded-full ${columna.barra}`} />
                      {columna.label}
                      <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-gray-600 shadow-sm">
                        {ordenesColumna.length}
                      </span>
                    </h2>
                    <div className="space-y-3">
                      {ordenesColumna.length === 0 && <p className="text-xs text-gray-400">Sin órdenes.</p>}
                      {ordenesColumna.map((orden) => {
                        const foto = primeraFoto(orden);
                        // Mientras la orden solo existe como seguimiento de
                        // una solicitud aceptada (estado 'solicitado'),
                        // `vehiculos` es null — se muestran los datos que
                        // el cliente dio en su solicitud en su lugar.
                        const matricula = orden.vehiculos?.matricula ?? orden.solicitudes?.matricula;
                        const marcaModelo = [
                          orden.vehiculos?.marca ?? orden.solicitudes?.marca,
                          orden.vehiculos?.modelo ?? orden.solicitudes?.modelo,
                        ]
                          .filter(Boolean)
                          .join(' ');
                        const clienteNombre =
                          orden.vehiculos?.clientes?.nombre ?? orden.solicitudes?.nombre_cliente;
                        const clienteTelefono =
                          orden.vehiculos?.clientes?.telefono ?? orden.solicitudes?.telefono_cliente;
                        const tieneRepuestoActivo =
                          orden.coche_repuesto_id !== null && orden.fecha_devolucion_repuesto === null;
                        return (
                          <div
                            key={orden.id}
                            className="space-y-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-100"
                          >
                            <div className="flex items-start gap-2.5">
                              {foto ? (
                                <img
                                  src={foto}
                                  alt=""
                                  className="h-12 w-12 shrink-0 rounded-lg border border-gray-100 object-cover"
                                />
                              ) : (
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-300">
                                  <ImageOff className="h-5 w-5" />
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                                  <Car className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                  <span className="truncate">{matricula ?? '—'}</span>
                                </div>
                                <p className="truncate text-xs text-gray-500">
                                  {marcaModelo || 'Sin marca/modelo'}
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
                            </div>
                            <p className="truncate text-xs text-gray-600">
                              {clienteNombre ?? 'Cliente desconocido'}
                            </p>
                            {clienteTelefono && (
                              <p className="flex items-center gap-1 text-xs text-gray-400">
                                <Phone className="h-3 w-3" /> {clienteTelefono}
                              </p>
                            )}
                            <p className="text-xs font-medium text-blue-600">
                              {ETIQUETAS_SERVICIO[orden.tipo_servicio]}
                            </p>
                            {orden.descripcion_averia && (
                              <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                                {orden.descripcion_averia}
                              </p>
                            )}
                            {orden.estado === 'listo' && orden.cita_recogida && (
                              <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                                Recogida: {new Date(orden.cita_recogida).toLocaleDateString('es-ES')}{' '}
                                {new Date(orden.cita_recogida).toLocaleTimeString('es-ES', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            )}
                            {orden.estado === 'cancelado' && orden.motivo_cancelacion && (
                              <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                                {orden.motivo_cancelacion}
                              </p>
                            )}

                            {orden.estado !== 'solicitado' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPiezasModal({
                                    ordenId: orden.id,
                                    matricula: matricula ?? '—',
                                  })
                                }
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
                              >
                                <Wrench className="h-3.5 w-3.5" />
                                Piezas usadas
                                {orden.piezas_usadas && orden.piezas_usadas.length > 0
                                  ? ` (${orden.piezas_usadas.length})`
                                  : ''}
                              </button>
                            )}

                            {esEncargado && orden.estado !== 'solicitado' && orden.estado !== 'cancelado' && (
                              <button
                                type="button"
                                onClick={() => setPresupuestoModal(orden)}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                              >
                                <Euro className="h-3.5 w-3.5" />
                                Presupuesto
                                {presupuestosPorOrden[orden.id]
                                  ? ` (${ETIQUETA_PRESUPUESTO_CORTA[presupuestosPorOrden[orden.id].estado]})`
                                  : ''}
                              </button>
                            )}

                            {ESTADOS_CON_VEHICULO_EN_TALLER.includes(orden.estado) &&
                              (tieneRepuestoActivo ? (
                                <div className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-700">
                                  <span className="flex items-start gap-1.5">
                                    <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span className="break-words">
                                      Sustitución: {orden.coches_repuesto?.matricula ?? '—'}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => marcarRepuestoDevuelto(orden)}
                                    disabled={devolviendoId === orden.id}
                                    className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                                  >
                                    {devolviendoId === orden.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Undo2 className="h-3 w-3" />
                                    )}
                                    Devuelto
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setRepuestoModal(orden)}
                                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                                >
                                  <Truck className="h-3.5 w-3.5" /> Coche de sustitución
                                </button>
                              ))}

                            {orden.estado === 'solicitado' && onRecibirDesdeSolicitud ? (
                              <button
                                type="button"
                                onClick={() => recibirVehiculo(orden)}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                              >
                                Recibir vehículo <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            ) : orden.estado === 'listo' && onEntregar ? (
                              <button
                                type="button"
                                onClick={() => onEntregar(orden.id)}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                              >
                                Entregar vehículo <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              orden.estado !== 'solicitado' &&
                              SIGUIENTE_ESTADO[orden.estado] && (
                                <button
                                  type="button"
                                  onClick={() => avanzarEstado(orden)}
                                  disabled={actualizandoId === orden.id}
                                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                >
                                  {actualizandoId === orden.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <>
                                      Avanzar a{' '}
                                      {ESTADOS.find((e) => e.value === SIGUIENTE_ESTADO[orden.estado])?.label}{' '}
                                      <ArrowRight className="h-3.5 w-3.5" />
                                    </>
                                  )}
                                </button>
                              )
                            )}

                            {CANCELABLE.includes(orden.estado) && (
                              <button
                                type="button"
                                onClick={() => setCancelarModal(orden)}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <XCircle className="h-3.5 w-3.5" /> Cancelar orden
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {antiguosOcultos > 0 && (
                        <p className="text-xs text-gray-400">
                          +{antiguosOcultos} entregado{antiguosOcultos === 1 ? '' : 's'} hace más de 3
                          días — consulta el Historial de vehículo.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

      {piezasModal && (
        <PiezasUsadasModal
          open
          ordenId={piezasModal.ordenId}
          matricula={piezasModal.matricula}
          onClose={() => {
            setPiezasModal(null);
            cargarOrdenes();
          }}
        />
      )}

      <CitaRecogidaModal
        open={citaModal !== null}
        orden={
          citaModal
            ? {
                id: citaModal.id,
                matricula: citaModal.vehiculos?.matricula ?? '—',
                clienteNombre: citaModal.vehiculos?.clientes?.nombre ?? 'Cliente',
                clienteTelefono: citaModal.vehiculos?.clientes?.telefono ?? null,
                clienteEmail: citaModal.vehiculos?.clientes?.email ?? null,
              }
            : null
        }
        onClose={() => setCitaModal(null)}
        onListo={(citaIso) => {
          if (!citaModal) return;
          setOrdenes((prev) =>
            prev.map((o) => (o.id === citaModal.id ? { ...o, estado: 'listo', cita_recogida: citaIso } : o)),
          );
        }}
      />

      <CancelarOrdenModal
        open={cancelarModal !== null}
        ordenId={cancelarModal?.id ?? null}
        matricula={cancelarModal?.vehiculos?.matricula ?? '—'}
        onClose={() => setCancelarModal(null)}
        onCancelada={(motivo) => {
          if (!cancelarModal) return;
          setOrdenes((prev) =>
            prev.map((o) =>
              o.id === cancelarModal.id ? { ...o, estado: 'cancelado', motivo_cancelacion: motivo } : o,
            ),
          );
          setCancelarModal(null);
        }}
      />

      <AsignarRepuestoModal
        open={repuestoModal !== null}
        ordenId={repuestoModal?.id ?? null}
        matriculaCliente={repuestoModal?.vehiculos?.matricula ?? repuestoModal?.solicitudes?.matricula ?? '—'}
        onClose={() => setRepuestoModal(null)}
        onAsignado={() => {
          setRepuestoModal(null);
          cargarOrdenes();
        }}
      />

      {presupuestoModal && (
        <PresupuestoModal
          open
          ordenId={presupuestoModal.id}
          solicitudId={presupuestoModal.solicitud_id}
          matricula={
            presupuestoModal.vehiculos?.matricula ?? presupuestoModal.solicitudes?.matricula ?? '—'
          }
          onClose={() => {
            setPresupuestoModal(null);
            cargarPresupuestos();
          }}
        />
      )}
    </div>
  );
}

/** Traduce un color escrito en texto libre (español, lo más habitual en un
 *  taller) a un valor CSS aproximado para pintar la pastilla de color. Si no
 *  reconoce la palabra, usa el propio texto tal cual (por si ya es un valor
 *  CSS válido) y como último recurso un gris neutro. */
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
