import { useCallback, useEffect, useState } from 'react';
import { Calendar, CalendarClock, Car, Loader2, Phone, RefreshCw, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';

type TipoCita = 'checkin' | 'recogida';

interface EventoAgenda {
  id: string;
  tipo: TipoCita;
  fecha: string;
  matricula: string | null;
  marcaModelo: string;
  clienteNombre: string;
  clienteTelefono: string | null;
}

/** Agrupa por día en formato "lunes, 26 de agosto de 2026" (capitalizado),
 *  para que la agenda se lea como un calendario aunque no haya ninguna
 *  librería de calendario de por medio (decisión explícita: nada de
 *  franjas/aforo, solo una lista cronológica sencilla). */
function claveDia(fecha: Date): string {
  const texto = fecha.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Agenda unificada de citas: combina las citas de RECOGIDA (concertadas por
 * el taller al marcar una orden "Listo") con las citas de CHECK-IN
 * (propuestas por el cliente al pedir un servicio desde el Portal) en una
 * sola lista cronológica. Accesible a cualquier personal (encargado o
 * mecánico) — no incluye ningún precio/coste, así que no hace falta
 * restringirla como Inventario o Presupuestos.
 */
export default function AgendaPanel() {
  const [eventos, setEventos] = useState<EventoAgenda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloProximas, setSoloProximas] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [ordenesRes, solicitudesRes] = await Promise.all([
      supabase
        .from('ordenes_trabajo')
        .select(
          'id, cita_recogida, vehiculos(matricula, marca, modelo, clientes(nombre, telefono))',
        )
        .not('cita_recogida', 'is', null)
        .eq('estado', 'listo'),
      supabase
        .from('solicitudes')
        .select('id, fecha_cita_checkin, matricula, marca, modelo, nombre_cliente, telefono_cliente')
        .not('fecha_cita_checkin', 'is', null)
        .in('estado', ['pendiente', 'aceptada']),
    ]);

    if (ordenesRes.error) {
      setError(ordenesRes.error.message);
      setCargando(false);
      return;
    }
    if (solicitudesRes.error) {
      setError(solicitudesRes.error.message);
      setCargando(false);
      return;
    }

    const deRecogidas: EventoAgenda[] = (ordenesRes.data ?? []).map((o) => {
      const orden = o as unknown as {
        id: string;
        cita_recogida: string;
        vehiculos: {
          matricula: string;
          marca: string | null;
          modelo: string | null;
          clientes: { nombre: string; telefono: string } | null;
        } | null;
      };
      return {
        id: `recogida-${orden.id}`,
        tipo: 'recogida',
        fecha: orden.cita_recogida,
        matricula: orden.vehiculos?.matricula ?? null,
        marcaModelo: [orden.vehiculos?.marca, orden.vehiculos?.modelo].filter(Boolean).join(' '),
        clienteNombre: orden.vehiculos?.clientes?.nombre ?? 'Cliente',
        clienteTelefono: orden.vehiculos?.clientes?.telefono ?? null,
      };
    });

    const deCheckins: EventoAgenda[] = (solicitudesRes.data ?? []).map((s) => {
      const sol = s as {
        id: string;
        fecha_cita_checkin: string;
        matricula: string | null;
        marca: string | null;
        modelo: string | null;
        nombre_cliente: string;
        telefono_cliente: string | null;
      };
      return {
        id: `checkin-${sol.id}`,
        tipo: 'checkin',
        fecha: sol.fecha_cita_checkin,
        matricula: sol.matricula,
        marcaModelo: [sol.marca, sol.modelo].filter(Boolean).join(' '),
        clienteNombre: sol.nombre_cliente,
        clienteTelefono: sol.telefono_cliente,
      };
    });

    setEventos(
      [...deRecogidas, ...deCheckins].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()),
    );
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  // "Ahora" se fija al cargar (no en cada render, que sería una función
  // impura llamada durante el renderizado) — para una agenda que se
  // recarga a mano con el botón "Actualizar", es más que suficiente.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAhora(Date.now());
  }, [eventos]);
  const eventosFiltrados = soloProximas ? eventos.filter((e) => new Date(e.fecha).getTime() >= ahora) : eventos;

  const grupos = new Map<string, EventoAgenda[]>();
  for (const evento of eventosFiltrados) {
    const clave = claveDia(new Date(evento.fecha));
    const lista = grupos.get(clave) ?? [];
    lista.push(evento);
    grupos.set(clave, lista);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <Calendar className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
            <p className="text-sm text-gray-500">Citas de recogida y de traída de vehículos (check-in).</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoloProximas((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition ${
              soloProximas
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Solo próximas
          </button>
          <button
            type="button"
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando agenda...
        </p>
      ) : grupos.size === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          No hay citas {soloProximas ? 'próximas' : 'registradas'}.
        </p>
      ) : (
        <div className="space-y-6">
          {Array.from(grupos.entries()).map(([dia, eventosDia]) => (
            <section key={dia}>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">{dia}</h2>
              <div className="space-y-2">
                {eventosDia.map((evento) => (
                  <div
                    key={evento.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        evento.tipo === 'checkin' ? 'bg-sky-100 text-sky-600' : 'bg-emerald-100 text-emerald-600'
                      }`}
                    >
                      {evento.tipo === 'checkin' ? (
                        <CalendarClock className="h-4 w-4" />
                      ) : (
                        <Truck className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {new Date(evento.fecha).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {evento.tipo === 'checkin' ? 'Traída (check-in)' : 'Recogida'}
                      </p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-gray-600">
                        <Car className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        {evento.matricula ?? '—'} · {evento.marcaModelo || 'Sin marca/modelo'}
                      </p>
                      <p className="truncate text-xs text-gray-500">{evento.clienteNombre}</p>
                    </div>
                    {evento.clienteTelefono && (
                      <a
                        href={`tel:${evento.clienteTelefono}`}
                        className="flex shrink-0 items-center gap-1 rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                      >
                        <Phone className="h-3 w-3" /> {evento.clienteTelefono}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
