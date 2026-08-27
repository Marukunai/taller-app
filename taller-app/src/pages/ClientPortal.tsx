import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Calendar,
  Car,
  CheckCircle2,
  ClipboardList,
  Loader2,
  LogOut,
  Mail,
  MessageSquareText,
  Phone,
  Send,
  Wrench,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { EstadoSolicitud, NeumaticosCantidad, Solicitud, TipoServicio } from '../lib/types';

const TIPOS_SERVICIO: { value: TipoServicio; label: string }[] = [
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'neumaticos', label: 'Neumáticos' },
  { value: 'averia', label: 'Avería' },
];

const OPCIONES_NEUMATICOS: { value: NeumaticosCantidad; label: string }[] = [
  { value: '2_delanteros', label: '2 delanteros' },
  { value: '2_traseros', label: '2 traseros' },
  { value: 'las_4', label: 'Los 4' },
  { value: 'delantero_izquierdo', label: 'Uno: delantero izquierdo' },
  { value: 'delantero_derecho', label: 'Uno: delantero derecho' },
  { value: 'trasero_izquierdo', label: 'Uno: trasero izquierdo' },
  { value: 'trasero_derecho', label: 'Uno: trasero derecho' },
];

const ESTADO_BADGE: Record<EstadoSolicitud, { label: string; clase: string }> = {
  pendiente: { label: 'Pendiente de revisión', clase: 'bg-amber-100 text-amber-700' },
  aceptada: { label: 'Aceptada por el taller', clase: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', clase: 'bg-red-100 text-red-700' },
  cancelada: { label: 'Cancelada', clase: 'bg-gray-100 text-gray-600' },
};

interface ClientPortalProps {
  nombreUsuario: string;
  emailUsuario: string;
}

const FORM_VACIO = {
  matricula: '',
  marca: '',
  modelo: '',
  telefono: '',
  tipoServicio: 'mantenimiento' as TipoServicio,
  descripcion: '',
  neumaticosCantidad: 'las_4' as NeumaticosCantidad,
};

/**
 * Portal de cliente: el propio cliente pide un servicio ("quiero una
 * revisión de mantenimiento...") sin llamar por teléfono ni pasar por el
 * mecánico. Es un aviso previo — el check-in real (fotos, daños, firma) se
 * sigue haciendo en persona cuando el vehículo llega al taller, igual que
 * siempre; aquí solo se manda la petición y se ve su estado.
 */
export default function ClientPortal({ nombreUsuario, emailUsuario }: ClientPortalProps) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [enviando, setEnviando] = useState(false);
  const [formAbierto, setFormAbierto] = useState(false);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('solicitudes')
      .select(
        'id, created_at, cliente_auth_id, nombre_cliente, email_cliente, telefono_cliente, ' +
          'matricula, marca, modelo, tipo_servicio, descripcion, neumaticos_cantidad, estado, respuesta_taller',
      )
      .order('created_at', { ascending: false });
    if (fetchError) setError(fetchError.message);
    else setSolicitudes((data ?? []) as unknown as Solicitud[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('No se pudo identificar tu sesión — vuelve a entrar.');
      setEnviando(false);
      return;
    }
    const { data, error: insertError } = await supabase
      .from('solicitudes')
      .insert({
        cliente_auth_id: user.id,
        nombre_cliente: nombreUsuario,
        email_cliente: emailUsuario,
        telefono_cliente: form.telefono || null,
        matricula: form.matricula || null,
        marca: form.marca || null,
        modelo: form.modelo || null,
        tipo_servicio: form.tipoServicio,
        descripcion: form.descripcion || null,
        neumaticos_cantidad: form.tipoServicio === 'neumaticos' ? form.neumaticosCantidad : null,
      })
      .select()
      .single();
    setEnviando(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSolicitudes((prev) => [data as Solicitud, ...prev]);
    setForm(FORM_VACIO);
    setFormAbierto(false);
  };

  const cancelarSolicitud = async (id: string) => {
    setCancelandoId(id);
    setError(null);
    const { error: updateError } = await supabase
      .from('solicitudes')
      .update({ estado: 'cancelada' })
      .eq('id', id);
    setCancelandoId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSolicitudes((prev) => prev.map((s) => (s.id === id ? { ...s, estado: 'cancelada' } : s)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-blue-50">
      <nav className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 shadow-md">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
            <Wrench className="h-4 w-4" />
          </span>
          <span className="font-bold text-white">Portal de cliente</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-white/80 sm:inline">{nombreUsuario || emailUsuario}</span>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white/90 transition hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hola, {nombreUsuario || 'de nuevo'}</h1>
            <p className="text-sm text-gray-500">Pide un servicio o consulta el estado de tus solicitudes.</p>
          </div>
          <button
            type="button"
            onClick={() => setFormAbierto((v) => !v)}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Send className="h-4 w-4" /> Pedir servicio
          </button>
        </header>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        {formAbierto && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Nueva solicitud</h2>
              <button
                type="button"
                onClick={() => setFormAbierto(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-white hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Matrícula</label>
                <input
                  value={form.matricula}
                  onChange={(e) => setForm((p) => ({ ...p, matricula: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ej. 1234BBB"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono de contacto</label>
                <input
                  value={form.telefono}
                  onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Marca</label>
                <input
                  value={form.marca}
                  onChange={(e) => setForm((p) => ({ ...p, marca: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Modelo</label>
                <input
                  value={form.modelo}
                  onChange={(e) => setForm((p) => ({ ...p, modelo: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de servicio</label>
                <select
                  value={form.tipoServicio}
                  onChange={(e) => setForm((p) => ({ ...p, tipoServicio: e.target.value as TipoServicio }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {TIPOS_SERVICIO.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {form.tipoServicio === 'neumaticos' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">¿Cuántos neumáticos?</label>
                  <select
                    value={form.neumaticosCantidad}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, neumaticosCantidad: e.target.value as NeumaticosCantidad }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {OPCIONES_NEUMATICOS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cuéntanos qué necesitas</label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ej. Ruido al frenar desde hace unos días..."
              />
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              {enviando ? 'Enviando...' : 'Enviar solicitud'}
            </button>
          </form>
        )}

        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <ClipboardList className="h-4 w-4" /> Tus solicitudes
        </h2>

        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </p>
        ) : solicitudes.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
            Todavía no has pedido ningún servicio.
          </p>
        ) : (
          <ul className="space-y-3">
            {solicitudes.map((s) => {
              const badge = ESTADO_BADGE[s.estado];
              return (
                <li key={s.id} className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {TIPOS_SERVICIO.find((t) => t.value === s.tipo_servicio)?.label}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar className="h-3 w-3" /> {new Date(s.created_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.clase}`}>
                      {badge.label}
                    </span>
                  </div>
                  {s.matricula && (
                    <p className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Car className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      {s.matricula} · {[s.marca, s.modelo].filter(Boolean).join(' ') || 'Sin marca/modelo'}
                    </p>
                  )}
                  {s.telefono_cliente && (
                    <p className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Phone className="h-3.5 w-3.5 shrink-0" /> {s.telefono_cliente}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> {s.email_cliente}
                  </p>
                  {s.descripcion && <p className="text-sm text-gray-700">{s.descripcion}</p>}
                  {s.respuesta_taller && (
                    <p className="flex items-start gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
                      <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" /> {s.respuesta_taller}
                    </p>
                  )}
                  {s.estado === 'pendiente' && (
                    <button
                      type="button"
                      onClick={() => cancelarSolicitud(s.id)}
                      disabled={cancelandoId === s.id}
                      className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-60"
                    >
                      {cancelandoId === s.id ? 'Cancelando...' : 'Cancelar solicitud'}
                    </button>
                  )}
                  {s.estado === 'aceptada' && (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Trae el vehículo cuando acordéis — el check-in
                      se hace al llegar al taller.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
