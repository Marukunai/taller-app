import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Lock, Mail, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginScreenProps {
  /** Lleva al Portal de cliente (registro/login propio de clientes), para
   *  quien quiera pedir una cita sin pasar por el mecánico. Opcional para
   *  no romper ningún otro sitio que renderice LoginScreen sin pasarlo. */
  onIrPortalCliente?: () => void;
}

/**
 * Pantalla de login del taller. Es un único acceso compartido para el
 * personal (no hay auto-registro ni multi-tenant): el usuario/contraseña se
 * crea a mano en el dashboard de Supabase (Authentication → Users → Add
 * user) y se reparte entre quien lo necesite en el taller.
 */
export default function LoginScreen({ onIrPortalCliente }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // "¿Olvidaste tu contraseña?" — un formulario aparte, más simple (solo
  // email), que dispara el email de restablecimiento de Supabase Auth. El
  // enlace de ese email lleva de vuelta a la app y dispara el evento
  // 'PASSWORD_RECOVERY' que App.tsx escucha para mostrar ResetPasswordScreen.
  const [modoOlvido, setModoOlvido] = useState(false);
  const [emailOlvido, setEmailOlvido] = useState('');
  const [enviandoOlvido, setEnviandoOlvido] = useState(false);
  const [avisoOlvido, setAvisoOlvido] = useState<string | null>(null);
  const [errorOlvido, setErrorOlvido] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    setCargando(false);
    if (authError) {
      setError('Email o contraseña incorrectos.');
    }
  };

  const handleOlvido = async (e: FormEvent) => {
    e.preventDefault();
    setErrorOlvido(null);
    setAvisoOlvido(null);
    setEnviandoOlvido(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailOlvido, {
      redirectTo: window.location.origin,
    });

    setEnviandoOlvido(false);
    if (resetError) {
      setErrorOlvido(resetError.message);
      return;
    }
    setAvisoOlvido('Si ese email tiene una cuenta, te hemos enviado un enlace para restablecer la contraseña.');
  };

  if (modoOlvido) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 px-4">
        <form
          onSubmit={handleOlvido}
          className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-xl"
        >
          <div className="flex flex-col items-center text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <Lock className="h-6 w-6" />
            </span>
            <h1 className="text-lg font-bold text-gray-900">Restablecer contraseña</h1>
            <p className="text-sm text-gray-500">Te enviaremos un enlace por email.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="olvido-email" className="text-sm font-medium text-gray-700">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="olvido-email"
                type="email"
                required
                autoComplete="username"
                value={emailOlvido}
                onChange={(e) => setEmailOlvido(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {errorOlvido && <p className="text-sm text-red-600">{errorOlvido}</p>}
          {avisoOlvido && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {avisoOlvido}
            </p>
          )}

          <button
            type="submit"
            disabled={enviandoOlvido}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-blue-700 disabled:opacity-60"
          >
            {enviandoOlvido && <Loader2 className="h-4 w-4 animate-spin" />}
            {enviandoOlvido ? 'Enviando...' : 'Enviar enlace'}
          </button>

          <button
            type="button"
            onClick={() => {
              setModoOlvido(false);
              setErrorOlvido(null);
              setAvisoOlvido(null);
            }}
            className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver al login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-xl"
      >
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <Wrench className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-bold text-gray-900">TallerGo</h1>
          <p className="text-sm text-gray-500">Inicia sesión para continuar.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="login-email" className="text-sm font-medium text-gray-700">
            Email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="login-password" className="text-sm font-medium text-gray-700">
            Contraseña
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={cargando}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-blue-700 disabled:opacity-60"
        >
          {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>

        <button
          type="button"
          onClick={() => setModoOlvido(true)}
          className="w-full text-center text-xs font-medium text-gray-400 hover:text-gray-600"
        >
          ¿Olvidaste tu contraseña?
        </button>

        {onIrPortalCliente && (
          <button
            type="button"
            onClick={onIrPortalCliente}
            className="w-full text-center text-xs font-medium text-gray-400 hover:text-gray-600"
          >
            ¿Eres cliente y quieres pedir cita? Entra aquí
          </button>
        )}
      </form>
    </div>
  );
}
