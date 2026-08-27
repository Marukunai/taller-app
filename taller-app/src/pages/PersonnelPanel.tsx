import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CuentaPersonal {
  id: string;
  rol: 'encargado' | 'mecanico';
  nombre: string | null;
  email: string | null;
  activo: boolean;
}

interface FormCrear {
  nombre: string;
  email: string;
  password: string;
}

interface FormEditar {
  nombre: string;
  email: string;
  rol: 'encargado' | 'mecanico';
}

const FORM_VACIO: FormCrear = { nombre: '', email: '', password: '' };

interface PersonnelPanelProps {
  /** Id de la propia cuenta (la de quien tiene la sesión abierta) — sirve
   *  para deshabilitar en la UI las acciones que un encargado no puede
   *  hacer sobre sí mismo (desactivarse, eliminarse o cambiarse el propio
   *  rol), como protección contra quedarse fuera del taller sin querer. La
   *  Edge Function vuelve a comprobar esto igualmente en el servidor, por
   *  si alguien manipulase la petición a mano. */
  miId: string;
}

/**
 * Gestión de personal — SOLO visible para un 'encargado' (ver gating en
 * App.tsx). Permite:
 *  - Crear cuentas de 'mecanico' directamente (nombre + email + contraseña,
 *    sin invitación por email).
 *  - Editar el nombre, email o rol de una cuenta existente.
 *  - Desactivar/reactivar una cuenta (bloquea el acceso sin borrar nada).
 *  - Eliminar una cuenta por completo (irreversible).
 *  - Restablecer la contraseña de cualquier cuenta, propia o ajena.
 *
 * Todo lo que necesita privilegios de administración de Supabase Auth
 * (crear, editar email, desactivar, eliminar) pasa por Edge Functions
 * (`crear-cuenta-mecanico` / `administrar-cuenta-personal`) — si no están
 * desplegadas todavía en el proyecto de Supabase, el botón correspondiente
 * falla con un aviso claro y el resto de la app sigue funcionando igual
 * (ver README).
 */
