import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Phone,
  RefreshCw,
  Truck,
} from 'lucide-react';
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
 *  para la vista de lista. */
function claveDia(fecha: Date): string {
  const texto = fecha.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Clave "YYYY-MM-DD" en hora LOCAL (no `toISOString`, que convierte a UTC y
 *  puede cambiar de día cerca de medianoche) — se usa para agrupar eventos
 *  por día de calendario y para comparar con las celdas del mes. */
function claveFechaLocal(fecha: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

/** Lunes de la semana que contiene `fecha` (semana de lunes a domingo, como
 *  es habitual en España), a las 00:00 locales. */
function inicioSemana(fecha: Date): Date {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = lunes ... 6 = domingo
  d.setDate(d.getDate() - dow);
  return d;
}

/** Genera todas las celdas (días) a pintar en la cuadrícula del mes,
 *  siempre en semanas completas de lunes a domingo — incluye algunos días
 *  del mes anterior/siguiente para rellenar la primera/última semana. */
function celdasDelMes(mesActual: Date): Date[] {
  const primerDiaMes = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1);
  const ultimoDiaMes = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0);
  const inicio = inicioSemana(primerDiaMes);
  const finSemana = inicioSemana(ultimoDiaMes);
  finSemana.setDate(finSemana.getDate() + 6);

  const celdas: Date[] = [];
  const cursor = new Date(inicio);
  while (cursor <= finSemana) {
    celdas.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return celdas;
}

/** Horas laborables asumidas por día, para estimar cuánto de "lleno" está —
 *  la app no tiene ninguna configuración real de horario del taller ni de
 *  franjas/aforo (decisión explícita de mantenerlo simple, ver comentario
 *  original de este archivo), así que esto es una ESTIMACIÓN a ojo: 8 horas
 *  al día y 1 hora por cita. Si un taller real tiene un horario muy distinto
 *  esto se puede ajustar aquí (una sola constante). */
const HORAS_LABORABLES_DIA = 8;

type ColorDia = 'libre' | 'parcial' | 'lleno';

/** Verde = sin ninguna cita ese día, naranja = alguna cita pero por debajo
 *  de las horas laborables asumidas, rojo = tantas o más citas que horas
 *  laborables asumidas (día "lleno" según la estimación). */
function colorDia(numEventos: number): ColorDia {
  if (numEventos === 0) return 'libre';
  if (numEventos < HORAS_LABORABLES_DIA) return 'parcial';
  return 'lleno';
}

const ESTILO_COLOR_DIA: Record<ColorDia, string> = {
  libre: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800',
  parcial: 'bg-amber-50 hover:bg-amber-100 text-amber-800',
  lleno: 'bg-red-50 hover:bg-red-100 text-red-800',
};

const PUNTO_COLOR_DIA: Record<ColorDia, string> = {
  libre: 'bg-emerald-400',
  parcial: 'bg-amber-400',
  lleno: 'bg-red-400',
};

/**
 * Agenda unificada de citas: combina las citas de RECOGIDA (concertadas por
 * el taller al marcar una orden "Listo") con las citas de CHECK-IN
 * (propuestas por el cliente al pedir un servicio desde el Portal, o
 * acordadas por el personal al aceptar una solicitud — ver
 * SolicitudesPanel.tsx) en una sola agenda. Accesible a cualquier personal
 * (encargado o mecánico) — no incluye ningún precio/coste, así que no hace
 * falta restringirla como Inventario o Presupuestos.
 *
 * Vista por defecto: calendario MENSUAL con un color por día (verde/
 * naranja/rojo, ver `colorDia` — una ESTIMACIÓN, no una gestión real de
 * franjas/aforo) — batch 19, parte 3, a petición del usuario. La lista
 * cronológica original se mantiene como una segunda vista ("Lista"), por si
 * la estimación por colores no encaja con cómo trabaja el taller.
 */
export default function AgendaPanel() {
  const [eventos, setEventos] = useState<EventoAgenda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloProximas, setSoloProximas] = useState(true);
  const [vista, setVista] = useState<'mes' | 'lista'>('mes');
  const [mesActual, setMesActual] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [diaSeleccionado, setDiaSeleccionado] = useState<string>(() => claveFechaLocal(new Date()));

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

  // Agrupación por día de calendario (clave "YYYY-MM-DD" en hora local) —
  // usada tanto por la vista de mes (para el color/contador de cada celda)
  // como por la lista del día seleccionado.
  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, EventoAgenda[]>();
    for (const evento of eventos) {
      const clave = claveFechaLocal(new Date(evento.fecha));
      const lista = mapa.get(clave) ?? [];
      lista.push(evento);
      mapa.set(clave, lista);
    }
    return mapa;
  }, [eventos]);

  // Vista de lista: agrupada por día "legible", con el filtro de "Solo
  // próximas" (que no se aplica a la vista de mes: un mes se navega hacia
  // delante/atrás libremente, así que ese filtro no pintaría nada).
  const gruposLista = useMemo(() => {
    const grupos = new Map<string, EventoAgenda[]>();
    for (const evento of eventosFiltrados) {
      const clave = claveDia(new Date(evento.fecha));
      const lista = grupos.get(clave) ?? [];
      lista.push(evento);
      grupos.set(clave, lista);
    }
    return grupos;
  }, [eventosFiltrados]);

  const celdas = useMemo(() => celdasDelMes(mesActual), [mesActual]);
  const eventosDiaSeleccionado = eventosPorDia.get(diaSeleccionado) ?? [];
  const hoyClave = claveFechaLocal(new Date());

  const cambiarMes = (delta: number) => {
    setMesActual((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const irAHoy = () => {
    const hoy = new Date();
    setMesActual(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    setDiaSeleccionado(claveFechaLocal(hoy));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
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
          <div className="flex rounded-xl border border-gray-300 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setVista('mes')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                vista === 'mes' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Mes
            </button>
            <button
              type="button"
              onClick={() => setVista('lista')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                vista === 'lista' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <List className="h-3.5 w-3.5" /> Lista
            </button>
          </div>
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
      ) : vista === 'mes' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => cambiarMes(-1)}
                className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold capitalize text-gray-800">
                  {mesActual.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </h2>
                <button
                  type="button"
                  onClick={irAHoy}
                  className="rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                >
                  Hoy
                </button>
              </div>
              <button
                type="button"
                onClick={() => cambiarMes(1)}
                className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-gray-400">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((fecha) => {
                const clave = claveFechaLocal(fecha);
                const enMes = fecha.getMonth() === mesActual.getMonth();
                const numEventos = eventosPorDia.get(clave)?.length ?? 0;
                const color = colorDia(numEventos);
                const seleccionado = clave === diaSeleccionado;
                return (
                  <button
                    key={clave}
                    type="button"
                    onClick={() => setDiaSeleccionado(clave)}
                    className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition ${
                      enMes ? ESTILO_COLOR_DIA[color] : 'bg-gray-50 text-gray-300 hover:bg-gray-100'
                    } ${seleccionado ? 'ring-2 ring-indigo-500' : ''} ${clave === hoyClave ? 'font-bold' : ''}`}
                  >
                    <span>{fecha.getDate()}</span>
                    {numEventos > 0 && (
                      <span className={`h-1.5 w-1.5 rounded-full ${enMes ? PUNTO_COLOR_DIA[color] : 'bg-gray-300'}`} />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Libre
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Quedan horas libres
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-400" /> Día completo
              </span>
              <span className="text-gray-400">
                (estimación asumiendo {HORAS_LABORABLES_DIA} horas de trabajo al día y 1 hora por cita)
              </span>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              {new Date(diaSeleccionado + 'T00:00:00').toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </h3>
            {eventosDiaSeleccionado.length === 0 ? (
              <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                Sin citas ese día.
              </p>
            ) : (
              <div className="space-y-2">
                {eventosDiaSeleccionado
                  .slice()
                  .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
                  .map((evento) => (
                    <TarjetaEvento key={evento.id} evento={evento} />
                  ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
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
          </div>
          {gruposLista.size === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
              No hay citas {soloProximas ? 'próximas' : 'registradas'}.
            </p>
          ) : (
            Array.from(gruposLista.entries()).map(([dia, eventosDia]) => (
              <section key={dia}>
                <h2 className="mb-2 text-sm font-semibold text-gray-700">{dia}</h2>
                <div className="space-y-2">
                  {eventosDia.map((evento) => (
                    <TarjetaEvento key={evento.id} evento={evento} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaEvento({ evento }: { evento: EventoAgenda }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          evento.tipo === 'checkin' ? 'bg-sky-100 text-sky-600' : 'bg-emerald-100 text-emerald-600'
        }`}
      >
        {evento.tipo === 'checkin' ? <CalendarClock className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
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
  );
}
