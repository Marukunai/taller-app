import { useEffect, useRef, useState } from 'react';
import { Bike, Car, Loader2, Search, User, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TipoVehiculo } from '../lib/types';

interface ResultadoBusqueda {
  matricula: string;
  descripcion: string;
  tipoVehiculo: TipoVehiculo;
}

interface BuscadorGlobalProps {
  /** Al elegir un resultado, lleva a la pestaña de Historial con esa
   *  matrícula ya buscada — ver App.tsx. */
  onSeleccionar: (matricula: string) => void;
}

/**
 * Buscador global de la barra de navegación: busca por matrícula, nombre de
 * cliente o DNI a la vez (dos consultas en paralelo, sin vista SQL nueva) y
 * lleva al Historial del vehículo encontrado. Pensado para "¿de quién es
 * este coche?" o "¿qué vehículos tiene Juan Pérez?" sin cambiar de pestaña
 * primero. Disponible para cualquier personal (no expone precios).
 */
export default function BuscadorGlobal({ onSeleccionar }: BuscadorGlobalProps) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResultados([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const temporizador = setTimeout(async () => {
      const [vehiculosRes, clientesRes] = await Promise.all([
        supabase
          .from('vehiculos')
          .select('matricula, tipo_vehiculo, marca, modelo, clientes(nombre)')
          .ilike('matricula', `%${texto}%`)
          .limit(5),
        supabase
          .from('clientes')
          .select('nombre, dni, vehiculos(matricula, tipo_vehiculo, marca, modelo)')
          .or(`nombre.ilike.%${texto}%,dni.ilike.%${texto}%`)
          .limit(5),
      ]);
      if (cancelado) return;

      const deVehiculos: ResultadoBusqueda[] = (vehiculosRes.data ?? []).map((v) => {
        const veh = v as unknown as {
          matricula: string;
          tipo_vehiculo: TipoVehiculo;
          marca: string | null;
          modelo: string | null;
          clientes: { nombre: string } | null;
        };
        return {
          matricula: veh.matricula,
          tipoVehiculo: veh.tipo_vehiculo,
          descripcion: `${[veh.marca, veh.modelo].filter(Boolean).join(' ') || 'Sin marca/modelo'} · ${
            veh.clientes?.nombre ?? 'Sin cliente'
          }`,
        };
      });

      const deClientes: ResultadoBusqueda[] = (clientesRes.data ?? []).flatMap((c) => {
        const cli = c as unknown as {
          nombre: string;
          vehiculos: { matricula: string; tipo_vehiculo: TipoVehiculo; marca: string | null; modelo: string | null }[] | null;
        };
        return (cli.vehiculos ?? []).map((v) => ({
          matricula: v.matricula,
          tipoVehiculo: v.tipo_vehiculo,
          descripcion: `${[v.marca, v.modelo].filter(Boolean).join(' ') || 'Sin marca/modelo'} · ${cli.nombre}`,
        }));
      });

      const combinados = [...deVehiculos, ...deClientes];
      const vistos = new Set<string>();
      const dedupe = combinados.filter((r) => {
        if (vistos.has(r.matricula)) return false;
        vistos.add(r.matricula);
        return true;
      });

      setResultados(dedupe.slice(0, 6));
      setBuscando(false);
      setAbierto(true);
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [q]);

  useEffect(() => {
    const handleClickFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  const elegir = (matricula: string) => {
    onSeleccionar(matricula);
    setQ('');
    setResultados([]);
    setAbierto(false);
  };

  return (
    <div ref={contenedorRef} className="relative w-full max-w-[220px]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/60" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => resultados.length > 0 && setAbierto(true)}
          placeholder="Buscar matrícula, cliente..."
          className="w-full rounded-full border border-white/20 bg-white/10 py-1.5 pl-8 pr-7 text-xs text-white placeholder-white/60 focus:bg-white/20 focus:outline-none"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              setResultados([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {abierto && q.trim().length >= 2 && (
        <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
          {buscando ? (
            <p className="flex items-center gap-2 px-2 py-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
            </p>
          ) : resultados.length === 0 ? (
            <p className="px-2 py-2 text-xs text-gray-400">Sin resultados.</p>
          ) : (
            resultados.map((r) => (
              <button
                key={r.matricula}
                type="button"
                onClick={() => elegir(r.matricula)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-gray-50"
              >
                {r.matricula.length > 3 && /\d/.test(r.matricula) ? (
                  r.tipoVehiculo === 'moto' ? (
                    <Bike className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  ) : (
                    <Car className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  )
                ) : (
                  <User className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-gray-800">{r.matricula}</span>
                  <span className="block truncate text-gray-500">{r.descripcion}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
