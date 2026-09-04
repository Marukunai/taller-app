import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bike, Calendar, Car, Gauge, Info, Loader2, Phone, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { EstadoOrden, TipoVehiculo } from '../lib/types';

/** Umbral de tiempo: se considera que "toca revisión" si han pasado 12
 *  meses (365 días) desde la última visita. */
const UMBRAL_DIAS = 365;

/** Umbral de kilometraje: se considera que "toca revisión" si se estima
 *  que el vehículo ha recorrido 15.000 km desde la última visita. */
const UMBRAL_KM = 15000;

/** Kilometraje anual ASUMIDO — usado como valor de RESPALDO cuando un
 *  vehículo todavía no tiene suficiente historial propio (batch 23: antes
 *  era el único criterio, ahora solo se usa si hay menos de 2 lecturas
 *  reales de kilometraje). La app no tiene forma de conocer el kilometraje
 *  actual real (no hay ningún dispositivo conectado al coche), así que se
 *  sigue estimando de forma lineal — a partir del ritmo real del vehículo
 *  cuando se conoce, o de este valor genérico si no. Es una aproximación,
 *  no un dato exacto — se muestra siempre junto con el criterio de tiempo
 *  para que quede claro. */
const KM_ANUALES_ESTIMADOS = 15000;

/** Igual que `KM_ANUALES_ESTIMADOS` pero para motos (batch 24): el
 *  kilometraje medio real de un motorista en España es mucho menor que el
 *  de un coche — ~6.000 km/año según el estudio de ANESDOR/motos.net
 *  (https://www.coches.net/blog-profesionales/mas-de-23-km-diarios-y-6-000-km-al-ano-trayecto-medio-de-los-conductores-de-moto/).
 *  Usar el mismo valor que coche (15.000) haría que casi ninguna moto
 *  llegara nunca al umbral de km, dejando el aviso inútil para ese caso. */
const KM_ANUALES_ESTIMADOS_MOTO = 6000;

/** Igual que `UMBRAL_KM` pero para motos (batch 24) — mismo criterio y
 *  misma fuente que `KM_ANUALES_ESTIMADOS_MOTO`. */
const UMBRAL_KM_MOTO = 6000;

/** Nº mínimo de lecturas reales de kilometraje (de distintas visitas) para
 *  calcular un ritmo propio del vehículo en vez de usar `KM_ANUALES_ESTIMADOS`. */
const MIN_LECTURAS_PARA_HISTORIAL_REAL = 2;

/** Separación mínima (en horas) entre la primera y la última lectura para
 *  fiarse del ritmo que sale de dividir km entre tiempo — evita un
 *  resultado disparatado (ritmo "infinito") si dos entradas quedaran
 *  registradas casi en el mismo instante (p. ej. un doble envío accidental
 *  del formulario). NO exige que las lecturas sean de días distintos: dos
 *  visitas el mismo día, separadas por unas horas, son una señal real (un
 *  vehículo de flota puede hacer miles de km en un solo día) y deben
 *  contar igual que si estuvieran en fechas distintas. */
const HORAS_MINIMAS_ENTRE_LECTURAS = 1;

interface FilaOrden {
  vehiculo_id: string;
  fecha_entrada: string | null;
  estado: EstadoOrden;
  vehiculos: {
    matricula: string;
    tipo_vehiculo: TipoVehiculo;
    marca: string | null;
    modelo: string | null;
    // Aviso anual (batch 19, parte 3) — aceptado por el cliente junto a la
    // firma de salida en una entrega anterior (ver CheckoutForm.tsx).
    aviso_anual_aceptado: boolean;
    clientes: { nombre: string; telefono: string } | null;
  } | null;
  inspecciones_entrada: { kilometraje: number }[] | null;
}

interface VehiculoRevision {
  vehiculoId: string;
  matricula: string;
  tipoVehiculo: TipoVehiculo;
  marca: string | null;
  modelo: string | null;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  fechaUltimaVisita: string;
  diasTranscurridos: number;
  kmUltimaVisita: number | null;
  kmEstimadoActual: number | null;
  tocaPorTiempo: boolean;
  tocaPorKm: boolean;
  avisoAnualAceptado: boolean;
  /** Ritmo anual usado para la estimación de km — el real del vehículo
   *  (batch 23) cuando hay suficiente historial, o `KM_ANUALES_ESTIMADOS`
   *  si no. */
  kmAnualUsado: number;
  /** true si `kmAnualUsado` viene del historial real de este vehículo (≥2
   *  lecturas de kilometraje en visitas distintas), false si es el valor
   *  genérico de respaldo. */
  estimacionReal: boolean;
  numLecturasHistoricas: number;
}

const SELECT_ULTIMA_VISITA =
  'vehiculo_id, fecha_entrada, estado, ' +
  'vehiculos(matricula, tipo_vehiculo, marca, modelo, aviso_anual_aceptado, clientes(nombre, telefono)), ' +
  'inspecciones_entrada(kilometraje)';

