import { useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarClock, Loader2, Mail, MessageCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { buildWhatsAppLinkListo } from '../lib/whatsapp';

interface OrdenParaCita {
  id: string;
  matricula: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteEmail: string | null;
}

interface CitaRecogidaModalProps {
  open: boolean;
  orden: OrdenParaCita | null;
  onClose: () => void;
  /** Se llama en cuanto la orden pasa a "Listo" con la cita ya guardada en
   *  la base de datos, para que el Panel de gestión actualice su lista sin
   *  esperar a que se cierre el modal (el aviso por WhatsApp/email es un
   *  paso aparte, ya con la orden movida de columna). */
  onListo: (citaIso: string) => void;
}

/** Redondea la hora actual + 1 día a la próxima hora en punto, como valor
 *  inicial razonable del selector de fecha/hora (evita mandar por defecto
 *  una hora ya pasada). */
function valorInicialCita(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Al marcar una orden como "Listo", concierta con el cliente una cita de
 * recogida (día/hora) y ofrece avisarle por WhatsApp (enlace prellenado,
 * gratis, como el resto de la app) o por email automático de verdad (vía
 * una función de Supabase Edge Function + Resend — hace falta desplegarla
 * aparte, ver README; si no está desplegada, el botón de WhatsApp sigue
 * funcionando igual).
 */
export default function CitaRecogidaModal({ open, orden, onClose, onListo }: CitaRecogidaModalProps) {
  const [paso, setPaso] = useState<'elegir' | 'aviso'>('elegir');
  const [citaInput, setCitaInput] = useState(valorInicialCita());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [citaConfirmada, setCitaConfirmada] = useState<Date | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailResultado, setEmailResultado] = useState<string | null>(null);

  if (!open || !orden) return null;

  const cerrarYResetear = () => {
    setPaso('elegir');
    setCitaInput(valorInicialCita());
    setError(null);
    setCitaConfirmada(null);
    setEmailResultado(null);
    onClose();
  };

  const confirmarCita = async (e: FormEvent) => {
    e.preventDefault();
    if (!citaInput) {
      setError('Elige un día y una hora para la cita.');
      return;
    }
    const fecha = new Date(citaInput);
    if (Number.isNaN(fecha.getTime())) {
      setError('Fecha inválida.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({ estado: 'listo', cita_recogida: fecha.toISOString() })
      .eq('id', orden.id);
    setGuardando(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCitaConfirmada(fecha);
    onListo(fecha.toISOString());
    setPaso('aviso');
  };

  const enviarEmailAutomatico = async () => {
    if (!citaConfirmada) return;
    if (!orden.clienteEmail) {
      setEmailResultado('Este cliente no tiene email guardado — usa el enlace de WhatsApp.');
      return;
    }
    setEnviandoEmail(true);
    setEmailResultado(null);
    try {
      const { error: fnError } = await supabase.functions.invoke('enviar-aviso-cliente', {
        body: {
          email: orden.clienteEmail,
          nombreCliente: orden.clienteNombre,
          matricula: orden.matricula,
          citaIso: citaConfirmada.toISOString(),
        },
      });
      if (fnError) throw fnError;
      setEmailResultado('Email enviado correctamente.');
    } catch {
      setEmailResultado(
        'No se pudo enviar el email automático (puede que la función todavía no esté ' +
          'desplegada en tu proyecto de Supabase — ver README, sección de avisos al cliente). ' +
          'Mientras tanto, usa el enlace de WhatsApp.',
      );
    } finally {
      setEnviandoEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Vehículo listo</h2>
              <p className="text-xs text-gray-500">
                {orden.matricula} · {orden.clienteNombre}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrarYResetear}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {paso === 'elegir' ? (
          <form onSubmit={confirmarCita} className="space-y-4">
            <p className="text-sm text-gray-500">
              Concierta con el cliente día y hora para recoger el vehículo.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cita de recogida</label>
              <input
                type="datetime-local"
                value={citaInput}
                onChange={(e) => setCitaInput(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={guardando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {guardando ? 'Guardando...' : 'Confirmar cita y marcar como Listo'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Cita guardada: {citaConfirmada?.toLocaleDateString('es-ES')} a las{' '}
              {citaConfirmada?.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.
              Ahora avisa al cliente:
            </p>

            <a
              href={buildWhatsAppLinkListo({
                telefono: orden.clienteTelefono ?? undefined,
                nombreCliente: orden.clienteNombre,
                matricula: orden.matricula,
                fechaCita: citaConfirmada ?? new Date(),
              })}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              <MessageCircle className="h-4 w-4" /> Avisar por WhatsApp
            </a>

            <button
              type="button"
              onClick={enviarEmailAutomatico}
              disabled={enviandoEmail}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            >
              {enviandoEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {enviandoEmail ? 'Enviando...' : 'Avisar por email automático'}
            </button>
            {emailResultado && <p className="text-xs text-gray-500">{emailResultado}</p>}

            <button
              type="button"
              onClick={cerrarYResetear}
              className="w-full rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
