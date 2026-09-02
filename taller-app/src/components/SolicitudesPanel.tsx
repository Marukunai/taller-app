import { useCallback, useEffect, useState } from 'react';
import { Car, CalendarClock, CheckCircle2, Loader2, Mail, MessageSquareText, Phone, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { EstadoSolicitud, NeumaticosCantidad, Solicitud, TipoServicio } from '../lib/types';

const ETIQUETAS_SERVICIO: Record<TipoServicio, string> = {
  mantenimiento: 'Mantenimiento',
  neumaticos: 'Neumáticos',
  averia: 'Avería',
  pre_itv: 'Pre ITV',
};

const ETIQUETAS_NEUMATICOS: Record<NeumaticosCantidad, string> = {
  '2_delanteros': '2 delanteros',
  '2_traseros': '2 traseros',
  las_4: 'Los 4',
  delantero_izquierdo: 'Uno: delantero izquierdo',
  delantero_derecho: 'Uno: delantero derecho',
  trasero_izquierdo: 'Uno: trasero izquierdo',
  trasero_derecho: 'Uno: trasero derecho',
};

const ESTADO_BADGE: Record<EstadoSolicitud, { label: string; clase: string }> = {
  pendiente: { label: 'Pendiente', clase: 'bg-amber-100 text-amber-700' },
  aceptada: { label: 'Aceptada', clase: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', clase: 'bg-red-100 text-red-700' },
  cancelada: { label: 'Cancelada por el cliente', clase: 'bg-gray-100 text-gray-600' },
};

/**
 * Revisión de las solicitudes de servicio que los clientes crean ellos
 * mismos desde el Portal de cliente (sin pasar por el mecánico). Al
 * aceptar una, además de guardar la respuesta se crea ya una orden de
 * trabajo en estado "Solicitado" (ver `responder` más abajo) para que
 * aparezca en el Panel de gestión y se le pueda hacer seguimiento — pero
 * SIN vehículo real vinculado todavía: el check-in real (DNI, fotos, daños
 * y firma) se sigue haciendo desde el Check-in normal cuando el vehículo
 * llega físicamente al taller, completando esa misma orden ("Recibir
 * vehículo") en vez de crear una nueva. Rechazar una solicitud no crea
 * ninguna orden.
 */
export default function SolicitudesPanel() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('solicitudes')
      .select(
        'id, created_at, cliente_auth_id, nombre_cliente, email_cliente, telefono_cliente, ' +
          'matricula, marca, modelo, tipo_servicio, descripcion, neumaticos_cantidad, estado, respuesta_taller, ' +
          'fecha_cita_checkin',
      )
      .order('created_at', { ascending: false });
    if (fetchError) setError(fetchError.message);
    else setSolicitudes((data ?? []) as unknown as Solicitud[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  // Notificaciones en tiempo real: cuando un cliente crea una solicitud
  // nueva (o cancela/actualiza una existente) desde el Portal de cliente,
  // esta lista se actualiza sola, sin recargar la página. Requiere que
  // `solicitudes` esté añadida a la publicación `supabase_realtime` (ver
  // schema.sql / roles_finos_migration.sql). Es un complemento del fetch
  // inicial de arriba, no lo sustituye — así la carga inicial funciona
  // igual aunque el proyecto no tenga Realtime configurado todavía.
  useEffect(() => {
    const canal = supabase
      .channel('solicitudes-panel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'solicitudes' },
        (payload) => {
          setSolicitudes((prev) => [payload.new as Solicitud, ...prev]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'solicitudes' },
        (payload) => {
          const actualizada = payload.new as Solicitud;
          setSolicitudes((prev) => prev.map((s) => (s.id === actualizada.id ? actualizada : s)));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  const responder = async (solicitud: Solicitud, estado: 'aceptada' | 'rechazada') => {
    setProcesandoId(solicitud.id);
    setError(null);
    const respuesta = respuestas[solicitud.id]?.trim() || null;
    const { error: updateError } = await supabase
      .from('solicitudes')
      .update({ estado, respuesta_taller: respuesta })
      .eq('id', solicitud.id);
    if (updateError) {
      setProcesandoId(null);
      setError(updateError.message);
      return;
    }

    // Al aceptar, se crea ya una orden de seguimiento en estado
    // "Solicitado" — todavía sin vehículo real vinculado (eso se rellena
    // al "Recibir vehículo" desde el Panel de gestión cuando el coche
    // llega físicamente, ver ManagementPanel/InspectionForm).
    if (estado === 'aceptada') {
      const { error: ordenError } = await supabase.from('ordenes_trabajo').insert({
        estado: 'solicitado',
        tipo_servicio: solicitud.tipo_servicio,
        descripcion_averia: solicitud.descripcion,
        neumaticos_cantidad: solicitud.neumaticos_cantidad,
        solicitud_id: solicitud.id,
      });
      if (ordenError) {
        setProcesandoId(null);
        setError(
          `La solicitud se aceptó, pero no se pudo crear la orden de seguimiento: ${ordenError.message}`,
        );
        return;
      }
    }

    setProcesandoId(null);
    setSolicitudes((prev) =>
      prev.map((s) => (s.id === solicitud.id ? { ...s, estado, respuesta_taller: respuesta } : s)),
    );
  };

  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente');
  const resueltas = solicitudes.filter((s) => s.estado !== 'pendiente');

  if (cargando) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando solicitudes...
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {solicitudes.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          Todavía no hay ninguna solicitud de clientes.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-gray-700">
              Pendientes de revisar
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {pendientes.length}
              </span>
            </h2>
            {pendientes.length === 0 ? (
              <p className="text-xs text-gray-400">No hay solicitudes pendientes.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {pendientes.map((s) => (
                  <div
                    key={s.id}
                    className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm"
                  >
                    <TarjetaCabecera s={s} />
                    <textarea
                      value={respuestas[s.id] ?? ''}
                      onChange={(e) => setRespuestas((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      rows={2}
                      placeholder="Nota para el cliente (opcional), ej. 'Te esperamos el jueves a las 9h'"
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => responder(s, 'aceptada')}
                        disabled={procesandoId === s.id}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Aceptar
                      </button>
                      <button
                        type="button"
                        onClick={() => responder(s, 'rechazada')}
                        disabled={procesandoId === s.id}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {resueltas.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-gray-700">Ya revisadas</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {resueltas.map((s) => (
                  <div key={s.id} className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <TarjetaCabecera s={s} />
                    {s.respuesta_taller && (
                      <p className="flex items-start gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600">
                        <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s.respuesta_taller}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TarjetaCabecera({ s }: { s: Solicitud }) {
  const badge = ESTADO_BADGE[s.estado];
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{s.nombre_cliente}</p>
          {s.email_cliente && (
            <p className="flex items-center gap-1 truncate text-xs text-gray-500">
              <Mail className="h-3 w-3 shrink-0" /> {s.email_cliente}
            </p>
          )}
          {s.telefono_cliente && (
            <p className="flex items-center gap-1 text-xs text-gray-500">
              <Phone className="h-3 w-3 shrink-0" /> {s.telefono_cliente}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.clase}`}>{badge.label}</span>
          {/* Sin cuenta del Portal: la registró el propio taller (llamada
           *  telefónica, walk-in...) desde la pestaña "Solicitud de cita",
           *  no el cliente por su cuenta — ver SolicitudCitaPanel.tsx. */}
          {!s.cliente_auth_id && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
              Del taller
            </span>
          )}
        </div>
      </div>
      {s.matricula && (
        <p className="flex items-center gap-1.5 text-xs text-gray-600">
          <Car className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          {s.matricula} · {[s.marca, s.modelo].filter(Boolean).join(' ') || 'Sin marca/modelo'}
        </p>
      )}
      {s.fecha_cita_checkin && (
        <p className="flex items-center gap-1.5 text-xs text-indigo-600">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          Propone traerlo el {new Date(s.fecha_cita_checkin).toLocaleDateString('es-ES')} a las{' '}
          {new Date(s.fecha_cita_checkin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
      <p className="text-xs font-medium text-blue-600">
        {ETIQUETAS_SERVICIO[s.tipo_servicio]}
        {s.tipo_servicio === 'neumaticos' && s.neumaticos_cantidad
          ? ` — ${ETIQUETAS_NEUMATICOS[s.neumaticos_cantidad]}`
          : ''}
      </p>
      {s.descripcion && <p className="text-xs text-gray-600">{s.descripcion}</p>}
    </>
  );
}
