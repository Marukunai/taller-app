import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { DanoMarcador, TipoDano } from '../lib/types';
import { clicACanonico, detectarVista } from '../lib/motoSchemaZones';

interface MotoDamagePickerProps {
  value: DanoMarcador[];
  onChange: (danos: DanoMarcador[]) => void;
}

const TIPOS: { value: TipoDano; label: string; color: string }[] = [
  { value: 'arañazo', label: 'Arañazo', color: '#f59e0b' },
  { value: 'abolladura', label: 'Abolladura', color: '#ef4444' },
  { value: 'rotura', label: 'Rotura', color: '#8b5cf6' },
];

function colorForTipo(tipo: TipoDano): string {
  return TIPOS.find((t) => t.value === tipo)?.color ?? '#f59e0b';
}

function labelForTipo(tipo: TipoDano): string {
  return TIPOS.find((t) => t.value === tipo)?.label ?? tipo;
}

/**
 * Esquema interactivo de la moto con sus 4 vistas (lateral izquierdo,
 * lateral derecho, frontal, trasera) siempre visibles a la vez — mismo
 * criterio que CarDamagePicker.tsx (ver su cabecera para el razonamiento
 * completo). A diferencia del coche, aquí las dos vistas laterales son
 * dibujos reales de cada lado (no una sola vista con un botón manual de
 * "¿izquierda o derecha?"), así que no hace falta ese selector — el lado
 * ya lo determina en qué vista se tocó.
 */
export default function MotoDamagePicker({ value, onChange }: MotoDamagePickerProps) {
  const [tipoActivo, setTipoActivo] = useState<TipoDano>('arañazo');

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    const vista = detectarVista(xPct, yPct);
    const canonico = clicACanonico(vista, xPct, yPct);

    const nuevoDano: DanoMarcador = {
      id: crypto.randomUUID(),
      xPct,
      yPct,
      ...canonico,
      tipo: tipoActivo,
    };
    onChange([...value, nuevoDano]);
  };

  const eliminarDano = (id: string) => {
    onChange(value.filter((d) => d.id !== id));
  };

  const cambiarTipo = (id: string, tipo: TipoDano) => {
    onChange(value.map((d) => (d.id === id ? { ...d, tipo } : d)));
  };

  const cambiarObservacion = (id: string, observacion: string) => {
    onChange(value.map((d) => (d.id === id ? { ...d, observacion } : d)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTipoActivo(t.value)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              tipoActivo === t.value
                ? 'border-transparent text-white'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'
            }`}
            style={tipoActivo === t.value ? { backgroundColor: t.color } : undefined}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500">
        Toca sobre la moto, en la vista que mejor muestre el daño, para marcar uno de tipo{' '}
        <strong className="text-gray-700">{labelForTipo(tipoActivo)}</strong>. El punto se marca
        solo ahí, en esa vista.
      </p>

      <div
        onClick={handleClick}
        className="relative mx-auto aspect-[1536/898] w-full max-w-xl cursor-crosshair touch-none select-none overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
        role="img"
        aria-label="Esquema de la moto para marcar daños"
      >
        <img
          src="/moto-schema.svg"
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />

        {value.map((d) => (
          <span
            key={d.id}
            className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${d.xPct}%`, top: `${d.yPct}%`, backgroundColor: colorForTipo(d.tipo) }}
          />
        ))}
      </div>

      {value.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-gray-400">
          <Plus className="h-4 w-4" /> Sin daños marcados todavía.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {value.map((d, i) => (
            <li key={d.id} className="space-y-1.5 px-3 py-2">
              <div className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForTipo(d.tipo) }}
                />
                <span className="text-sm text-gray-400">#{i + 1}</span>
                <select
                  value={d.tipo}
                  onChange={(e) => cambiarTipo(d.id, e.target.value as TipoDano)}
                  className="flex-1 rounded-md border border-gray-200 py-1 text-sm text-gray-700"
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => eliminarDano(d.id)}
                  className="rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  aria-label="Eliminar marcador"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                value={d.observacion ?? ''}
                onChange={(e) => cambiarObservacion(d.id, e.target.value)}
                placeholder="Detalle qué está mal (opcional): ej. 'raya profunda de 5cm', 'golpe con abolladura visible'..."
                className="ml-[1.375rem] w-[calc(100%-1.375rem)] rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-700 placeholder:text-gray-400"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
