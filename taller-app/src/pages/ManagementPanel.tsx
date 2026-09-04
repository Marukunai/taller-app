import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Bike,
  Car,
  CheckCircle2,
  Euro,
  Filter,
  ImageOff,
  Loader2,
  Phone,
  RefreshCw,
  Star,
  Truck,
  Undo2,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import PiezasUsadasModal from '../components/PiezasUsadasModal';
import CitaRecogidaModal from '../components/CitaRecogidaModal';
import CancelarOrdenModal from '../components/CancelarOrdenModal';
import AsignarRepuestoModal from '../components/AsignarRepuestoModal';
import PresupuestoModal from '../components/PresupuestoModal';
import type { EstadoOrden, EstadoPresupuesto, OrdenPendienteRecepcion, TipoServicio, TipoVehiculo } from '../lib/types';

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
  pre_itv: 'Pre ITV',
};

/** Un mecánico solo ve las columnas de trabajo activo — "Entregado" y
 *  "Cancelado" son gestión (histórico/facturación), reservada al
 *  encargado, igual que el Presupuesto (ver `esEncargado` más abajo). */
const ESTADOS_SOLO_ENCARGADO: EstadoOrden[] = ['entregado', 'cancelado'];

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
    tipo_vehiculo: TipoVehiculo;
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
    tipo_vehiculo: TipoVehiculo;
  } | null;
  coche_repuesto_id: string | null;
  fecha_devolucion_repuesto: string | null;
  // Fecha prevista de devolución (batch 19, parte 3) — opcional, se rellena
  // al asignar el coche desde AsignarRepuestoModal.
  fecha_devolucion_repuesto_prevista: string | null;
  coches_repuesto: { matricula: string; marca: string | null; modelo: string | null } | null;
  solicitud_id: string | null;
  // Mecánico asignado y valoración del cliente (batch 20).
  mecanico_asignado_id: string | null;
  valoracion_estrellas: number | null;
  valoracion_comentario: string | null;
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
  'vehiculos(matricula, marca, modelo, color, tipo_vehiculo, clientes(nombre, telefono, email)), ' +
  'inspecciones_entrada(fotos_urls), piezas_usadas(id), ' +
  'solicitudes(nombre_cliente, telefono_cliente, email_cliente, matricula, marca, modelo, tipo_vehiculo), ' +
  'coche_repuesto_id, fecha_devolucion_repuesto, fecha_devolucion_repuesto_prevista, ' +
  'coches_repuesto(matricula, marca, modelo), solicitud_id, ' +
  'mecanico_asignado_id, valoracion_estrellas, valoracion_comentario';

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
    Record<string, { estado: EstadoPresupuesto; pagado: boolean }>
  >({});

  // Filtros del tablero (batch 20) — se aplican en el propio cliente sobre
  // las órdenes ya cargadas (mismo enfoque que el resto de la pantalla: se
  // trae todo de una vez y se reparte por columnas), sin volver a
  // consultar Supabase por cada cambio de filtro.
  const [filtroTipoServicio, setFiltroTipoServicio] = useState<TipoServicio | 'todos'>('todos');
  const [filtroMecanicoId, setFiltroMecanicoId] = useState('todos');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');

  // Lista de mecánicos activos, para el selector de "asignar mecánico" de
  // cada tarjeta (solo esEncargado puede asignar) y para el filtro de
  // arriba (cualquier personal puede filtrar, aunque no pueda asignar) —
  // `perfiles` ya es legible por cualquier personal, ver schema.sql.
  const [mecanicos, setMecanicos] = useState<{ id: string; nombre: string }[]>([]);
  const [asignandoMecanicoId, setAsignandoMecanicoId] = useState<string | null>(null);

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
    const { data, error: fetchError } = await supabase.from('presupuestos').select('orden_id, estado, pagado');
    if (fetchError) return; // sin ruido: la migración puede no estar aplicada todavía
    const mapa: Record<string, { estado: EstadoPresupuesto; pagado: boolean }> = {};
    for (const fila of data ?? []) {
      const f = fila as { orden_id: string; estado: EstadoPresupuesto; pagado: boolean | null };
      mapa[f.orden_id] = { estado: f.estado, pagado: f.pagado ?? false };
    }
    setPresupuestosPorOrden(mapa);
  }, [esEncargado]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPresupuestos();
  }, [cargarPresupuestos]);

  // Carga de mecánicos activos — independiente de esEncargado (el filtro de
  // arriba lo puede usar cualquier personal); si la columna `mecanico_
  // asignado_id`/migración batch 20 no está aplicada todavía, la consulta
  // igualmente no falla (perfiles ya existe desde antes), solo devolverá
  // una lista vacía si no hay ningún mecánico dado de alta.
  const cargarMecanicos = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('perfiles')
      .select('id, nombre, email')
      .eq('rol', 'mecanico')
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (fetchError) return;
    setMecanicos(
      (data ?? []).map((fila) => {
        const p = fila as { id: string; nombre: string | null; email: string | null };
        return { id: p.id, nombre: p.nombre || p.email || 'Sin nombre' };
      }),
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarMecanicos();
  }, [cargarMecanicos]);

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
      tipoVehiculo: s?.tipo_vehiculo ?? 'coche',
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

  /** Asigna (o quita, con cadena vacía) el mecánico de una orden — batch 20.
   *  Solo cambia esa columna, no afecta al estado ni a nada más. */
  const asignarMecanico = async (orden: OrdenPanel, mecanicoId: string) => {
    setAsignandoMecanicoId(orden.id);
    setError(null);
    const { error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({ mecanico_asignado_id: mecanicoId || null })
      .eq('id', orden.id);
    setAsignandoMecanicoId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOrdenes((prev) =>
      prev.map((o) => (o.id === orden.id ? { ...o, mecanico_asignado_id: mecanicoId || null } : o)),
    );
  };

  // Filtros aplicados sobre las órdenes ya cargadas — ver los 4 useState de
  // arriba. La comparación de fechas es por prefijo ISO (YYYY-MM-DD),
  // suficientemente precisa para un filtro de tablero sin complicar el
  // selector con horas.
  const ordenesFiltradas = ordenes.filter((o) => {
    if (filtroTipoServicio !== 'todos' && o.tipo_servicio !== filtroTipoServicio) return false;
    if (filtroMecanicoId !== 'todos' && (o.mecanico_asignado_id ?? '') !== filtroMecanicoId) return false;
    if (filtroFechaDesde && (!o.fecha_entrada || o.fecha_entrada < filtroFechaDesde)) return false;
    if (filtroFechaHasta && (!o.fecha_entrada || o.fecha_entrada > `${filtroFechaHasta}T23:59:59`)) return false;
    return true;
  });
  const hayFiltrosActivos =
    filtroTipoServicio !== 'todos' ||
    filtroMecanicoId !== 'todos' ||
    filtroFechaDesde !== '' ||
    filtroFechaHasta !== '';
  const limpiarFiltros = () => {
    setFiltroTipoServicio('todos');
    setFiltroMecanicoId('todos');
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8">
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

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <Filter className="h-3.5 w-3.5" /> Filtros
        </span>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500">Desde</label>
          <input
            type="date"
            value={filtroFechaDesde}
            onChange={(e) => setFiltroFechaDesde(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500">Hasta</label>
          <input
            type="date"
            value={filtroFechaHasta}
            onChange={(e) => setFiltroFechaHasta(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500">Tipo de servicio</label>
          <select
            value={filtroTipoServicio}
            onChange={(e) => setFiltroTipoServicio(e.target.value as TipoServicio | 'todos')}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700"
          >
            <option value="todos">Todos</option>
            {(Object.entries(ETIQUETAS_SERVICIO) as [TipoServicio, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {mecanicos.length > 0 && (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500">Mecánico</label>
            <select
              value={filtroMecanicoId}
              onChange={(e) => setFiltroMecanicoId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700"
            >
              <option value="todos">Todos</option>
              {mecanicos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        {hayFiltrosActivos && (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
          >
            <XCircle className="h-3.5 w-3.5" /> Limpiar filtros
          </button>
        )}
      </div>

          {cargando && ordenes.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando órdenes...
            </p>
          ) : (
            <div
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
                esEncargado ? 'md:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-4'
              }`}
            >
              {/* Un mecánico no gestiona histórico/facturación: no ve las
                  columnas "Entregado" ni "Cancelado" (solo el encargado) —
                  ver ESTADOS_SOLO_ENCARGADO. De paso, con menos columnas
                  cada tarjeta sale más grande en pantallas normales. */}
              {ESTADOS.filter(
                (columna) => esEncargado || !ESTADOS_SOLO_ENCARGADO.includes(columna.value),
              ).map((columna) => {
                const ordenesEstado = ordenesFiltradas.filter((o) => o.estado === columna.value);
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
                  <div key={columna.value} className={`rounded-2xl ${columna.fondo} p-4`}>
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
                            className="space-y-2.5 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100"
                          >
                            <div className="flex items-start gap-3">
                              {foto ? (
                                <img
                                  src={foto}
                                  alt=""
                                  className="h-14 w-14 shrink-0 rounded-lg border border-gray-100 object-cover"
                                />
                              ) : (
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-300">
                                  <ImageOff className="h-5 w-5" />
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-base font-semibold text-gray-900">
                                  {(orden.vehiculos?.tipo_vehiculo ?? orden.solicitudes?.tipo_vehiculo) === 'moto' ? (
                                    <Bike className="h-4 w-4 shrink-0 text-gray-400" />
                                  ) : (
                                    <Car className="h-4 w-4 shrink-0 text-gray-400" />
                                  )}
                                  <span className="truncate">{matricula ?? '—'}</span>
                                </div>
                                <p className="truncate text-sm text-gray-500">
                                  {marcaModelo || 'Sin marca/modelo'}
                                </p>
                                {orden.vehiculos?.color && (
                                  <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-gray-500">
                                    <span
                                      className="h-2.5 w-2.5 rounded-full border border-gray-300"
                                      style={{ backgroundColor: colorCss(orden.vehiculos.color) }}
                                    />
                                    {orden.vehiculos.color}
                                  </p>
                                )}
                              </div>
                            </div>
                            <p className="truncate text-sm text-gray-600">
                              {clienteNombre ?? 'Cliente desconocido'}
                            </p>
                            {clienteTelefono && (
                              <p className="flex items-center gap-1 text-sm text-gray-400">
                                <Phone className="h-3.5 w-3.5" /> {clienteTelefono}
                              </p>
                            )}
                            <p className="text-sm font-medium text-blue-600">
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

                            {esEncargado && orden.valoracion_estrellas && (
                              <div className="rounded-lg bg-yellow-50 px-2 py-1.5 text-xs">
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <Star
                                      key={n}
                                      className={`h-3.5 w-3.5 ${
                                        n <= (orden.valoracion_estrellas ?? 0)
                                          ? 'fill-yellow-400 text-yellow-400'
                                          : 'text-yellow-200'
                                      }`}
                                    />
                                  ))}
                                </div>
                                {orden.valoracion_comentario && (
                                  <p className="mt-0.5 text-yellow-800">{orden.valoracion_comentario}</p>
                                )}
                              </div>
                            )}

                            {esEncargado && (
                              <label className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-600">
                                <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                <select
                                  value={orden.mecanico_asignado_id ?? ''}
                                  onChange={(e) => asignarMecanico(orden, e.target.value)}
                                  disabled={asignandoMecanicoId === orden.id}
                                  className="w-full min-w-0 flex-1 bg-transparent text-gray-700 focus:outline-none disabled:opacity-60"
                                >
                                  <option value="">Sin mecánico asignado</option>
                                  {mecanicos.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.nombre}
                                    </option>
                                  ))}
                                </select>
                              </label>
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
                            {esEncargado && presupuestosPorOrden[orden.id]?.pagado && (
                              <span className="flex items-center justify-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" /> Pagado
                              </span>
                            )}

                            {ESTADOS_CON_VEHICULO_EN_TALLER.includes(orden.estado) &&
                              (tieneRepuestoActivo ? (
                                <div className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-700">
                                  <span className="flex items-start gap-1.5">
                                    <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span className="break-words">
                                      Sustitución: {orden.coches_repuesto?.matricula ?? '—'}
                                      {clienteNombre ? ` · ${clienteNombre}` : ''}
                                    </span>
                                  </span>
                                  {orden.fecha_devolucion_repuesto_prevista && (
                                    <span className="mt-0.5 block text-[11px] text-blue-600">
                                      Devolución prevista:{' '}
                                      {new Date(orden.fecha_devolucion_repuesto_prevista).toLocaleDateString(
                                        'es-ES',
                                      )}{' '}
                                      {new Date(orden.fecha_devolucion_repuesto_prevista).toLocaleTimeString(
                                        'es-ES',
                                        { hour: '2-digit', minute: '2-digit' },
                                      )}
                                    </span>
                                  )}
                                  {/* Batch 21: devolver el préstamo se restringió a
                                      dueño/encargado/admin (antes lo podía hacer
                                      cualquier personal) — reforzado también por un
                                      trigger en base de datos, ver
                                      supabase/batch21_migration.sql. */}
                                  {esEncargado && (
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
                                  )}
                                </div>
                              ) : (
                                // Prestar un coche de sustitución, a diferencia de
                                // devolverlo, se restringe a dueño/encargado/admin
                                // (petición explícita del usuario) — desde el batch
                                // 19, parte 4 también reforzado por un trigger en
                                // Supabase (restringir_prestamo_repuesto), no solo
                                // ocultando este botón.
                                esEncargado && (
                                  <button
                                    type="button"
                                    onClick={() => setRepuestoModal(orden)}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                                  >
                                    <Truck className="h-3.5 w-3.5" /> Coche de sustitución
                                  </button>
                                )
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
        clienteNombre={
          repuestoModal?.vehiculos?.clientes?.nombre ?? repuestoModal?.solicitudes?.nombre_cliente ?? null
        }
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
