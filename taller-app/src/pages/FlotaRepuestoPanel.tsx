import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Ban, Bike, Car, CheckCircle2, Link2, Loader2, Pencil, Plus, RotateCcw, Truck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import EnlazarOrdenModal from '../components/EnlazarOrdenModal';
import type { CocheRepuesto, TipoVehiculo } from '../lib/types';
import { fabricantesPara, modelosParaFabricante } from '../lib/vehicleData';

interface NuevoCocheForm {
  matricula: string;
  tipoVehiculo: TipoVehiculo;
  marca: string;
  modelo: string;
  notas: string;
  precioHora: string;
}

const FORM_VACIO: NuevoCocheForm = {
  matricula: '',
  tipoVehiculo: 'coche',
  marca: '',
  modelo: '',
  notas: '',
  precioHora: '',
};

/** Info del préstamo activo de un coche de la flota (si lo hay ahora mismo),
 *  para mostrar a quién se le ha prestado sin tener que ir a buscarlo al
 *  Panel de gestión. */
interface PrestamoActivo {
  matriculaCliente: string;
  desde: string;
  // Añadidos en el batch 19, parte 3 — nombre del cliente y fecha prevista
  // de devolución, para no tener que ir al Panel de gestión a verlos.
  clienteNombre: string;
  fechaPrevista: string | null;
}

/**
 * Gestión de la flota propia de coches de sustitución (solo encargado).
 * La disponibilidad de cada coche no se guarda aquí: se calcula a partir de
 * si alguna orden de trabajo lo tiene asignado sin devolver todavía (ver
 * `ordenes_trabajo.coche_repuesto_id`/`fecha_devolucion_repuesto`) — esta
 * pantalla solo gestiona el catálogo de coches en sí (alta/edición/baja).
 * Asignar o devolver un coche a un cliente concreto se hace desde el Panel
 * de gestión, en la propia tarjeta de la orden.
 */
