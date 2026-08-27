import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Lock, Mail, User, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ClientAuthScreenProps {
  /** Vuelve a la pantalla de acceso del personal del taller. */
  onVolverPersonal: () => void;
}

/**
 * Acceso del Portal de cliente: un cliente se crea su propia cuenta al
 * momento (nombre + email + contraseña) para poder pedir cita/servicio sin
 * llamar por teléfono ni pasar por el mecánico. Es una cuenta de Supabase
 * Auth como la del personal, pero con rol 'cliente' (ver tabla `perfiles`)
 * — así que solo puede ver y gestionar sus propias solicitudes, nunca los
 * datos de otros clientes ni el inventario del taller.
 *
 * IMPORTANTE: si el proyecto de Supabase tiene activada la confirmación de
 * email (ajuste por defecto), el registro no deja sesión iniciada al
 * momento — el cliente tiene que confirmar su email antes de poder entrar.
 * Para que sea instantáneo ("se le genera la cuenta en el momento", como
 * pidió el usuario), hay que desactivar "Confirm email" en Authentication →
 * Providers → Email del dashboard de Supabase (ver README).
 */
export default function ClientAuthScreen({ onVolverPersonal }: ClientAuthScreenProps) {
  const [modo, setModo] = useState<'login' | 'registro'>('registro');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // "¿Olvidaste tu contraseña?" — igual que en LoginScreen: el enlace del
  // email de restablecimiento vuelve a la app y dispara 'PASSWORD_RECOVERY'.
  const [modoOlvido, setModoOlvido] = useState(false);
  const [emailOlvido, setEmailOlvido] = useState('');
  const [enviandoOlvido, setEnviandoOlvido] = useState(false);
  const [avisoOlvido, setAvisoOlvido] = useState<string | null>(null);
  const [errorOlvido, setErrorOlvido] = useState<string | null>(null);

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setCargando(true);

    if (modo === 'registro') {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: nombre } },
      });
      setCargando(false);
      if (authError) {
        setError(authError.message);
        return;
      }
      if (!data.session) {
        setAviso(
          'Cuenta creada. Revisa tu email para confirmarla antes de poder entrar (te hemos ' +
            'enviado un enlace de confirmación).',
        );
      }
      // Si sí hay sesión, App.tsx reacciona solo (onAuthStateChange) y pasa
      // directamente al portal — no hace falta hacer nada más aquí.
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      setCargando(false);
      if (authError) {
        setError('Email o contraseña incorrectos.');
      }
    }
  };

  if (modoOlvido) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-500 px-4">
        <form
          onSubmit={handleOlvido}
          className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-xl"
        >
          <div className="flex flex-col items-center text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <Lock className="h-6 w-6" />
            </span>
            <h1 className="text-lg font-bold text-gray-900">Restablecer contraseña</h1>
            <p className="text-sm text-gray-500">Te enviaremos un enlace por email.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="cliente-olvido-email" className="text-sm font-medium text-gray-700">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="cliente-olvido-email"
                type="email"
                required
                autoComplete="username"
                value={emailOlvido}
                onChange={(e) => setEmailOlvido(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60"
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
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-500 px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <Wrench className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-bold text-gray-900">Portal de cliente</h1>
          <p className="text-sm text-gray-500">
            {modo === 'registro'
              ? 'Crea tu cuenta para pedir cita sin llamar por teléfono.'
              : 'Entra en tu cuenta para ver o pedir una cita.'}
          </p>
        </div>

        <div className="flex overflow-hidden rounded-full border border-gray-200">
          <button
            type="button"
            onClick={() => setModo('registro')}
            className={`flex-1 py-1.5 text-sm font-medium transition ${
              modo === 'registro' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Crear cuenta
          </button>
          <button
            type="button"
            onClick={() => setModo('login')}
            className={`flex-1 py-1.5 text-sm font-medium transition ${
              modo === 'login' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Ya tengo cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {modo === 'registro' && (
            <div className="space-y-1">
              <label htmlFor="cliente-nombre" className="text-sm font-medium text-gray-700">
                Nombre
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="cliente-nombre"
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="cliente-email" className="text-sm font-medium text-gray-700">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="cliente-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="cliente-password" className="text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="cliente-password"
                type="password"
                required
                minLength={6}
                autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {aviso && <p className="text-sm text-emerald-700">{aviso}</p>}

          <button
            type="submit"
            disabled={cargando}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60"
          >
            {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
            {cargando ? 'Un momento...' : modo === 'registro' ? 'Crear cuenta' : 'Entrar'}
          </button>
        </form>

        {modo === 'login' && (
          <button
            type="button"
            onClick={() => setModoOlvido(true)}
            className="w-full text-center text-xs font-medium text-gray-400 hover:text-gray-600"
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}

        <button
          type="button"
          onClick={onVolverPersonal}
          className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Soy del personal del taller
        </button>
      </div>
    </div>
  );
}