export default function PersonnelPanel({ miId }: PersonnelPanelProps) {
  const [cuentas, setCuentas] = useState<CuentaPersonal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState<FormCrear>(FORM_VACIO);
  const [creando, setCreando] = useState(false);
  const [avisoCreacion, setAvisoCreacion] = useState<string | null>(null);
  const [restableciendoId, setRestableciendoId] = useState<string | null>(null);
  const [avisoReset, setAvisoReset] = useState<Record<string, string>>({});

  // Edición inline: qué cuenta se está editando y sus valores del form.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEditar, setFormEditar] = useState<FormEditar>({ nombre: '', email: '', rol: 'mecanico' });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  // Confirmación en dos pasos para desactivar/eliminar (nunca se ejecuta
  // directamente al primer clic).
  const [confirmando, setConfirmando] = useState<{ id: string; accion: 'desactivar' | 'eliminar' } | null>(
    null,
  );
  const [procesandoAccionId, setProcesandoAccionId] = useState<string | null>(null);
  const [avisoAccion, setAvisoAccion] = useState<Record<string, string>>({});

  const cargarCuentas = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('perfiles')
      .select('id, rol, nombre, email, activo')
      .in('rol', ['encargado', 'mecanico'])
      .order('rol', { ascending: true })
      .order('nombre', { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setCuentas((data ?? []) as CuentaPersonal[]);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarCuentas();
  }, [cargarCuentas]);

  const handleCrear = async (e: FormEvent) => {
    e.preventDefault();
    setCreando(true);
    setError(null);
    setAvisoCreacion(null);

    const { data, error: invokeError } = await supabase.functions.invoke('crear-cuenta-mecanico', {
      body: { nombre: form.nombre.trim(), email: form.email.trim(), password: form.password },
    });

    setCreando(false);
    if (invokeError) {
      setError(
        `No se pudo crear la cuenta: ${invokeError.message}. Puede que la función ` +
          '"crear-cuenta-mecanico" no esté desplegada todavía en tu proyecto de Supabase (ver README).',
      );
      return;
    }
    const respuesta = data as { ok?: boolean; error?: string } | null;
    if (respuesta?.error) {
      setError(respuesta.error);
      return;
    }

    setAvisoCreacion(`Cuenta de mecánico creada para ${form.email.trim()}.`);
    setForm(FORM_VACIO);
    setFormAbierto(false);
    cargarCuentas();
  };

  const handleResetPassword = async (cuenta: CuentaPersonal) => {
    if (!cuenta.email) return;
    setRestableciendoId(cuenta.id);
    setAvisoReset((prev) => ({ ...prev, [cuenta.id]: '' }));

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cuenta.email, {
      redirectTo: window.location.origin,
    });

    setRestableciendoId(null);
    setAvisoReset((prev) => ({
      ...prev,
      [cuenta.id]: resetError
        ? `Error: ${resetError.message}`
        : `Enlace de restablecimiento enviado a ${cuenta.email}.`,
    }));
  };

  const abrirEdicion = (cuenta: CuentaPersonal) => {
    setEditandoId(cuenta.id);
    setFormEditar({ nombre: cuenta.nombre ?? '', email: cuenta.email ?? '', rol: cuenta.rol });
    setErrorEdicion(null);
    setConfirmando(null);
  };

  const handleGuardarEdicion = async (e: FormEvent) => {
    e.preventDefault();
    if (!editandoId) return;
    setGuardandoEdicion(true);
    setErrorEdicion(null);

    const cuenta = cuentas.find((c) => c.id === editandoId);
    const body: Record<string, string> = { accion: 'editar', cuenta_id: editandoId };
    if (formEditar.nombre.trim() && formEditar.nombre.trim() !== (cuenta?.nombre ?? '')) {
      body.nombre = formEditar.nombre.trim();
    }
    if (formEditar.email.trim() && formEditar.email.trim() !== (cuenta?.email ?? '')) {
      body.email = formEditar.email.trim();
    }
    // El propio rol nunca se envía si es la propia cuenta (protección
    // anti-bloqueo — ver también la comprobación en el servidor).
    if (editandoId !== miId && formEditar.rol !== cuenta?.rol) {
      body.rol = formEditar.rol;
    }

    const { data, error: invokeError } = await supabase.functions.invoke('administrar-cuenta-personal', {
      body,
    });

    setGuardandoEdicion(false);
    if (invokeError) {
      setErrorEdicion(
        `No se pudo guardar: ${invokeError.message}. Puede que la función ` +
          '"administrar-cuenta-personal" no esté desplegada todavía (ver README).',
      );
      return;
    }
    const respuesta = data as { ok?: boolean; error?: string } | null;
    if (respuesta?.error) {
      setErrorEdicion(respuesta.error);
      return;
    }

    setEditandoId(null);
    cargarCuentas();
  };

  const ejecutarAccion = async (cuenta: CuentaPersonal, accion: 'desactivar' | 'reactivar' | 'eliminar') => {
    setProcesandoAccionId(cuenta.id);
    setAvisoAccion((prev) => ({ ...prev, [cuenta.id]: '' }));
    setConfirmando(null);

    const { data, error: invokeError } = await supabase.functions.invoke('administrar-cuenta-personal', {
      body: { accion, cuenta_id: cuenta.id },
    });

    setProcesandoAccionId(null);
    if (invokeError) {
      setAvisoAccion((prev) => ({
        ...prev,
        [cuenta.id]: `Error: ${invokeError.message}. Puede que "administrar-cuenta-personal" no esté desplegada todavía.`,
      }));
      return;
    }
    const respuesta = data as { ok?: boolean; error?: string } | null;
    if (respuesta?.error) {
      setAvisoAccion((prev) => ({ ...prev, [cuenta.id]: `Error: ${respuesta.error}` }));
      return;
    }

    cargarCuentas();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de personal</h1>
            <p className="text-sm text-gray-500">Cuentas de encargado y mecánico del taller.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFormAbierto((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Crear mecánico
        </button>
      </header>

      {formAbierto && (
        <form
          onSubmit={handleCrear}
          className="mb-6 space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Nueva cuenta de mecánico</h2>
            <button
              type="button"
              onClick={() => setFormAbierto(false)}
              className="rounded-full p-1 text-gray-400 hover:bg-white hover:text-gray-600"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Un mecánico puede usar Check-in, Panel de gestión y Entrega, pero no ve Inventario ni esta
            pantalla de Gestión de personal.
          </p>

          <div className="space-y-1">
            <label htmlFor="mecanico-nombre" className="text-sm font-medium text-gray-700">
              Nombre
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="mecanico-nombre"
                required
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="mecanico-email" className="text-sm font-medium text-gray-700">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="mecanico-email"
                type="email"
                required
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="mecanico-password" className="text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="mecanico-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={creando}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {creando && <Loader2 className="h-4 w-4 animate-spin" />}
            {creando ? 'Creando...' : 'Crear cuenta'}
          </button>
        </form>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {avisoCreacion && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{avisoCreacion}</p>
      )}

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando personal...
        </p>
      ) : cuentas.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          No hay cuentas de personal todavía.
        </p>
      ) : (
        <div className="space-y-3">
          {cuentas.map((cuenta) => {
            const esMiPropiaCuenta = cuenta.id === miId;
            const editando = editandoId === cuenta.id;

            return (
              <div
                key={cuenta.id}
                className={`rounded-xl border bg-white p-4 shadow-sm ${
                  cuenta.activo ? 'border-gray-200' : 'border-red-200 bg-red-50/30'
                }`}
              >
                {editando ? (
                  <form onSubmit={handleGuardarEdicion} className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700">Nombre</label>
                        <input
                          value={formEditar.nombre}
                          onChange={(e) => setFormEditar((p) => ({ ...p, nombre: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700">Email</label>
                        <input
                          type="email"
                          value={formEditar.email}
                          onChange={(e) => setFormEditar((p) => ({ ...p, email: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">Rol</label>
                      <select
                        value={formEditar.rol}
                        disabled={esMiPropiaCuenta}
                        onChange={(e) =>
                          setFormEditar((p) => ({ ...p, rol: e.target.value as 'encargado' | 'mecanico' }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="encargado">Encargado</option>
                        <option value="mecanico">Mecánico</option>
                      </select>
                      {esMiPropiaCuenta && (
                        <p className="text-[11px] text-gray-400">
                          No puedes cambiar tu propio rol (pídeselo a otro encargado).
                        </p>
                      )}
                    </div>
                    {errorEdicion && <p className="text-xs text-red-600">{errorEdicion}</p>}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={guardandoEdicion}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {guardandoEdicion && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Guardar cambios
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoId(null)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-gray-900">
                            {cuenta.nombre || cuenta.email || 'Sin nombre'}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              cuenta.rol === 'encargado'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-sky-100 text-sky-700'
                            }`}
                          >
                            {cuenta.rol === 'encargado' ? 'Encargado' : 'Mecánico'}
                          </span>
                          {esMiPropiaCuenta && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                              Tu cuenta
                            </span>
                          )}
                          {!cuenta.activo && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                              Desactivada
                            </span>
                          )}
                        </div>
                        {cuenta.email && <p className="text-sm text-gray-500">{cuenta.email}</p>}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => abrirEdicion(cuenta)}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetPassword(cuenta)}
                          disabled={restableciendoId === cuenta.id || !cuenta.email}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                        >
                          {restableciendoId === cuenta.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <KeyRound className="h-3.5 w-3.5" />
                          )}
                          Restablecer contraseña
                        </button>
                        {cuenta.activo ? (
                          <button
                            type="button"
                            onClick={() => setConfirmando({ id: cuenta.id, accion: 'desactivar' })}
                            disabled={esMiPropiaCuenta || procesandoAccionId === cuenta.id}
                            title={esMiPropiaCuenta ? 'No puedes desactivar tu propia cuenta' : undefined}
                            className="flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Ban className="h-3.5 w-3.5" /> Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => ejecutarAccion(cuenta, 'reactivar')}
                            disabled={procesandoAccionId === cuenta.id}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                          >
                            {procesandoAccionId === cuenta.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Reactivar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmando({ id: cuenta.id, accion: 'eliminar' })}
                          disabled={esMiPropiaCuenta || procesandoAccionId === cuenta.id}
                          title={esMiPropiaCuenta ? 'No puedes eliminar tu propia cuenta' : undefined}
                          className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar
                        </button>
                      </div>
                    </div>

                    {confirmando?.id === cuenta.id && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                        <p className="flex-1 text-xs text-gray-700">
                          {confirmando.accion === 'desactivar'
                            ? `¿Seguro que quieres desactivar a ${cuenta.nombre || cuenta.email}? No podrá iniciar sesión hasta que la reactives.`
                            : `¿Seguro que quieres ELIMINAR la cuenta de ${cuenta.nombre || cuenta.email}? Esta acción no se puede deshacer.`}
                        </p>
                        <button
                          type="button"
                          onClick={() => ejecutarAccion(cuenta, confirmando.accion)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${
                            confirmando.accion === 'eliminar'
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-amber-500 hover:bg-amber-600'
                          }`}
                        >
                          Sí, {confirmando.accion === 'eliminar' ? 'eliminar' : 'desactivar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmando(null)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}

                    {avisoReset[cuenta.id] && (
                      <p
                        className={`mt-2 text-xs ${
                          avisoReset[cuenta.id].startsWith('Error') ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {avisoReset[cuenta.id]}
                      </p>
                    )}
                    {avisoAccion[cuenta.id] && (
                      <p
                        className={`mt-2 flex items-center gap-1 text-xs ${
                          avisoAccion[cuenta.id].startsWith('Error') ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {!avisoAccion[cuenta.id].startsWith('Error') && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {avisoAccion[cuenta.id]}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
