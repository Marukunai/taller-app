import { useRef, useState } from 'react';
import * as SignatureCanvasModule from 'react-signature-canvas';
import type SignatureCanvasType from 'react-signature-canvas';
import { Eraser, Loader2, PenLine, X } from 'lucide-react';
import { supabase, BUCKETS } from '../lib/supabase';

// react-signature-canvas se distribuye como un bundle UMD que, al pasar por el
// interop CJS→ESM de Vite/Rolldown, puede quedar envuelto en uno o dos niveles
// de `{ default: ... }` en vez de exponer la clase directamente (el bundle
// original ya trae un `default` interno más el que añade el propio bundler).
// Desenvolvemos hasta encontrar la función/clase real.
function resolveDefaultExport(mod: unknown): typeof SignatureCanvasType {
  let candidate = mod;
  while (
    candidate &&
    typeof candidate !== 'function' &&
    typeof candidate === 'object' &&
    'default' in candidate
  ) {
    candidate = (candidate as { default: unknown }).default;
  }
  return candidate as typeof SignatureCanvasType;
}

const SignatureCanvas = resolveDefaultExport(SignatureCanvasModule);

export type TipoClausula = 'entrada' | 'salida';

const CLAUSULA_ENTRADA =
  'El cliente autoriza las pruebas en carretera necesarias y declara que los daños ' +
  'reflejados en este documento corresponden al estado actual del vehículo al ser ' +
  'depositado en el taller.';

const CLAUSULA_SALIDA =
  'El cliente declara recibir el vehículo en estado de conformidad tras el servicio ' +
  'realizado. A partir de la firma de este documento, cesa la custodia legal del ' +
  'taller sobre el vehículo.';

const TEXTO_RGPD =
  'Autorizo el tratamiento de mis datos personales y el envío de copias de informes ' +
  'y facturas vía WhatsApp o correo electrónico.';

interface SignatureModalProps {
  open: boolean;
  tipo: TipoClausula;
  /** Identificador (matrícula, orden, etc.) usado para nombrar el archivo en Storage. */
  referencia: string;
  onClose: () => void;
  /** Se llama con la URL pública del PNG ya subido al bucket 'firmas'. */
  onSaved: (url: string) => void;
}

export default function SignatureModal({
  open,
  tipo,
  referencia,
  onClose,
  onSaved,
}: SignatureModalProps) {
  const sigCanvasRef = useRef<SignatureCanvasType>(null);
  const [aceptaRgpd, setAceptaRgpd] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const clausula = tipo === 'entrada' ? CLAUSULA_ENTRADA : CLAUSULA_SALIDA;

  const limpiarFirma = () => {
    sigCanvasRef.current?.clear();
    setError(null);
  };

  const handleGuardar = async () => {
    setError(null);

    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      setError('Por favor, firma en el recuadro antes de continuar.');
      return;
    }
    if (!aceptaRgpd) {
      setError('Debes aceptar el tratamiento de datos personales para continuar.');
      return;
    }

    setGuardando(true);
    try {
      // Recorta el lienzo al área firmada y exporta como PNG transparente.
      const canvas = sigCanvasRef.current.getTrimmedCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();

      const nombreArchivo = `${referencia}-${tipo}-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKETS.firmas)
        .upload(nombreArchivo, blob, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKETS.firmas).getPublicUrl(nombreArchivo);

      onSaved(publicUrl);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la firma.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <PenLine className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-semibold text-gray-900">
              Firma del cliente · {tipo === 'entrada' ? 'Recepción del vehículo' : 'Entrega del vehículo'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{clausula}</p>

        <div className="overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-white">
          <SignatureCanvas
            ref={sigCanvasRef}
            penColor="black"
            canvasProps={{
              className: 'w-full h-48 touch-none',
              style: { width: '100%', height: '12rem' },
            }}
            backgroundColor="rgba(0,0,0,0)"
          />
        </div>

        <button
          type="button"
          onClick={limpiarFirma}
          className="mt-2 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <Eraser className="h-4 w-4" /> Borrar y repetir firma
        </button>

        <label className="mt-4 flex items-start gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={aceptaRgpd}
            onChange={(e) => setAceptaRgpd(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>{TEXTO_RGPD}</span>
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardando}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-indigo-700 hover:to-blue-700 disabled:opacity-60"
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {guardando ? 'Guardando...' : 'Confirmar firma'}
          </button>
        </div>
      </div>
    </div>
  );
}
