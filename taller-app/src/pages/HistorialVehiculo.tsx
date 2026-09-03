import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Car, ClipboardList, ExternalLink, Gauge, Loader2, Search, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { EstadoOrden, TipoServicio } from '../lib/types';

interface OrdenHistorial {
  id: string;
  estado: EstadoOrden;
  tipo_servicio: TipoServicio;
  descripcion_averia: string | null;
  fecha_entrada: string | null;
  fecha_entrega: string | null;
  motivo_cancelacion: string | null;
  pdf_salida_url: string | null;
  inspecciones_entrada: { kilometraje: number; pdf_informe_url: string | null }[] | null;
}

interface VehiculoEncontrado {
  id: string;
  matricula: string;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  clientes: { nombre: string; telefono: string; email: string | null } | null;
}

const ETIQUETAS_ESTADO: Record<EstadoOrden, string> = {
  solicitado: 'Solicitado',
  recepcionado: 'Recepcionado',
  en_proceso: 'En proceso',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const ETIQUETAS_SERVICIO: Record<TipoServicio, string> = {
  mantenimiento: 'Mantenimiento',
  neumaticos: 'Neumáticos',
  averia: 'Avería',
  pre_itv: 'Pre ITV',
};

const SELECT_ORDENES_HISTORIAL =
  'id, estado, tipo_servicio, descripcion_averia, fecha_entrada, fecha_entrega, motivo_cancelacion, ' +
  'pdf_salida_url, inspecciones_entrada(kilometraje, pdf_informe_url)';

/** Nº mínimo de lecturas de kilometraje (de visitas distintas) para poder
 *  calcular un ritmo medio real de este vehículo — igual criterio que en
 *  ProximasRevisiones.tsx (batch 23), aunque aquí es solo informativo. */
const MIN_LECTURAS_PARA_RITMO_REAL = 2;

/** Separación mínima (en horas) entre la primera y la última lectura para
 *  fiarse del ritmo — igual criterio y mismo motivo que en
 *  ProximasRevisiones.tsx: solo evita un ritmo "infinito" por dos lecturas
 *  casi simultáneas, no exige que sean de días distintos. */
const HORAS_MINIMAS_ENTRE_LECTURAS = 1;

interface HistorialVehiculoProps {
  /** Matrícula a buscar automáticamente al montar — se rellena desde el
   *  Buscador global de la barra de navegación (ver BuscadorGlobal.tsx),
   *  para no tener que volver a teclear lo que ya se buscó allí. */
  matriculaInicial?: string | null;
}

/**
 * Historial de un vehículo por matrícula — disponible para encargado Y
 * mecánico (a diferencia de Inventario/Gestión de personal): busca el
 * vehículo por matrícula y lista TODAS sus órdenes de trabajo pasadas
 * (incluidas las canceladas), con enlaces a los informes PDF de entrada y
 * salida de cada una, para no tener que ir orden por orden en el Panel de
 * gestión cuando un cliente pregunta "¿qué le hicisteis la última vez?".
 */
export default function HistorialVehiculo({ matriculaInicial }: HistorialVehiculoProps) {
  const [matricula, setMatricula] = useState(matriculaInicial ?? '');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehiculo, setVehiculo] = useState<VehiculoEncontrado | null>(null);
  const [ordenes, setOrdenes] = useState<OrdenHistorial[]>([]);
  const [buscado, setBuscado] = useState(false);

  const buscar = async (q: string) => {
    if (!q) return;

    setBuscando(true);
    setError(null);
    setBuscado(true);
    setVehiculo(null);
    setOrdenes([]);

    const { data: vehiculos, error: vehError } = await supabase
      .from('vehiculos')
      .select('id, matricula, marca, modelo, color, clientes(nombre, telefono, email)')
      .ilike('matricula', `%${q}%`)
      .limit(1);

    if (vehError) {
      setError(vehError.message);
      setBuscando(false);
      return;
    }

    const encontrado = (vehiculos?.[0] ?? null) as unknown as VehiculoEncontrado | null;
    if (!encontrado) {
      setBuscando(false);
      return;
    }
    setVehiculo(encontrado);

    const { data: ordenesData, error: ordenesError } = await supabase
      .from('ordenes_trabajo')
      .select(SELECT_ORDENES_HISTORIAL)
      .eq('vehiculo_id', encontrado.id)
      .order('fecha_entrada', { ascending: false });

    setBuscando(false);
    if (ordenesError) {
      setError(ordenesError.message);
      return;
    }
    setOrdenes((ordenesData ?? []) as unknown as OrdenHistorial[]);
  };

  const handleBuscar = (e: FormEvent) => {
    e.preventDefault();
    void buscar(matricula.trim());
  };

  // Ritmo medio real de este vehículo (batch 23) — mismo cálculo que
  // `ritmoAnualVehiculo` en ProximasRevisiones.tsx (primera y última
  // lectura de kilometraje conocidas), pero aquí es puramente informativo:
  // no decide si "toca revisión", solo se muestra como dato de contexto ya
  // que esta pantalla es la que junta todo el historial de un vehículo.
  const ritmoKmReal = useMemo(() => {
    const lecturas = ordenes
      .filter((o): o is OrdenHistorial & { fecha_entrada: string } => Boolean(o.fecha_entrada && o.inspecciones_entrada?.[0]))
      .map((o) => ({ fecha: new Date(o.fecha_entrada).getTime(), km: o.inspecciones_entrada![0].kilometraje }))
      .sort((a, b) => a.fecha - b.fecha);
    if (lecturas.length < MIN_LECTURAS_PARA_RITMO_REAL) return null;
    const primera = lecturas[0];
    const ultima = lecturas[lecturas.length - 1];
    const dias = (ultima.fecha - primera.fecha) / (1000 * 60 * 60 * 24);
    const km = ultima.km - primera.km;
    if (dias * 24 < HORAS_MINIMAS_ENTRE_LECTURAS || km < 0) return null;
    return {
      kmAnual: Math.round((km * 365) / dias),
      dias: Math.round(dias),
      numLecturas: lecturas.length,
    };
  }, [ordenes]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (matriculaInicial) void buscar(matriculaInicial.trim());
    // Solo al montar (o si cambia la matrícula prellenada desde el
    // Buscador global) — no en cada tecleo del propio campo de búsqueda.
  }, [matriculaInicial]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historial de vehículo</h1>
          <p className="text-sm text-gray-500">Busca por matrícula para ver todo su historial de visitas.</p>
        </div>
      </header>

      <form onSubmit={handleBuscar} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            placeholder="Ej. 1234BBB"
            className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm uppercase shadow-sm"
          />
        </div>
        <button
          type="submit"
          disabled={buscando || !matricula.trim()}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {buscando && <Loader2 className="h-4 w-4 animate-spin" />}
          Buscar
        </button>
      </form>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {buscado && !buscando && !vehiculo && !error && (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          No se ha encontrado ningún vehículo con esa matrícula.
        </p>
      )}

      {vehiculo && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Car className="h-4 w-4 text-gray-400" /> {vehiculo.matricula}
            </div>
            <p className="text-sm text-gray-500">
              {[vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ') || 'Sin marca/modelo'}
              {vehiculo.color ? ` · ${vehiculo.color}` : ''}
            </p>
            {vehiculo.clientes && (
              <p className="mt-1 text-sm text-gray-600">
                {vehiculo.clientes.nombre}
                {vehiculo.clientes.telefono ? ` · ${vehiculo.clientes.telefono}` : ''}
              </p>
            )}
          </div>

          {ritmoKmReal && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <TrendingUp className="h-4 w-4 shrink-0" />
              <p>
                Ritmo medio real: ~{ritmoKmReal.kmAnual.toLocaleString('es-ES')} km/año (calculado con{' '}
                {ritmoKmReal.numLecturas} visitas en {ritmoKmReal.dias} días).
              </p>
            </div>
          )}

          {ordenes.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
              Este vehículo todavía no tiene ninguna orden de trabajo registrada.
            </p>
          ) : (
            <div className="space-y-3">
              {ordenes.map((orden) => (
                <div key={orden.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                        {ETIQUETAS_ESTADO[orden.estado]}
                      </span>
                      <span className="text-sm font-medium text-blue-600">
                        {ETIQUETAS_SERVICIO[orden.tipo_servicio]}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {orden.fecha_entrada ? new Date(orden.fecha_entrada).toLocaleDateString('es-ES') : '—'}
                    </span>
                  </div>

                  {orden.descripcion_averia && (
                    <p className="mt-2 text-sm text-gray-600">{orden.descripcion_averia}</p>
                  )}
                  {orden.motivo_cancelacion && (
                    <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                      Cancelada: {orden.motivo_cancelacion}
                    </p>
                  )}
                  {orden.inspecciones_entrada?.[0] && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                      <Gauge className="h-3.5 w-3.5" />
                      {orden.inspecciones_entrada[0].kilometraje.toLocaleString('es-ES')} km al entrar
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-3">
                    {orden.inspecciones_entrada?.[0]?.pdf_informe_url && (
                      <a
                        href={orden.inspecciones_entrada[0].pdf_informe_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                      >
                        Informe de entrada <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {orden.pdf_salida_url && (
                      <a
                        href={orden.pdf_salida_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                      >
                        Informe de salida <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
