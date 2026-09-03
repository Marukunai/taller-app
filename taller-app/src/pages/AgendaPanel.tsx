import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Car,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Phone,
  RefreshCw,
  Settings,
  Truck,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TipoServicio } from '../lib/types';

type TipoCita = 'checkin' | 'recogida';

interface EventoAgenda {
  id: string;
  tipo: TipoCita;
  fecha: string;
  tipoServicio: TipoServicio | null;
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

/** Horario de apertura asumido (batch 19, parte 4 — confirmado por el
 *  usuario: horario continuo, sin descanso a mediodía). `HORA_CIERRE` es
 *  EXCLUSIVO: con 8/20 la última franja mostrada es 19:00–20:00. Si el
 *  horario real del taller cambia, basta con ajustar estas dos constantes
 *  (la app sigue sin tener una pantalla de configuración de horario). */
const HORA_APERTURA = 8;
const HORA_CIERRE = 20;

/** Duración asumida de una cita según el tipo de servicio — la app no
 *  guarda ninguna duración real (solo la hora de inicio), así que esto es
 *  una ESTIMACIÓN propia razonable (confirmado por el usuario que debía
 *  depender del tipo de servicio, delegando en mí los minutos concretos):
 *  revisar y ajustar si no encaja con la duración real de cada servicio en
 *  este taller. */
const DURACION_MINUTOS_POR_SERVICIO: Record<TipoServicio, number> = {
  mantenimiento: 60,
  neumaticos: 45,
  pre_itv: 30,
  averia: 90,
};
const DURACION_MINUTOS_DEFECTO = 60;

function duracionMinutos(evento: EventoAgenda): number {
  return evento.tipoServicio ? DURACION_MINUTOS_POR_SERVICIO[evento.tipoServicio] : DURACION_MINUTOS_DEFECTO;
}

/** Devuelve las horas en punto (enteros) que ocupa una cita dado su inicio
 *  real y su duración estimada — una cita que empieza a las 10:30 y dura 60
 *  minutos ocupa las franjas de las 10:00 y de las 11:00. */
function horasOcupadas(fecha: Date, duracionMin: number): number[] {
  const inicioMin = fecha.getHours() * 60 + fecha.getMinutes();
  const finMin = inicioMin + duracionMin;
  const horas: number[] = [];
  for (let h = Math.floor(inicioMin / 60); h < Math.ceil(finMin / 60); h++) {
    horas.push(h);
  }
  return horas;
}

/** Altura en px de una hora en la vista de Semana/Día (batch 23) — a más
 *  px/hora, más "aire" para leer el texto de cada cita dentro de su bloque. */
const ALTURA_HORA_PX = 64;

interface BloqueEvento {
  evento: EventoAgenda;
  col: number;
}

/** Reparte las citas de UN día en columnas horizontales para que las que se
 *  solapan en el tiempo se vean una al lado de otra en vez de tapándose
 *  (batch 23, vista Semana/Día). Algoritmo simple tipo "greedy": recorre las
 *  citas ordenadas por hora de inicio y reutiliza la primera columna que ya
 *  quedó libre (su cita anterior terminó antes de que empiece la nueva); si
 *  ninguna está libre, abre una columna nueva. El nº total de columnas se
 *  usa para dar el mismo ancho a todos los bloques de ese día.
 */
function distribuirColumnas(eventosDia: EventoAgenda[]): { bloques: BloqueEvento[]; totalCols: number } {
  const ordenados = eventosDia
    .slice()
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  const finPorColumna: number[] = [];
  const bloques: BloqueEvento[] = [];
  for (const evento of ordenados) {
    const inicio = new Date(evento.fecha).getTime();
    const fin = inicio + duracionMinutos(evento) * 60000;
    let col = finPorColumna.findIndex((finCol) => finCol <= inicio);
    if (col === -1) {
      col = finPorColumna.length;
      finPorColumna.push(fin);
    } else {
      finPorColumna[col] = fin;
    }
    bloques.push({ evento, col });
  }
  return { bloques, totalCols: Math.max(1, finPorColumna.length) };
}

type ColorDia = 'libre' | 'parcial' | 'lleno';

/** Verde = ninguna franja horaria del horario de apertura tiene ninguna
 *  cita, rojo = TODAS las franjas están a plazas completas (tantas citas
 *  simultáneas como `plazas`), naranja = cualquier otra situación
 *  intermedia. `porHora` viene de `ocupacionPorDia` (mapa hora→nº de citas
 *  que la ocupan a la vez, contando la duración estimada de cada una). */
function colorDia(porHora: Map<number, number> | undefined, plazas: number): ColorDia {
  if (!porHora || porHora.size === 0) return 'libre';
  let hayAlgunaCita = false;
  let todasLasFranjasCompletas = true;
  for (let h = HORA_APERTURA; h < HORA_CIERRE; h++) {
    const ocupadas = porHora.get(h) ?? 0;
    if (ocupadas > 0) hayAlgunaCita = true;
    if (ocupadas < plazas) todasLasFranjasCompletas = false;
  }
  if (!hayAlgunaCita) return 'libre';
  return todasLasFranjasCompletas ? 'lleno' : 'parcial';
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

const ESTILO_FRANJA: Record<ColorDia, string> = {
  libre: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  parcial: 'border-amber-200 bg-amber-50 text-amber-800',
  lleno: 'border-red-200 bg-red-50 text-red-800',
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
 * naranja/rojo, ver `colorDia`) — batch 19, parte 3. La lista cronológica
 * original se mantiene como una segunda vista ("Lista").
 *
 * **Batch 19, parte 4** (a petición del usuario tras usar la parte 3, que
 * consideró la estimación de "8h/1cita" demasiado simple para un taller con
 * varios empleados abierto muchas horas): el color de cada día y el detalle
 * del día seleccionado ahora se calculan por FRANJAS HORARIAS de 1h dentro
 * de un horario de apertura fijo (`HORA_APERTURA`–`HORA_CIERRE`, continuo,
 * confirmado por el usuario), comparando en cada franja cuántas citas caen
 * a la vez contra las "plazas de trabajo simultáneas" del taller
 * (`configuracion_taller.plazas_simultaneas` — un número fijo editable por
 * dueño/encargado/admin con el botón de engranaje de aquí abajo, no
 * calculado a partir del nº de mecánicos). Como la app no guarda cuánto
 * dura una cita, se usa una duración estimada por tipo de servicio
 * (`DURACION_MINUTOS_POR_SERVICIO`, confirmado por el usuario que debía
 * depender del tipo de servicio).
 */
export default function AgendaPanel({ esEncargado }: { esEncargado: boolean }) {
  const [eventos, setEventos] = useState<EventoAgenda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soloProximas, setSoloProximas] = useState(true);
  const [vista, setVista] = useState<'mes' | 'semana' | 'lista'>('mes');
  const [mesActual, setMesActual] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [diaSeleccionado, setDiaSeleccionado] = useState<string>(() => claveFechaLocal(new Date()));

  // Vista "Semana"/"Día" (batch 23) — calendario en línea de tiempo, hecho a
  // mano igual que el resto de la Agenda (sin librerías de calendario).
  // `fechaTimeline` es el día ancla: en modo "semana" se usa para calcular
  // el lunes de esa semana (`inicioSemana`); en modo "día" es el día exacto
  // que se muestra. Cambiar de una a otra conserva el día ancla, así que
  // pulsar la cabecera de un día en la vista semanal salta a su vista diaria.
  const [granularidadTimeline, setGranularidadTimeline] = useState<'semana' | 'dia'>('semana');
  const [fechaTimeline, setFechaTimeline] = useState<Date>(() => new Date());

  // Plazas de trabajo simultáneas del taller (batch 19, parte 4) — un
  // número fijo editable por dueño/encargado/admin, guardado en la fila
  // única de `configuracion_taller`. Por defecto 2 mientras carga o si la
  // migración/tabla todavía no existe en el proyecto Supabase del usuario.
  const [plazas, setPlazas] = useState(2);
  const [editandoPlazas, setEditandoPlazas] = useState(false);
  const [plazasInput, setPlazasInput] = useState('2');
  const [guardandoPlazas, setGuardandoPlazas] = useState(false);
  const [errorPlazas, setErrorPlazas] = useState<string | null>(null);

  const cargarConfiguracion = useCallback(async () => {
    const { data } = await supabase
      .from('configuracion_taller')
      .select('plazas_simultaneas')
      .eq('id', 1)
      .maybeSingle();
    if (data) {
      setPlazas(data.plazas_simultaneas);
      setPlazasInput(String(data.plazas_simultaneas));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarConfiguracion();
  }, [cargarConfiguracion]);

  const guardarPlazas = async (e: FormEvent) => {
    e.preventDefault();
    const valor = Number(plazasInput);
    if (!Number.isInteger(valor) || valor < 1) {
      setErrorPlazas('Introduce un número entero de 1 o más.');
      return;
    }
    setErrorPlazas(null);
    setGuardandoPlazas(true);
    const { error: updateError } = await supabase
      .from('configuracion_taller')
      .update({ plazas_simultaneas: valor })
      .eq('id', 1);
    setGuardandoPlazas(false);
    if (updateError) {
      setErrorPlazas(
        updateError.message.includes('configuracion_taller')
          ? 'No se pudo guardar: parece que falta ejecutar la migración batch19_parte4_migration.sql en Supabase.'
          : updateError.message,
      );
      return;
    }
    setPlazas(valor);
    setEditandoPlazas(false);
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [ordenesRes, solicitudesRes] = await Promise.all([
      supabase
        .from('ordenes_trabajo')
        .select(
          'id, cita_recogida, tipo_servicio, vehiculos(matricula, marca, modelo, clientes(nombre, telefono))',
        )
        .not('cita_recogida', 'is', null)
        .eq('estado', 'listo'),
      supabase
        .from('solicitudes')
        .select(
          'id, fecha_cita_checkin, tipo_servicio, matricula, marca, modelo, nombre_cliente, telefono_cliente',
        )
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
        tipo_servicio: TipoServicio | null;
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
        tipoServicio: orden.tipo_servicio,
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
        tipo_servicio: TipoServicio | null;
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
        tipoServicio: sol.tipo_servicio,
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

  // Ocupación por franja horaria de 1h dentro de cada día (batch 19, parte
  // 4): Map<"YYYY-MM-DD", Map<hora, nº de citas que la ocupan a la vez>> —
  // cada cita cuenta en TODAS las horas que solapa según su duración
  // estimada (ver `horasOcupadas`/`duracionMinutos`).
  const ocupacionPorDia = useMemo(() => {
    const mapa = new Map<string, Map<number, number>>();
    for (const evento of eventos) {
      const fecha = new Date(evento.fecha);
      const clave = claveFechaLocal(fecha);
      const porHora = mapa.get(clave) ?? new Map<number, number>();
      for (const h of horasOcupadas(fecha, duracionMinutos(evento))) {
        porHora.set(h, (porHora.get(h) ?? 0) + 1);
      }
      mapa.set(clave, porHora);
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

  // Días a pintar en la vista Semana/Día: o los 7 días de la semana que
  // contiene `fechaTimeline` (lunes a domingo), o ese único día.
  const diasTimeline = useMemo(() => {
    if (granularidadTimeline === 'dia') return [fechaTimeline];
    const inicio = inicioSemana(fechaTimeline);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [granularidadTimeline, fechaTimeline]);

  const etiquetaTimeline = useMemo(() => {
    if (granularidadTimeline === 'dia') return claveDia(fechaTimeline);
    const inicio = diasTimeline[0];
    const fin = diasTimeline[diasTimeline.length - 1];
    const mismoMes = inicio.getMonth() === fin.getMonth();
    const inicioStr = inicio.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: mismoMes ? undefined : 'short',
    });
    const finStr = fin.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${inicioStr} – ${finStr}`;
  }, [granularidadTimeline, fechaTimeline, diasTimeline]);

  const eventosDiaSeleccionado = eventosPorDia.get(diaSeleccionado) ?? [];
  const ocupacionDiaSeleccionado = ocupacionPorDia.get(diaSeleccionado);
  const horasDelDia = useMemo(
    () => Array.from({ length: HORA_CIERRE - HORA_APERTURA }, (_, i) => HORA_APERTURA + i),
    [],
  );
  const hoyClave = claveFechaLocal(new Date());

  const cambiarMes = (delta: number) => {
    setMesActual((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const irAHoy = () => {
    const hoy = new Date();
    setMesActual(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    setDiaSeleccionado(claveFechaLocal(hoy));
  };

  const cambiarTimeline = (delta: number) => {
    setFechaTimeline((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta * (granularidadTimeline === 'dia' ? 1 : 7));
      return d;
    });
  };

  const irAHoyTimeline = () => setFechaTimeline(new Date());

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
          {esEncargado && (
            <button
              type="button"
              onClick={() => setEditandoPlazas((v) => !v)}
              title="Configurar plazas de trabajo simultáneas"
              aria-label="Configurar plazas de trabajo simultáneas"
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-600 shadow-sm hover:bg-gray-50"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
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
              onClick={() => setVista('semana')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                vista === 'semana' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <CalendarRange className="h-3.5 w-3.5" /> Semana
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

      {esEncargado && editandoPlazas && (
        <form
          onSubmit={guardarPlazas}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Plazas de trabajo simultáneas (elevadores/puestos)
            </label>
            <input
              type="number"
              min={1}
              value={plazasInput}
              onChange={(e) => setPlazasInput(e.target.value)}
              className="w-28 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={guardandoPlazas}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {guardandoPlazas ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => setEditandoPlazas(false)}
            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
          {errorPlazas && <p className="w-full text-xs text-red-600">{errorPlazas}</p>}
          <p className="w-full text-xs text-gray-500">
            Cuántas citas caben a la vez en la misma franja horaria de 1h — se usa para calcular el color de
            cada día y las franjas ocupadas/libres de abajo.
          </p>
        </form>
      )}

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
                const color = colorDia(ocupacionPorDia.get(clave), plazas);
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
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Quedan franjas libres
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-400" /> Día completo
              </span>
              <span className="text-gray-400">
                (franjas de 1h entre las {HORA_APERTURA}:00 y las {HORA_CIERRE}:00, con {plazas} plaza
                {plazas === 1 ? '' : 's'} de trabajo simultánea{plazas === 1 ? '' : 's'})
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

            <div className="mb-4 space-y-1.5">
              {horasDelDia.map((h) => {
                const ocupadas = ocupacionDiaSeleccionado?.get(h) ?? 0;
                const estado: ColorDia = ocupadas === 0 ? 'libre' : ocupadas >= plazas ? 'lleno' : 'parcial';
                const clientesEnFranja = eventosDiaSeleccionado
                  .filter((e) => horasOcupadas(new Date(e.fecha), duracionMinutos(e)).includes(h))
                  .map((e) => e.clienteNombre);
                return (
                  <div
                    key={h}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs ${ESTILO_FRANJA[estado]}`}
                  >
                    <span className="shrink-0 font-medium">
                      {String(h).padStart(2, '0')}:00–{String(h + 1).padStart(2, '0')}:00
                    </span>
                    <span className="truncate text-right">
                      {ocupadas}/{plazas}
                      {clientesEnFranja.length > 0 ? ` · ${clientesEnFranja.join(', ')}` : ' · Libre'}
                    </span>
                  </div>
                );
              })}
            </div>

            <h3 className="mb-2 text-sm font-semibold text-gray-700">Citas del día</h3>
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
      ) : vista === 'semana' ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => cambiarTimeline(-1)}
              className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
              aria-label={granularidadTimeline === 'dia' ? 'Día anterior' : 'Semana anterior'}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <h2 className="text-sm font-semibold capitalize text-gray-800">{etiquetaTimeline}</h2>
              <button
                type="button"
                onClick={irAHoyTimeline}
                className="rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
              >
                Hoy
              </button>
              <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setGranularidadTimeline('semana')}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    granularidadTimeline === 'semana' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Semana
                </button>
                <button
                  type="button"
                  onClick={() => setGranularidadTimeline('dia')}
                  className={`rounded px-2 py-1 text-xs font-medium transition ${
                    granularidadTimeline === 'dia' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  Día
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => cambiarTimeline(1)}
              className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
              aria-label={granularidadTimeline === 'dia' ? 'Día siguiente' : 'Semana siguiente'}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <VistaTimeline
            dias={diasTimeline}
            granularidad={granularidadTimeline}
            eventosPorDia={eventosPorDia}
            ocupacionPorDia={ocupacionPorDia}
            plazas={plazas}
            ahora={ahora}
            onClickDia={(dia) => {
              setGranularidadTimeline('dia');
              setFechaTimeline(dia);
            }}
          />

          <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] text-gray-500">
            Las citas se colocan según su hora de inicio real; la duración es una estimación por tipo de
            servicio (no se guarda la duración real de cada cita). Pulsa un día de la semana para ver su
            detalle por horas.
          </p>
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

/**
 * Vista "Semana"/"Día" (batch 23): línea de tiempo con las citas colocadas
 * por su hora de inicio real y su duración estimada (`duracionMinutos`),
 * en vez de solo listarlas — el hueco que tenía la Agenda frente a las
 * vistas Mes/Lista, que no dejaban ver de un vistazo cómo queda el día
 * ocupado hora a hora. Hecha a mano con `<div>`s posicionados de forma
 * absoluta dentro de una columna por día (sin ninguna librería de
 * calendario), igual que el resto de esta pantalla.
 */
function VistaTimeline({
  dias,
  granularidad,
  eventosPorDia,
  ocupacionPorDia,
  plazas,
  ahora,
  onClickDia,
}: {
  dias: Date[];
  granularidad: 'semana' | 'dia';
  eventosPorDia: Map<string, EventoAgenda[]>;
  ocupacionPorDia: Map<string, Map<number, number>>;
  plazas: number;
  ahora: number;
  onClickDia: (dia: Date) => void;
}) {
  const horas = Array.from({ length: HORA_CIERRE - HORA_APERTURA }, (_, i) => HORA_APERTURA + i);
  const alturaTotal = (HORA_CIERRE - HORA_APERTURA) * ALTURA_HORA_PX;
  const hoyClave = claveFechaLocal(new Date());

  // La línea roja de "ahora" solo se pinta en la columna de hoy, y solo si
  // la hora actual cae dentro del horario de apertura mostrado.
  const ahoraDate = new Date(ahora);
  const minutosAhora = ahoraDate.getHours() * 60 + ahoraDate.getMinutes() - HORA_APERTURA * 60;
  const mostrarLineaAhora = minutosAhora >= 0 && minutosAhora <= (HORA_CIERRE - HORA_APERTURA) * 60;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div
          className="grid border-b border-gray-100"
          style={{ gridTemplateColumns: `52px repeat(${dias.length}, minmax(0,1fr))` }}
        >
          <div />
          {dias.map((dia) => {
            const clave = claveFechaLocal(dia);
            const color = colorDia(ocupacionPorDia.get(clave), plazas);
            const esHoy = clave === hoyClave;
            return (
              <button
                key={clave}
                type="button"
                onClick={() => onClickDia(dia)}
                disabled={granularidad === 'dia'}
                className={`flex flex-col items-center gap-0.5 border-l border-gray-100 py-2 text-xs ${
                  granularidad === 'semana' ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
                }`}
              >
                <span className="uppercase text-gray-400">
                  {dia.toLocaleDateString('es-ES', { weekday: 'short' })}
                </span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                    esHoy ? 'bg-indigo-600 text-white' : 'text-gray-700'
                  }`}
                >
                  {dia.getDate()}
                </span>
                <span className={`h-1.5 w-1.5 rounded-full ${PUNTO_COLOR_DIA[color]}`} />
              </button>
            );
          })}
        </div>

        <div className="grid" style={{ gridTemplateColumns: `52px repeat(${dias.length}, minmax(0,1fr))` }}>
          <div className="relative" style={{ height: alturaTotal }}>
            {horas.map((h) => (
              <span
                key={h}
                className="absolute right-0 -translate-y-1/2 pr-1.5 text-right text-[10px] text-gray-400"
                style={{ top: (h - HORA_APERTURA) * ALTURA_HORA_PX }}
              >
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {dias.map((dia) => {
            const clave = claveFechaLocal(dia);
            const eventosDia = eventosPorDia.get(clave) ?? [];
            const { bloques, totalCols } = distribuirColumnas(eventosDia);
            const esHoy = clave === hoyClave;
            return (
              <div key={clave} className="relative border-l border-gray-100" style={{ height: alturaTotal }}>
                {horas.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-gray-100"
                    style={{ top: (h - HORA_APERTURA) * ALTURA_HORA_PX }}
                  />
                ))}
                {esHoy && mostrarLineaAhora && (
                  <div
                    className="absolute inset-x-0 z-10 border-t-2 border-red-400"
                    style={{ top: (minutosAhora / 60) * ALTURA_HORA_PX }}
                  />
                )}
                {eventosDia.length === 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-300">
                    —
                  </span>
                )}
                {bloques.map(({ evento, col }) => {
                  const fecha = new Date(evento.fecha);
                  const inicioMin = Math.max(0, fecha.getHours() * 60 + fecha.getMinutes() - HORA_APERTURA * 60);
                  const duracionMin = duracionMinutos(evento);
                  const alturaMin = Math.max(
                    15,
                    Math.min(duracionMin, (HORA_CIERRE - HORA_APERTURA) * 60 - inicioMin),
                  );
                  return (
                    <div
                      key={evento.id}
                      title={`${fecha.toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} · ${evento.tipo === 'checkin' ? 'Traída (check-in)' : 'Recogida'} · ${
                        evento.matricula ?? '—'
                      } · ${evento.clienteNombre}`}
                      className={`absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[10px] leading-tight shadow-sm ${
                        evento.tipo === 'checkin'
                          ? 'border-sky-300 bg-sky-100 text-sky-800'
                          : 'border-emerald-300 bg-emerald-100 text-emerald-800'
                      }`}
                      style={{
                        top: (inicioMin / 60) * ALTURA_HORA_PX,
                        height: (alturaMin / 60) * ALTURA_HORA_PX - 2,
                        left: `calc(${(col / totalCols) * 100}% + 1px)`,
                        width: `calc(${100 / totalCols}% - 2px)`,
                      }}
                    >
                      <p className="truncate font-semibold">
                        {fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}{' '}
                        {evento.clienteNombre}
                      </p>
                      <p className="truncate text-[9px] opacity-80">{evento.matricula ?? '—'}</p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
