import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Bell,
  Bike,
  Calendar,
  CalendarClock,
  CalendarPlus,
  Car,
  Check,
  CheckCircle2,
  ClipboardList,
  Euro,
  FileCheck,
  Loader2,
  LogOut,
  Mail,
  MessageSquareText,
  Phone,
  Send,
  Star,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fabricantesPara, modelosParaFabricante } from '../lib/vehicleData';
import { renderDamageSchemaImage } from '../lib/renderDamageSchema';
import { descargarIcs } from '../lib/ics';
import type {
  DanoMarcador,
  EstadoOrden,
  EstadoSolicitud,
  NeumaticosCantidad,
  Presupuesto,
  PresupuestoPieza,
  Solicitud,
  TipoServicio,
  TipoVehiculo,
} from '../lib/types';

const TIPOS_SERVICIO: { value: TipoServicio; label: string }[] = [
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'neumaticos', label: 'Neumáticos' },
  { value: 'averia', label: 'Avería' },
  { value: 'pre_itv', label: 'Pre ITV' },
];

const OPCIONES_NEUMATICOS: { value: NeumaticosCantidad; label: string }[] = [
  { value: '2_delanteros', label: '2 delanteros' },
  { value: '2_traseros', label: '2 traseros' },
  { value: 'las_4', label: 'Los 4' },
  { value: 'delantero_izquierdo', label: 'Uno: delantero izquierdo' },
  { value: 'delantero_derecho', label: 'Uno: delantero derecho' },
  { value: 'trasero_izquierdo', label: 'Uno: trasero izquierdo' },
  { value: 'trasero_derecho', label: 'Uno: trasero derecho' },
];

const OPCIONES_NEUMATICOS_MOTO: { value: NeumaticosCantidad; label: string }[] = [
  { value: 'delantero', label: 'Delantero' },
  { value: 'trasero', label: 'Trasero' },
];

