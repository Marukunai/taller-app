import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, ChevronDown, KeyRound, Loader2, LogOut, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { RolPerfil } from '../lib/types';

const ETIQUETAS_ROL: Record<RolPerfil, string> = {
  encargado: 'Encargado',
  mecanico: 'Mecánico',
  cliente: 'Cliente',
};

interface CuentaMenuProps {
  nombre: string;
  email: string;
  rol: RolPerfil;
  onCerrarSesion: () => void;
}

/**
 * Menú desplegable de la cuenta en la barra de navegación — antes era solo
 * el nombre en texto plano + un botón de "Cerrar sesión" al lado. Ahora
 * ambas cosas viven aquí dentro, con una función más: cambiar la propia
 * contraseña sin tener que cerrar sesión y pasar por el email de
 * restablecimiento (aquí ya hay una sesión válida, así que
 * `supabase.auth.updateUser` puede cambiarla directamente).
 */
export default function CuentaMenu({ nombre, email, rol, onCerrarSesion }: CuentaMenuProps) {
  const [abierto, setAbierto] = useState(false);
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const handleClick = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [abierto]);

  const cerrarTodo = () => {
    setAbierto(false);
    setCambiandoPassword(false);
    setPasswordNueva('');
    setPasswordConfirmar('');
    setError(null);
    setAviso(null);
  };

  const handleCambiarPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    if (passwordNueva.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (passwordNueva !== passwordConfirmar) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setGuardando(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: passwordNueva });
    setGuardando(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setAviso('Contraseña actualizada.');
    setPasswordNueva('');
    setPasswordConfirmar('');
  };

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-white/90 transition hover:bg-white/10"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
          <User className="h-3.5 w-3.5" />
        </span>
        <span className="hidden sm:inline">{nombre}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 text-gray-900 shadow-lg">
          <div className="border-b border-gray-100 pb-2.5">
            <p className="truncate font-medium">{nombre}</p>
            {email && <p className="truncate text-xs text-gray-500">{email}</p>}
            <span className="mt-1.5 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
              {ETIQUETAS_ROL[rol]}
            </span>
          </div>

          {cambiandoPassword ? (
            <form onSubmit={handleCambiarPassword} className="space-y-2.5 py-2.5">
              <div className="space-y-1">
                <label htmlFor="cuenta-password-nueva" className="text-xs font-medium text-gray-700">
                  Contraseña nueva
                </label>
                <input
                  id="cuenta-password-nueva"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={passwordNueva}
                  onChange={(e) => setPasswordNueva(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="cuenta-password-confirmar" className="text-xs font-medium text-gray-700">
                  Confirmar contraseña
                </label>
                <input
                  id="cuenta-password-confirmar"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={passwordConfirmar}
                  onChange={(e) => setPasswordConfirmar(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              {aviso && (
                <p className="flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {aviso}
                </p>
              )}
              <div className="flex gap-2 pt-0.5">
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCambiandoPassword(false);
                    setError(null);
                    setAviso(null);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCambiandoPassword(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <KeyRound className="h-4 w-4 text-gray-400" /> Cambiar mi contraseña
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              cerrarTodo();
              onCerrarSesion();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
