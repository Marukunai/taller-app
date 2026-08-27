import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, KeyRound, Loader2, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ResetPasswordScreenProps {
  /** Se llama cuando ya se ha cambiado la contraseña (o el usuario decide
   *  seguir sin cambiarla) — App.tsx vuelve entonces a su flujo normal
   *  (check-in/panel/portal, según el rol de la sesión ya iniciada). */
  onListo: () => void;
}

/**
 * Pantalla de "nueva contraseña", mostrada cuando Supabase Auth dispara el
 * evento 'PASSWORD_RECOVERY' — ocurre al pulsar el enlace de un email de
 * restablecimiento (tanto si lo pidió la propia persona desde "¿Olvidaste
 * tu contraseña?" en el login, como si se lo mandó un encargado desde
 * Gestión de personal). Es independiente del rol de la cuenta: se muestra
 * ANTES de cargar el perfil, para cualquiera que llegue con ese enlace.
 */
export default function ResetPasswordScreen({ onListo }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmacion) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setGuardando(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setGuardando(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setHecho(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <KeyRound className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-bold text-gray-900">Nueva contraseña</h1>
          <p className="text-sm text-gray-500">Elige una contraseña nueva para tu cuenta.</p>
        </div>

        {hecho ? (
          <div className="space-y-4 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Contraseña actualizada.
            </p>
            <button
              type="button"
              onClick={onListo}
              className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-blue-700"
            >
              Continuar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="nueva-password" className="text-sm font-medium text-gray-700">
                Contraseña nueva
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="nueva-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="confirmar-password" className="text-sm font-medium text-gray-700">
                Repite la contraseña
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="confirmar-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={guardando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-blue-700 disabled:opacity-60"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {guardando ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