const ESTADO_BADGE: Record<EstadoSolicitud, { label: string; clase: string }> = {
  pendiente: { label: 'Pendiente de revisión', clase: 'bg-amber-100 text-amber-700' },
  aceptada: { label: 'Aceptada por el taller', clase: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', clase: 'bg-red-100 text-red-700' },
  cancelada: { label: 'Cancelada', clase: 'bg-gray-100 text-gray-600' },
};

interface ClientPortalProps {
  nombreUsuario: string;
  emailUsuario: string;
}

const FORM_VACIO = {
  matricula: '',
  tipoVehiculo: 'coche' as TipoVehiculo,
  marca: '',
  modelo: '',
  telefono: '',
  tipoServicio: 'mantenimiento' as TipoServicio,
  descripcion: '',
  neumaticosCantidad: 'las_4' as NeumaticosCantidad,
  // Fecha/hora propuesta para TRAER el vehículo (check-in) — opcional, con
  // la misma sencillez que la cita de recogida que ya concierta el taller
  // al marcar la orden "Listo": una propuesta, sin gestión de franjas ni
  // aforo. Vacío por defecto: el cliente puede dejarlo sin elegir y
  // acordarlo por teléfono, como hasta ahora.
  fechaCitaCheckin: '',
};

const ETIQUETA_ESTADO_PRESUPUESTO: Record<string, { label: string; clase: string }> = {
  enviado: { label: 'Presupuesto recibido — pendiente de tu respuesta', clase: 'bg-sky-100 text-sky-700' },
  aprobado: { label: 'Presupuesto aprobado', clase: 'bg-emerald-100 text-emerald-700' },
  rechazado: { label: 'Presupuesto rechazado', clase: 'bg-red-100 text-red-700' },
  borrador: { label: 'Presupuesto en preparación', clase: 'bg-gray-100 text-gray-600' },
};

// Estado de la ORDEN de trabajo que nace al aceptar la solicitud (batch
// 20) — distinto del estado de la propia solicitud (ESTADO_BADGE de
// arriba): una solicitud 'aceptada' ya tiene detrás una orden con su
// propio ciclo de vida (solicitado → recepcionado → en_proceso → listo →
// entregado, o cancelado), que es lo que de verdad le interesa seguir al
// cliente día a día — ver SeguimientoOrdenCliente más abajo.
const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  solicitado: 'Solicitado',
  recepcionado: 'Recepcionado en el taller',
  en_proceso: 'En proceso',
  listo: 'Listo para recoger',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

/** Datos de la inspección de entrada que el cliente puede ver de su propia
 *  orden (batch 20) — mismo shape que `InspeccionEntrada` de types.ts, pero
 *  solo con los campos que de verdad se muestran aquí. */
interface InspeccionCliente {
  fotos_urls: string[] | null;
  daños_coordenadas: DanoMarcador[] | null;
  pdf_informe_url: string | null;
}

/** Orden de trabajo vinculada a una solicitud propia — lo que el cliente
 *  puede leer de `ordenes_trabajo` gracias a la política "Cliente ve su
 *  propia orden" (ver supabase/batch20_migration.sql). */
interface OrdenCliente {
  id: string;
  estado: EstadoOrden;
  solicitud_id: string | null;
  cita_recogida: string | null;
  pdf_salida_url: string | null;
  valoracion_estrellas: number | null;
  valoracion_comentario: string | null;
  inspecciones_entrada: InspeccionCliente[] | null;
}

function euros(n: number): string {
  return `${n.toFixed(2)} €`;
}

/**
 * Portal de cliente: el propio cliente pide un servicio ("quiero una
 * revisión de mantenimiento...") sin llamar por teléfono ni pasar por el
 * mecánico. Es un aviso previo — el check-in real (fotos, daños, firma) se
 * sigue haciendo en persona cuando el vehículo llega al taller, igual que
 * siempre; aquí solo se manda la petición y se ve su estado.
 */
export default function ClientPortal({ nombreUsuario, emailUsuario }: ClientPortalProps) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [formAbierto, setFormAbierto] = useState(false);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);

  // Presupuestos propios — la RLS de `presupuestos` (ver schema.sql) ya los
  // filtra a los que cuelgan de una solicitud del propio cliente, así que
  // esta consulta no necesita ningún filtro explícito. Se indexan por
  // `solicitud_id` para mostrar cada uno junto a su solicitud.
  const [presupuestosPorSolicitud, setPresupuestosPorSolicitud] = useState<Record<string, Presupuesto>>({});
  const [piezasPorPresupuesto, setPiezasPorPresupuesto] = useState<Record<string, PresupuestoPieza[]>>({});
  const [respondiendoId, setRespondiendoId] = useState<string | null>(null);
  const [notaRespuesta, setNotaRespuesta] = useState<Record<string, string>>({});

  // Órdenes de trabajo propias, indexadas por `solicitud_id` (batch 20) —
  // una solicitud 'aceptada' tiene detrás una orden con su propio estado
  // (barra de progreso), su inspección de entrada (fotos/daños/PDF) y el
  // PDF de salida una vez entregado. `ordenesPorSolicitudRef` es un espejo
  // de solo lectura para el manejador de Realtime de abajo, que necesita
  // el ÚLTIMO estado conocido sin depender de un closure obsoleto.
  const [ordenesPorSolicitud, setOrdenesPorSolicitud] = useState<Record<string, OrdenCliente>>({});
  const ordenesPorSolicitudRef = useRef<Record<string, OrdenCliente>>({});
  useEffect(() => {
    ordenesPorSolicitudRef.current = ordenesPorSolicitud;
  }, [ordenesPorSolicitud]);

  // Aviso visual (toast) cuando cambia el estado de una orden propia — ver
  // el canal de Realtime más abajo. Se autodescarta solo a los pocos
  // segundos.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(id);
  }, [toast]);

  // Consentimiento RGPD del formulario de nueva solicitud (batch 20).
  const [rgpdAceptado, setRgpdAceptado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [solicitudesRes, presupuestosRes, ordenesRes] = await Promise.all([
      supabase
        .from('solicitudes')
        .select(
          'id, created_at, cliente_auth_id, nombre_cliente, email_cliente, telefono_cliente, ' +
            'matricula, tipo_vehiculo, marca, modelo, tipo_servicio, descripcion, neumaticos_cantidad, estado, ' +
            'respuesta_taller, fecha_cita_checkin',
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('presupuestos')
        .select(
          'id, orden_id, solicitud_id, concepto_mano_obra, precio_mano_obra, estado, nota_cliente, ' +
            'created_at, enviado_en, respondido_en, factura_pdf_url',
        ),
      // Órdenes propias (batch 20) — la RLS "Cliente ve su propia orden"
      // (ver supabase/batch20_migration.sql) ya las limita a las que
      // cuelgan de una solicitud propia; si esa migración todavía no está
      // aplicada en este proyecto, esta consulta simplemente no devuelve
      // ninguna fila (no falla), y la app sigue mostrando solo el estado
      // de la solicitud, como hasta ahora.
      supabase
        .from('ordenes_trabajo')
        .select(
          'id, estado, solicitud_id, cita_recogida, pdf_salida_url, valoracion_estrellas, valoracion_comentario, ' +
            'inspecciones_entrada(fotos_urls, daños_coordenadas, pdf_informe_url)',
        ),
    ]);
    if (solicitudesRes.error) setError(solicitudesRes.error.message);
    else setSolicitudes((solicitudesRes.data ?? []) as unknown as Solicitud[]);

    if (!presupuestosRes.error) {
      const presupuestos = (presupuestosRes.data ?? []) as unknown as Presupuesto[];
      const mapa: Record<string, Presupuesto> = {};
      for (const p of presupuestos) {
        if (p.solicitud_id) mapa[p.solicitud_id] = p;
      }
      setPresupuestosPorSolicitud(mapa);
      if (presupuestos.length > 0) {
        const { data: piezasData } = await supabase
          .from('presupuesto_piezas')
          .select('id, presupuesto_id, pieza_usada_id, nombre_item, cantidad, precio_unitario')
          .in(
            'presupuesto_id',
            presupuestos.map((p) => p.id),
          );
        const mapaPiezas: Record<string, PresupuestoPieza[]> = {};
        for (const pieza of (piezasData ?? []) as PresupuestoPieza[]) {
          const lista = mapaPiezas[pieza.presupuesto_id] ?? [];
          lista.push(pieza);
          mapaPiezas[pieza.presupuesto_id] = lista;
        }
        setPiezasPorPresupuesto(mapaPiezas);
      }
    }

    if (!ordenesRes.error) {
      const mapaOrdenes: Record<string, OrdenCliente> = {};
      for (const o of (ordenesRes.data ?? []) as unknown as OrdenCliente[]) {
        if (o.solicitud_id) mapaOrdenes[o.solicitud_id] = o;
      }
      setOrdenesPorSolicitud(mapaOrdenes);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  // Aviso en tiempo real (batch 20) — Supabase Realtime respeta la RLS de
  // cada tabla con el token de quien está conectado (igual que ya hace
  // `useSolicitudesPendientes.ts` para el personal), así que este cliente
  // solo recibe eventos de SUS propias filas: sus solicitudes (ya estaba
  // en la publicación desde antes) y, desde el batch 20, sus propias
  // órdenes. Comparar el estado nuevo contra `ordenesPorSolicitudRef` (en
  // vez de `payload.old`) es a propósito: por defecto Postgres no incluye
  // todas las columnas antiguas en el evento de UPDATE (solo la clave
  // primaria), así que el único sitio fiable para saber "cuál era el
  // estado anterior" es lo que la propia app ya tenía cargado.
  useEffect(() => {
    const canal = supabase
      .channel('portal-cliente-tiempo-real')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_trabajo' }, (payload) => {
        const nueva = payload.new as { id: string; estado: EstadoOrden } | null;
        if (nueva) {
          const anterior = Object.values(ordenesPorSolicitudRef.current).find((o) => o.id === nueva.id);
          if (anterior && anterior.estado !== nueva.estado) {
            setToast(`Tu vehículo ha pasado a "${ETIQUETA_ESTADO_ORDEN[nueva.estado] ?? nueva.estado}".`);
          }
        }
        cargar();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes' }, () => {
        cargar();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [cargar]);

  const responderPresupuesto = async (presupuesto: Presupuesto, estado: 'aprobado' | 'rechazado') => {
    setRespondiendoId(presupuesto.id);
    setError(null);
    const { error: updateError } = await supabase
      .from('presupuestos')
      .update({
        estado,
        nota_cliente: notaRespuesta[presupuesto.id]?.trim() || null,
        respondido_en: new Date().toISOString(),
      })
      .eq('id', presupuesto.id);
    setRespondiendoId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (presupuesto.solicitud_id) {
      setPresupuestosPorSolicitud((prev) => ({
        ...prev,
        [presupuesto.solicitud_id as string]: { ...presupuesto, estado, respondido_en: new Date().toISOString() },
      }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.matricula.trim() || !form.telefono.trim()) {
      setError('La matrícula y el teléfono de contacto son obligatorios.');
      return;
    }
    if (!rgpdAceptado) {
      setError('Debes aceptar el tratamiento de tus datos para enviar la solicitud.');
      return;
    }
    setEnviando(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('No se pudo identificar tu sesión — vuelve a entrar.');
      setEnviando(false);
      return;
    }
    const { data, error: insertError } = await supabase
      .from('solicitudes')
      .insert({
        cliente_auth_id: user.id,
        nombre_cliente: nombreUsuario,
        email_cliente: emailUsuario,
        telefono_cliente: form.telefono || null,
        matricula: form.matricula || null,
        tipo_vehiculo: form.tipoVehiculo,
        marca: form.marca || null,
        modelo: form.modelo || null,
        tipo_servicio: form.tipoServicio,
        descripcion: form.descripcion || null,
        neumaticos_cantidad: form.tipoServicio === 'neumaticos' ? form.neumaticosCantidad : null,
        fecha_cita_checkin: form.fechaCitaCheckin ? new Date(form.fechaCitaCheckin).toISOString() : null,
        rgpd_aceptado: rgpdAceptado,
        rgpd_aceptado_en: new Date().toISOString(),
      })
      .select()
      .single();
    setEnviando(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSolicitudes((prev) => [data as Solicitud, ...prev]);
    setForm(FORM_VACIO);
    setRgpdAceptado(false);
    setFormAbierto(false);
  };

  const cancelarSolicitud = async (id: string) => {
    setCancelandoId(id);
    setError(null);
    const { error: updateError } = await supabase
      .from('solicitudes')
      .update({ estado: 'cancelada' })
      .eq('id', id);
    setCancelandoId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSolicitudes((prev) => prev.map((s) => (s.id === id ? { ...s, estado: 'cancelada' } : s)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-blue-50">
      {toast && (
        <div className="fixed inset-x-4 top-3 z-50 mx-auto flex max-w-sm items-start gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg sm:inset-x-auto sm:right-4">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-white/60 hover:text-white"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <nav className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 shadow-md">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
            <Wrench className="h-4 w-4" />
          </span>
          <span className="font-bold text-white">Portal de cliente</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-white/80 sm:inline">{nombreUsuario || emailUsuario}</span>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/90 transition hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hola, {nombreUsuario || 'de nuevo'}</h1>
            <p className="text-sm text-gray-500">Pide un servicio o consulta el estado de tus solicitudes.</p>
          </div>
          <button
            type="button"
            onClick={() => setFormAbierto((v) => !v)}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Send className="h-4 w-4" /> Pedir servicio
          </button>
        </header>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        {formAbierto && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Nueva solicitud</h2>
              <button
                type="button"
                onClick={() => setFormAbierto(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-white hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de vehículo</label>
                <div className="flex w-fit rounded-xl border border-gray-300 bg-white p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, tipoVehiculo: 'coche', neumaticosCantidad: 'las_4' }))}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      form.tipoVehiculo === 'coche' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Car className="h-3.5 w-3.5" /> Coche
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, tipoVehiculo: 'moto', neumaticosCantidad: 'delantero' }))}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      form.tipoVehiculo === 'moto' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Bike className="h-3.5 w-3.5" /> Moto
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Matrícula <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.matricula}
                  onChange={(e) => setForm((p) => ({ ...p, matricula: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ej. 1234BBB"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Teléfono de contacto <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.telefono}
                  onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Marca</label>
                <input
                  value={form.marca}
                  onChange={(e) => setForm((p) => ({ ...p, marca: e.target.value }))}
                  list="lista-fabricantes-portal"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <datalist id="lista-fabricantes-portal">
                  {fabricantesPara(form.tipoVehiculo).map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Modelo</label>
                <input
                  value={form.modelo}
                  onChange={(e) => setForm((p) => ({ ...p, modelo: e.target.value }))}
                  list="lista-modelos-portal"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <datalist id="lista-modelos-portal">
                  {modelosParaFabricante(form.marca, form.tipoVehiculo).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de servicio</label>
                <select
                  value={form.tipoServicio}
                  onChange={(e) => setForm((p) => ({ ...p, tipoServicio: e.target.value as TipoServicio }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {TIPOS_SERVICIO.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {form.tipoServicio === 'neumaticos' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">¿Cuántos neumáticos?</label>
                  <select
                    value={form.neumaticosCantidad}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, neumaticosCantidad: e.target.value as NeumaticosCantidad }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {(form.tipoVehiculo === 'moto' ? OPCIONES_NEUMATICOS_MOTO : OPCIONES_NEUMATICOS).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cuéntanos qué necesitas</label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ej. Ruido al frenar desde hace unos días..."
              />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <CalendarClock className="h-3.5 w-3.5" /> ¿Cuándo puedes traer el vehículo? (opcional)
              </label>
              <input
                type="datetime-local"
                value={form.fechaCitaCheckin}
                onChange={(e) => setForm((p) => ({ ...p, fechaCitaCheckin: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">
                Es una propuesta — el taller puede confirmarla o proponerte otra por teléfono.
              </p>
            </div>

            <label className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={rgpdAceptado}
                onChange={(e) => setRgpdAceptado(e.target.checked)}
                required
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
              />
              <span>
                He leído y acepto que TallerGo trate mis datos de contacto y los de mi vehículo para
                gestionar esta solicitud, conforme al RGPD. <span className="text-red-500">*</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={enviando}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              {enviando ? 'Enviando...' : 'Enviar solicitud'}
            </button>
          </form>
        )}

        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <ClipboardList className="h-4 w-4" /> Tus solicitudes
        </h2>

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </p>
        ) : solicitudes.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
            Todavía no has pedido ningún servicio.
          </p>
        ) : (
          <ul className="space-y-3">
            {solicitudes.map((s) => {
              const badge = ESTADO_BADGE[s.estado];
              const presupuesto = presupuestosPorSolicitud[s.id];
              const piezas = presupuesto ? piezasPorPresupuesto[presupuesto.id] ?? [] : [];
              const totalPiezas = piezas.reduce((acc, p) => acc + p.cantidad * p.precio_unitario, 0);
              const totalPresupuesto = totalPiezas + (presupuesto?.precio_mano_obra ?? 0);
              return (
                <li key={s.id} className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {TIPOS_SERVICIO.find((t) => t.value === s.tipo_servicio)?.label}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="h-3 w-3" /> {new Date(s.created_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.clase}`}>
                      {badge.label}
                    </span>
                  </div>
                  {s.matricula && (
                    <p className="flex items-center gap-1.5 text-xs text-gray-600">
                      {s.tipo_vehiculo === 'moto' ? (
                        <Bike className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      ) : (
                        <Car className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      )}
                      {s.matricula} · {[s.marca, s.modelo].filter(Boolean).join(' ') || 'Sin marca/modelo'}
                    </p>
                  )}
                  {s.fecha_cita_checkin && (
                    <div className="space-y-1">
                      <p className="flex items-center gap-1.5 text-xs text-gray-500">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                        Propusiste traerlo el {new Date(s.fecha_cita_checkin).toLocaleDateString('es-ES')} a las{' '}
                        {new Date(s.fecha_cita_checkin).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          descargarIcs(
                            {
                              titulo: `Llevar vehículo al taller${s.matricula ? ` (${s.matricula})` : ''} — TallerGo`,
                              descripcion: 'Cita propuesta para traer el vehículo al taller.',
                              inicio: new Date(s.fecha_cita_checkin as string),
                              duracionMinutos: 30,
                            },
                            `cita-checkin-${s.matricula ?? s.id}`,
                          )
                        }
                        className="ml-5 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <CalendarPlus className="h-3 w-3" /> Añadir a mi calendario
                      </button>
                    </div>
                  )}
                  {s.telefono_cliente && (
                    <p className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Phone className="h-3.5 w-3.5 shrink-0" /> {s.telefono_cliente}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> {s.email_cliente}
                  </p>
                  {s.descripcion && <p className="text-sm text-gray-700">{s.descripcion}</p>}
                  {s.respuesta_taller && (
                    <p className="flex items-start gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
                      <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" /> {s.respuesta_taller}
                    </p>
                  )}
                  {s.estado === 'pendiente' && (
                    <button
                      type="button"
                      onClick={() => cancelarSolicitud(s.id)}
                      disabled={cancelandoId === s.id}
                      className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-60"
                    >
                      {cancelandoId === s.id ? 'Cancelando...' : 'Cancelar solicitud'}
                    </button>
                  )}
                  {s.estado === 'aceptada' &&
                    (ordenesPorSolicitud[s.id] ? (
                      <SeguimientoOrdenCliente orden={ordenesPorSolicitud[s.id]} matricula={s.matricula} />
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Trae el vehículo cuando acordéis — el
                        check-in se hace al llegar al taller.
                      </p>
                    ))}

                  {presupuesto && (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                          <Euro className="h-3.5 w-3.5" /> Presupuesto
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ETIQUETA_ESTADO_PRESUPUESTO[presupuesto.estado].clase}`}
                        >
                          {ETIQUETA_ESTADO_PRESUPUESTO[presupuesto.estado].label}
                        </span>
                      </div>
                      {presupuesto.estado !== 'borrador' && (
                        <>
                          {presupuesto.concepto_mano_obra && (
                            <p className="text-xs text-gray-700">
                              {presupuesto.concepto_mano_obra}: {euros(presupuesto.precio_mano_obra)}
                            </p>
                          )}
                          {piezas.map((p) => (
                            <p key={p.id} className="text-xs text-gray-600">
                              {p.nombre_item} x{p.cantidad}: {euros(p.cantidad * p.precio_unitario)}
                            </p>
                          ))}
                          <p className="text-sm font-semibold text-amber-800">Total: {euros(totalPresupuesto)}</p>
                        </>
                      )}
                      {presupuesto.estado === 'enviado' && (
                        <div className="space-y-2 pt-1">
                          <input
                            value={notaRespuesta[presupuesto.id] ?? ''}
                            onChange={(e) =>
                              setNotaRespuesta((prev) => ({ ...prev, [presupuesto.id]: e.target.value }))
                            }
                            placeholder="Nota opcional para el taller..."
                            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => responderPresupuesto(presupuesto, 'aprobado')}
                              disabled={respondiendoId === presupuesto.id}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              <ThumbsUp className="h-3.5 w-3.5" /> Aprobar
                            </button>
                            <button
                              type="button"
                              onClick={() => responderPresupuesto(presupuesto, 'rechazado')}
                              disabled={respondiendoId === presupuesto.id}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                            >
                              <ThumbsDown className="h-3.5 w-3.5" /> Rechazar
                            </button>
                          </div>
                        </div>
                      )}
                      {presupuesto.factura_pdf_url && (
                        <a
                          href={presupuesto.factura_pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-xs font-medium text-blue-600 hover:underline"
                        >
                          Ver factura final (PDF)
                        </a>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Seguimiento visual de una orden propia ya aceptada (batch 20): barra de
 * progreso, cita de recogida con botón .ics, informe de entrada (fotos +
 * esquema de daños + PDF), PDF de entrega y, una vez entregado, el bloque
 * de valoración — todo dentro de la propia tarjeta de la solicitud.
 */
function SeguimientoOrdenCliente({ orden, matricula }: { orden: OrdenCliente; matricula: string | null }) {
  return (
    <div className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
      <BarraProgresoOrden estado={orden.estado} />

      {orden.estado === 'listo' && orden.cita_recogida && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            Recogida concertada: {new Date(orden.cita_recogida).toLocaleDateString('es-ES')} a las{' '}
            {new Date(orden.cita_recogida).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <button
            type="button"
            onClick={() =>
              descargarIcs(
                {
                  titulo: `Recoger vehículo${matricula ? ` ${matricula}` : ''} — TallerGo`,
                  descripcion: 'Cita para recoger el vehículo del taller.',
                  inicio: new Date(orden.cita_recogida as string),
                  duracionMinutos: 20,
                },
                `cita-recogida-${matricula ?? orden.id}`,
              )
            }
            className="ml-5 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
          >
            <CalendarPlus className="h-3 w-3" /> Añadir a mi calendario
          </button>
        </div>
      )}

      {orden.inspecciones_entrada && orden.inspecciones_entrada.length > 0 && (
        <InformeEntradaCliente inspeccion={orden.inspecciones_entrada[0]} />
      )}

      {orden.pdf_salida_url && (
        <a
          href={orden.pdf_salida_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline"
        >
          <FileCheck className="h-3.5 w-3.5" /> Ver informe de entrega (PDF)
        </a>
      )}

      {orden.estado === 'entregado' && <ValoracionCliente orden={orden} />}
    </div>
  );
}

/** Barra de progreso tipo "seguimiento de pedido" — 5 pasos fijos (el
 *  estado 'cancelado' se muestra aparte, no como un 6º paso). */
function BarraProgresoOrden({ estado }: { estado: EstadoOrden }) {
  const PASOS: { value: EstadoOrden; label: string }[] = [
    { value: 'solicitado', label: 'Solicitado' },
    { value: 'recepcionado', label: 'Recepcionado' },
    { value: 'en_proceso', label: 'En proceso' },
    { value: 'listo', label: 'Listo' },
    { value: 'entregado', label: 'Entregado' },
  ];

  if (estado === 'cancelado') {
    return (
      <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
        <X className="h-3.5 w-3.5" /> Esta orden se ha cancelado.
      </p>
    );
  }

  const indiceActual = Math.max(
    0,
    PASOS.findIndex((p) => p.value === estado),
  );

  return (
    <div className="flex items-start">
      {PASOS.map((paso, i) => {
        const completado = i < indiceActual;
        const actual = i === indiceActual;
        return (
          <div key={paso.value} className="flex flex-1 flex-col items-center last:flex-none last:items-end">
            <div className="flex w-full items-center">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  completado || actual ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'
                }`}
              >
                {completado ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {i < PASOS.length - 1 && (
                <span className={`mx-1 h-0.5 flex-1 ${completado ? 'bg-emerald-500' : 'bg-gray-200'}`} />
              )}
            </div>
            <span
              className={`mt-1 text-center text-[10px] leading-tight ${
                actual ? 'font-semibold text-emerald-700' : 'text-gray-400'
              }`}
            >
              {paso.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Informe de entrada del cliente (batch 20): miniaturas de las fotos +
 *  esquema de daños rasterizado (reutiliza `renderDamageSchemaImage`, la
 *  misma función que ya genera esta imagen para el PDF — así el cliente ve
 *  exactamente el mismo dibujo) + enlace al PDF completo. No repite el
 *  editor interactivo de daños (CarDamagePicker) — es de solo lectura. */
function InformeEntradaCliente({ inspeccion }: { inspeccion: InspeccionCliente }) {
  const [imagenDanos, setImagenDanos] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    if (inspeccion.daños_coordenadas && inspeccion.daños_coordenadas.length > 0) {
      renderDamageSchemaImage(inspeccion.daños_coordenadas).then((url) => {
        if (!cancelado) setImagenDanos(url);
      });
    }
    return () => {
      cancelado = true;
    };
  }, [inspeccion.daños_coordenadas]);

  const hayFotos = !!inspeccion.fotos_urls && inspeccion.fotos_urls.length > 0;
  if (!hayFotos && !imagenDanos && !inspeccion.pdf_informe_url) return null;

  return (
    <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-800">
        <ClipboardList className="h-3.5 w-3.5" /> Informe de entrada
      </p>
      {hayFotos && (
        <div className="flex gap-1.5 overflow-x-auto">
          {(inspeccion.fotos_urls ?? []).slice(0, 6).map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg border border-white object-cover"
            />
          ))}
        </div>
      )}
      {imagenDanos && (
        <img
          src={imagenDanos}
          alt="Esquema de daños marcados"
          className="w-full rounded-lg border border-white"
        />
      )}
      {inspeccion.pdf_informe_url && (
        <a
          href={inspeccion.pdf_informe_url}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs font-medium text-sky-700 hover:underline"
        >
          Ver informe de entrada completo (PDF)
        </a>
      )}
    </div>
  );
}

/** Valoración rápida (1-5 estrellas + comentario opcional) que el cliente
 *  deja una vez la orden está 'entregado' — batch 20. Solo se puede enviar
 *  una vez (ver política + trigger `bloquear_cambio_cliente_orden` en
 *  supabase/batch20_migration.sql), así que en cuanto se envía queda fija
 *  en modo lectura, sin volver a pedirla. */
function ValoracionCliente({ orden }: { orden: OrdenCliente }) {
  const [enviada, setEnviada] = useState<{ estrellas: number; comentario: string | null } | null>(
    orden.valoracion_estrellas
      ? { estrellas: orden.valoracion_estrellas, comentario: orden.valoracion_comentario }
      : null,
  );
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (enviada) {
    return (
      <div className="rounded-lg bg-yellow-50 px-3 py-2">
        <p className="mb-1 text-xs font-semibold text-yellow-800">Tu valoración</p>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`h-4 w-4 ${n <= enviada.estrellas ? 'fill-yellow-400 text-yellow-400' : 'text-yellow-200'}`}
            />
          ))}
        </div>
        {enviada.comentario && <p className="mt-1 text-xs text-yellow-700">{enviada.comentario}</p>}
      </div>
    );
  }

  const enviar = async () => {
    if (estrellas < 1) {
      setError('Elige al menos 1 estrella.');
      return;
    }
    setEnviando(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({
        valoracion_estrellas: estrellas,
        valoracion_comentario: comentario.trim() || null,
        valoracion_en: new Date().toISOString(),
      })
      .eq('id', orden.id);
    setEnviando(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEnviada({ estrellas, comentario: comentario.trim() || null });
  };

  return (
    <div className="space-y-2 rounded-lg border border-yellow-200 bg-yellow-50/60 p-3">
      <p className="text-xs font-semibold text-yellow-800">¿Qué tal la experiencia? Valora el servicio</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setEstrellas(n)} aria-label={`${n} estrellas`}>
            <Star className={`h-6 w-6 ${n <= estrellas ? 'fill-yellow-400 text-yellow-400' : 'text-yellow-300'}`} />
          </button>
        ))}
      </div>
      <input
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Comentario opcional..."
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs"
      />
      <button
        type="button"
        onClick={enviar}
        disabled={enviando}
        className="rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-yellow-600 disabled:opacity-60"
      >
        {enviando ? 'Enviando...' : 'Enviar valoración'}
      </button>
    </div>
  );
}