export default function FlotaRepuestoPanel() {
  const [coches, setCoches] = useState<CocheRepuesto[]>([]);
  const [prestamos, setPrestamos] = useState<Record<string, PrestamoActivo>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState<NuevoCocheForm>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const [cocheEditando, setCocheEditando] = useState<string | null>(null);
  const [formEdicion, setFormEdicion] = useState<NuevoCocheForm>(FORM_VACIO);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [cambiandoBajaId, setCambiandoBajaId] = useState<string | null>(null);
  // Enlazar un coche libre a una orden activa, directamente desde Flota
  // (batch 19, parte 3) — ver EnlazarOrdenModal.tsx.
  const [enlazarModal, setEnlazarModal] = useState<{ id: string; matricula: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data: flota, error: flotaError } = await supabase
      .from('coches_repuesto')
      .select('id, matricula, tipo_vehiculo, marca, modelo, notas, baja, precio_hora')
      .order('matricula', { ascending: true });
    if (flotaError) {
      setError(flotaError.message);
      setCargando(false);
      return;
    }
    const { data: activas, error: activasError } = await supabase
      .from('ordenes_trabajo')
      .select(
        'coche_repuesto_id, fecha_prestamo_repuesto, fecha_devolucion_repuesto_prevista, ' +
          'vehiculos(matricula, clientes(nombre)), solicitudes(matricula, nombre_cliente)',
      )
      .not('coche_repuesto_id', 'is', null)
      .is('fecha_devolucion_repuesto', null);
    if (activasError) {
      setError(activasError.message);
      setCargando(false);
      return;
    }
    const mapa: Record<string, PrestamoActivo> = {};
    for (const fila of (activas ?? []) as unknown as {
      coche_repuesto_id: string;
      fecha_prestamo_repuesto: string | null;
      fecha_devolucion_repuesto_prevista: string | null;
      vehiculos: { matricula: string; clientes: { nombre: string } | null } | null;
      solicitudes: { matricula: string | null; nombre_cliente: string } | null;
    }[]) {
      mapa[fila.coche_repuesto_id] = {
        matriculaCliente: fila.vehiculos?.matricula ?? fila.solicitudes?.matricula ?? '—',
        desde: fila.fecha_prestamo_repuesto ?? '',
        clienteNombre: fila.vehiculos?.clientes?.nombre ?? fila.solicitudes?.nombre_cliente ?? 'Cliente',
        fechaPrevista: fila.fecha_devolucion_repuesto_prevista,
      };
    }
    setPrestamos(mapa);
    setCoches((flota ?? []) as CocheRepuesto[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const activos = useMemo(() => coches.filter((c) => !c.baja), [coches]);
  const deBaja = useMemo(() => coches.filter((c) => c.baja), [coches]);

  const crearCoche = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.matricula.trim()) {
      setError('La matrícula es obligatoria.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('coches_repuesto')
      .insert({
        matricula: form.matricula.trim(),
        tipo_vehiculo: form.tipoVehiculo,
        marca: form.marca.trim() || null,
        modelo: form.modelo.trim() || null,
        notas: form.notas.trim() || null,
        precio_hora: form.precioHora.trim() ? Number(form.precioHora) : null,
      })
      .select()
      .single();
    setGuardando(false);
    if (insertError) {
      setError(`No se pudo añadir el coche: ${insertError.message}`);
      return;
    }
    setCoches((prev) => [...prev, data as CocheRepuesto]);
    setForm(FORM_VACIO);
    setFormAbierto(false);
  };

  const abrirEdicion = (coche: CocheRepuesto) => {
    setCocheEditando(coche.id);
    setFormEdicion({
      matricula: coche.matricula,
      tipoVehiculo: coche.tipo_vehiculo,
      marca: coche.marca ?? '',
      modelo: coche.modelo ?? '',
      notas: coche.notas ?? '',
      precioHora: coche.precio_hora != null ? String(coche.precio_hora) : '',
    });
  };

  const guardarEdicion = async (e: FormEvent, coche: CocheRepuesto) => {
    e.preventDefault();
    if (!formEdicion.matricula.trim()) {
      setError('La matrícula es obligatoria.');
      return;
    }
    setGuardandoEdicion(true);
    setError(null);
    const { data, error: updateError } = await supabase
      .from('coches_repuesto')
      .update({
        matricula: formEdicion.matricula.trim(),
        tipo_vehiculo: formEdicion.tipoVehiculo,
        marca: formEdicion.marca.trim() || null,
        modelo: formEdicion.modelo.trim() || null,
        notas: formEdicion.notas.trim() || null,
        precio_hora: formEdicion.precioHora.trim() ? Number(formEdicion.precioHora) : null,
      })
      .eq('id', coche.id)
      .select()
      .single();
    setGuardandoEdicion(false);
    if (updateError) {
      setError(`No se pudo guardar el coche: ${updateError.message}`);
      return;
    }
    setCoches((prev) => prev.map((c) => (c.id === coche.id ? (data as CocheRepuesto) : c)));
    setCocheEditando(null);
  };

  const cambiarBaja = async (coche: CocheRepuesto, baja: boolean) => {
    setCambiandoBajaId(coche.id);
    setError(null);
    const { error: updateError } = await supabase
      .from('coches_repuesto')
      .update({ baja })
      .eq('id', coche.id);
    setCambiandoBajaId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCoches((prev) => prev.map((c) => (c.id === coche.id ? { ...c, baja } : c)));
  };

  const renderCoche = (coche: CocheRepuesto) => {
    if (cocheEditando === coche.id) {
      return (
        <form
          key={coche.id}
          onSubmit={(e) => guardarEdicion(e, coche)}
          className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Editar coche</h3>
            <button
              type="button"
              onClick={() => setCocheEditando(null)}
              className="rounded-full p-1 text-gray-400 hover:bg-white hover:text-gray-600"
              aria-label="Cancelar edición"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de vehículo</label>
              <div className="flex w-fit rounded-xl border border-gray-300 bg-white p-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => setFormEdicion((p) => ({ ...p, tipoVehiculo: 'coche' }))}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    formEdicion.tipoVehiculo === 'coche' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Car className="h-3.5 w-3.5" /> Coche
                </button>
                <button
                  type="button"
                  onClick={() => setFormEdicion((p) => ({ ...p, tipoVehiculo: 'moto' }))}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    formEdicion.tipoVehiculo === 'moto' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Bike className="h-3.5 w-3.5" /> Moto
                </button>
              </div>
            </div>
            <Campo label="Matrícula" value={formEdicion.matricula} onChange={(v) => setFormEdicion((p) => ({ ...p, matricula: v }))} required />
            <Campo
              label="Marca"
              value={formEdicion.marca}
              onChange={(v) => setFormEdicion((p) => ({ ...p, marca: v }))}
              listId="lista-fabricantes-flota-edicion"
              listOptions={fabricantesPara(formEdicion.tipoVehiculo)}
            />
            <Campo
              label="Modelo"
              value={formEdicion.modelo}
              onChange={(v) => setFormEdicion((p) => ({ ...p, modelo: v }))}
              listId="lista-modelos-flota-edicion"
              listOptions={modelosParaFabricante(formEdicion.marca, formEdicion.tipoVehiculo)}
            />
            <Campo label="Notas" value={formEdicion.notas} onChange={(v) => setFormEdicion((p) => ({ ...p, notas: v }))} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Precio por hora (€, opcional)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formEdicion.precioHora}
                onChange={(e) => setFormEdicion((p) => ({ ...p, precioHora: e.target.value }))}
                placeholder="Ej. 5.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={guardandoEdicion}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {guardandoEdicion && <Loader2 className="h-4 w-4 animate-spin" />}
            {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      );
    }

    const prestamo = prestamos[coche.id];
    return (
      <div
        key={coche.id}
        className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
            coche.baja ? 'bg-gray-100 text-gray-400' : prestamo ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
          }`}
        >
          {coche.tipo_vehiculo === 'moto' ? <Bike className="h-5 w-5" /> : <Car className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-gray-900">{coche.matricula}</p>
          <p className="truncate text-sm text-gray-500">
            {[coche.marca, coche.modelo].filter(Boolean).join(' ') || 'Sin marca/modelo'}
          </p>
          {coche.notas && <p className="truncate text-xs text-gray-400">{coche.notas}</p>}
          {coche.precio_hora != null && (
            <p className="text-xs font-medium text-gray-500">{coche.precio_hora.toFixed(2)} €/hora</p>
          )}
          {coche.baja ? (
            <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
              De baja
            </span>
          ) : prestamo ? (
            <span className="mt-1 block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Prestado a {prestamo.clienteNombre} ({prestamo.matriculaCliente})
              {prestamo.desde
                ? ` desde el ${new Date(prestamo.desde).toLocaleDateString('es-ES')}`
                : ''}
              {prestamo.fechaPrevista
                ? ` · devolución prevista: ${new Date(prestamo.fechaPrevista).toLocaleDateString('es-ES')}`
                : ''}
            </span>
          ) : (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Libre
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!coche.baja && !prestamo && (
            <button
              type="button"
              onClick={() => setEnlazarModal({ id: coche.id, matricula: coche.matricula })}
              className="rounded-full border border-blue-200 p-1.5 text-blue-600 hover:bg-blue-50"
              aria-label="Enlazar a una orden"
              title="Enlazar a una orden de reparación"
            >
              <Link2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => abrirEdicion(coche)}
            className="rounded-full border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
            aria-label="Editar coche"
            title="Editar coche"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => cambiarBaja(coche, !coche.baja)}
            disabled={cambiandoBajaId === coche.id}
            className={`rounded-full border p-1.5 disabled:opacity-40 ${
              coche.baja
                ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                : 'border-gray-200 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600'
            }`}
            aria-label={coche.baja ? 'Reactivar coche' : 'Dar de baja'}
            title={coche.baja ? 'Reactivar coche' : 'Dar de baja'}
          >
            {coche.baja ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
            <Truck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flota de coches de sustitución</h1>
            <p className="text-sm text-gray-500">
              Coches propios que se prestan a un cliente mientras dura el servicio de su vehículo.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFormAbierto((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Añadir coche
        </button>
      </header>

      {formAbierto && (
        <form
          onSubmit={crearCoche}
          className="mb-6 space-y-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Nuevo coche de sustitución</h2>
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
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de vehículo</label>
              <div className="flex w-fit rounded-xl border border-gray-300 bg-white p-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, tipoVehiculo: 'coche' }))}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    form.tipoVehiculo === 'coche' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Car className="h-3.5 w-3.5" /> Coche
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, tipoVehiculo: 'moto' }))}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    form.tipoVehiculo === 'moto' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Bike className="h-3.5 w-3.5" /> Moto
                </button>
              </div>
            </div>
            <Campo label="Matrícula" value={form.matricula} onChange={(v) => setForm((p) => ({ ...p, matricula: v }))} required />
            <Campo
              label="Marca"
              value={form.marca}
              onChange={(v) => setForm((p) => ({ ...p, marca: v }))}
              listId="lista-fabricantes-flota"
              listOptions={fabricantesPara(form.tipoVehiculo)}
            />
            <Campo
              label="Modelo"
              value={form.modelo}
              onChange={(v) => setForm((p) => ({ ...p, modelo: v }))}
              listId="lista-modelos-flota"
              listOptions={modelosParaFabricante(form.marca, form.tipoVehiculo)}
            />
            <Campo label="Notas (opcional)" value={form.notas} onChange={(v) => setForm((p) => ({ ...p, notas: v }))} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Precio por hora (€, opcional)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.precioHora}
                onChange={(e) => setForm((p) => ({ ...p, precioHora: e.target.value }))}
                placeholder="Ej. 5.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={guardando}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {guardando ? 'Guardando...' : 'Guardar coche'}
          </button>
        </form>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando flota...
        </p>
      ) : coches.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          Todavía no has añadido ningún coche de sustitución.
        </p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-gray-700">
              En la flota
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">
                {activos.length}
              </span>
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {activos.length === 0 ? (
                <p className="text-xs text-gray-400">Ningún coche activo en la flota.</p>
              ) : (
                activos.map(renderCoche)
              )}
            </div>
          </section>

          {deBaja.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-gray-700">Dados de baja</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{deBaja.map(renderCoche)}</div>
            </section>
          )}
        </div>
      )}

      <EnlazarOrdenModal
        open={enlazarModal !== null}
        coche={enlazarModal}
        onClose={() => setEnlazarModal(null)}
        onEnlazado={() => {
          setEnlazarModal(null);
          cargar();
        }}
      />
    </div>
  );
}

interface CampoProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  listId?: string;
  listOptions?: string[];
}

function Campo({ label, value, onChange, required, listId, listOptions }: CampoProps) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        list={listId}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      {listId && listOptions && (
        <datalist id={listId}>
          {listOptions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </div>
  );
}