/**
 * Lista de vehículos a los que "toca revisión" — disponible para encargado
 * Y mecánico. Un vehículo se incluye si se cumple CUALQUIERA de los dos
 * criterios (tiempo O kilometraje, combinados con "o", no con "y"): han
 * pasado más de 12 meses desde su última visita, o se estima que ha
 * recorrido más de 15.000 km desde entonces (estimación por kilometraje
 * anual asumido — ver aviso en pantalla). Es solo una lista informativa,
 * NO manda ningún aviso automático al cliente (eso se hace a mano, por
 * ejemplo por WhatsApp, si se decide contactar).
 */
export default function ProximasRevisiones() {
  const [filas, setFilas] = useState<FilaOrden[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Momento en el que se cargaron los datos, para calcular "días desde la
  // última visita" — se guarda como estado (fijado en cargar(), que corre
  // en un efecto/evento, no durante el render) en vez de llamar a
  // Date.now() directamente dentro del useMemo de abajo, que sería una
  // llamada impura durante el render.
  const [cargadoEn, setCargadoEn] = useState(0);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('ordenes_trabajo')
      .select(SELECT_ULTIMA_VISITA)
      .not('fecha_entrada', 'is', null)
      .neq('estado', 'cancelado')
      .order('fecha_entrada', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setFilas((data ?? []) as unknown as FilaOrden[]);
    }
    setCargadoEn(Date.now());
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  // Historial real de kilometraje por vehículo (batch 23): `filas` ya trae
  // TODAS las órdenes con fecha de entrada (no solo la última de cada
  // vehículo, eso se filtra más abajo), así que el ritmo real de cada
  // vehículo sale gratis de los mismos datos que ya se estaban pidiendo —
  // no hace falta ninguna consulta nueva a Supabase.
  const historialKmPorVehiculo = useMemo(() => {
    const mapa = new Map<string, { fecha: number; km: number }[]>();
    for (const fila of filas) {
      const km = fila.inspecciones_entrada?.[0]?.kilometraje;
      if (!fila.vehiculo_id || !fila.fecha_entrada || km == null) continue;
      const lista = mapa.get(fila.vehiculo_id) ?? [];
      lista.push({ fecha: new Date(fila.fecha_entrada).getTime(), km });
      mapa.set(fila.vehiculo_id, lista);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.fecha - b.fecha);
    return mapa;
  }, [filas]);

  /** Ritmo anual (km/año) de un vehículo a partir de su historial real:
   *  compara la primera y la última lectura conocidas. Si hay menos de 2
   *  lecturas, están separadas por menos de `HORAS_MINIMAS_ENTRE_LECTURAS`,
   *  o el kilometraje "baja" entre ellas (error de tecleo), se usa el
   *  valor genérico de respaldo en su lugar. */
  const ritmoAnualVehiculo = useCallback((vehiculoId: string, tipoVehiculo: TipoVehiculo): { kmAnual: number; real: boolean; numLecturas: number } => {
    const historial = historialKmPorVehiculo.get(vehiculoId) ?? [];
    if (historial.length >= MIN_LECTURAS_PARA_HISTORIAL_REAL) {
      const primera = historial[0];
      const ultima = historial[historial.length - 1];
      const dias = (ultima.fecha - primera.fecha) / (1000 * 60 * 60 * 24);
      const km = ultima.km - primera.km;
      if (dias * 24 >= HORAS_MINIMAS_ENTRE_LECTURAS && km >= 0) {
        return { kmAnual: Math.round((km * 365) / dias), real: true, numLecturas: historial.length };
      }
    }
    const generico = tipoVehiculo === 'moto' ? KM_ANUALES_ESTIMADOS_MOTO : KM_ANUALES_ESTIMADOS;
    return { kmAnual: generico, real: false, numLecturas: historial.length };
  }, [historialKmPorVehiculo]);

  const vehiculos = useMemo(() => {
    // "Última visita por vehículo": como las filas ya vienen ordenadas por
    // fecha_entrada descendente, la primera fila que se ve de cada
    // vehiculo_id es su visita más reciente — Supabase/PostgREST no tiene
    // una forma directa de pedir "la última fila por grupo", así que se
    // reduce aquí en JS.
    const vistos = new Set<string>();
    const resultado: VehiculoRevision[] = [];
    const ahora = cargadoEn;

    for (const fila of filas) {
      if (!fila.vehiculo_id || !fila.fecha_entrada || vistos.has(fila.vehiculo_id)) continue;
      vistos.add(fila.vehiculo_id);

      const tipoVehiculo: TipoVehiculo = fila.vehiculos?.tipo_vehiculo ?? 'coche';
      const fechaVisita = new Date(fila.fecha_entrada).getTime();
      const diasTranscurridos = Math.floor((ahora - fechaVisita) / (1000 * 60 * 60 * 24));
      const kmUltimaVisita = fila.inspecciones_entrada?.[0]?.kilometraje ?? null;
      const { kmAnual, real, numLecturas } = ritmoAnualVehiculo(fila.vehiculo_id, tipoVehiculo);
      const kmEstimadoRecorridos = Math.round((kmAnual * diasTranscurridos) / 365);
      const kmEstimadoActual = kmUltimaVisita !== null ? kmUltimaVisita + kmEstimadoRecorridos : null;

      const umbralKm = tipoVehiculo === 'moto' ? UMBRAL_KM_MOTO : UMBRAL_KM;
      const tocaPorTiempo = diasTranscurridos >= UMBRAL_DIAS;
      const tocaPorKm = kmEstimadoRecorridos >= umbralKm;

      if (!tocaPorTiempo && !tocaPorKm) continue;

      resultado.push({
        vehiculoId: fila.vehiculo_id,
        matricula: fila.vehiculos?.matricula ?? '—',
        tipoVehiculo,
        marca: fila.vehiculos?.marca ?? null,
        modelo: fila.vehiculos?.modelo ?? null,
        clienteNombre: fila.vehiculos?.clientes?.nombre ?? null,
        clienteTelefono: fila.vehiculos?.clientes?.telefono ?? null,
        fechaUltimaVisita: fila.fecha_entrada,
        diasTranscurridos,
        kmUltimaVisita,
        kmEstimadoActual,
        tocaPorTiempo,
        tocaPorKm,
        avisoAnualAceptado: fila.vehiculos?.aviso_anual_aceptado ?? false,
        kmAnualUsado: kmAnual,
        estimacionReal: real,
        numLecturasHistoricas: numLecturas,
      });
    }

    // Los más "atrasados" primero (más días desde la última visita).
    return resultado.sort((a, b) => b.diasTranscurridos - a.diasTranscurridos);
  }, [filas, cargadoEn, ritmoAnualVehiculo]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Próximas revisiones</h1>
            <p className="text-sm text-gray-500">Vehículos a los que probablemente toca una revisión.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </header>

      <div className="mb-6 flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
        <Info className="h-4 w-4 shrink-0" />
        <p>
          Un vehículo aparece aquí si han pasado más de 12 meses desde su última visita, O si se
          estima que ha recorrido más de {UMBRAL_KM.toLocaleString('es-ES')} km (coches) /{' '}
          {UMBRAL_KM_MOTO.toLocaleString('es-ES')} km (motos) desde entonces. Esa estimación usa el
          RITMO REAL del propio vehículo (calculado con sus lecturas de kilometraje de visitas
          anteriores) cuando ya tiene al menos {MIN_LECTURAS_PARA_HISTORIAL_REAL} visitas con
          kilometraje registrado; si todavía no hay suficiente historial, se asume un valor
          genérico de {KM_ANUALES_ESTIMADOS.toLocaleString('es-ES')} km/año (coches) o{' '}
          {KM_ANUALES_ESTIMADOS_MOTO.toLocaleString('es-ES')} km/año (motos). En cualquier caso es
          una ESTIMACIÓN, no un dato real — la app no puede conocer el kilometraje actual de un
          vehículo que no está en el taller.
        </p>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
        </p>
      ) : vehiculos.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          Ningún vehículo con visitas registradas parece necesitar revisión ahora mismo.
        </p>
      ) : (
        <div className="space-y-3">
          {vehiculos.map((v) => (
            <div key={v.vehiculoId} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-gray-900">
                  {v.tipoVehiculo === 'moto' ? (
                    <Bike className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Car className="h-4 w-4 text-gray-400" />
                  )}{' '}
                  {v.matricula}
                  <span className="text-sm font-normal text-gray-500">
                    {[v.marca, v.modelo].filter(Boolean).join(' ')}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {v.tocaPorTiempo && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Por tiempo
                    </span>
                  )}
                  {v.tocaPorKm && (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                      Por km
                    </span>
                  )}
                  {v.avisoAnualAceptado && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      Aviso anual activado
                    </span>
                  )}
                </div>
              </div>

              {v.clienteNombre && (
                <p className="mt-1.5 text-sm text-gray-600">{v.clienteNombre}</p>
              )}
              {v.clienteTelefono && (
                <p className="flex items-center gap-1 text-xs text-gray-400">
                  <Phone className="h-3 w-3" /> {v.clienteTelefono}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Última visita: {new Date(v.fechaUltimaVisita).toLocaleDateString('es-ES')} (
                  {v.diasTranscurridos} días)
                </span>
                {v.kmUltimaVisita !== null && (
                  <span className="flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5" />
                    {v.kmUltimaVisita.toLocaleString('es-ES')} km al entrar
                    {v.kmEstimadoActual !== null &&
                      ` · ~${v.kmEstimadoActual.toLocaleString('es-ES')} km estimados ahora`}
                    {v.estimacionReal ? (
                      <span
                        className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                        title={`Calculado con ${v.numLecturasHistoricas} visitas anteriores de este vehículo`}
                      >
                        ~{v.kmAnualUsado.toLocaleString('es-ES')} km/año reales
                      </span>
                    ) : (
                      <span className="ml-1 text-gray-400">(estimación genérica, sin historial suficiente)</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
