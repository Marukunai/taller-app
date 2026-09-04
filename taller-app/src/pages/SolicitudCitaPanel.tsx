import { useState } from 'react';
import type { FormEvent } from 'react';
import { Bike, Car, CalendarClock, ChevronDown, ChevronUp, Loader2, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import SolicitudesPanel from '../components/SolicitudesPanel';
import { fabricantesPara, modelosParaFabricante } from '../lib/vehicleData';
import type { NeumaticosCantidad, TipoServicio, TipoVehiculo } from '../lib/types';

const TIPOS_SERVICIO: { value: TipoServicio; label: string }[] = [
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'neumaticos', label: 'Neumáticos' },
  { value: 'averia', label: 'Avería' },
  { value: 'pre_itv', label: 'Pre ITV' },
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

/** Para moto (batch 24): solo 2 ruedas, sin distinción izquierda/derecha. */
const OPCIONES_NEUMATICOS_MOTO: { value: NeumaticosCantidad; label: string }[] = [
  { value: 'delantero', label: 'Delantero' },
  { value: 'trasero', label: 'Trasero' },
];

const FORM_VACIO = {
  nombre: '',
  telefono: '',
  email: '',
  matricula: '',
  tipoVehiculo: 'coche' as TipoVehiculo,
  marca: '',
  modelo: '',
  tipoServicio: 'mantenimiento' as TipoServicio,
  descripcion: '',
  neumaticosCantidad: 'las_4' as NeumaticosCantidad,
  fechaCita: '',
};

/**
 * Pestaña "Solicitud de cita": el primer paso del check-in partido en dos
 * (ver AskUserQuestion / conversación con el taller). Aquí se registra una
 * cita — datos del dueño y del vehículo, SIN daños/kilometraje/firma,
 * porque el coche todavía no está físicamente en el taller — tanto si la
 * pide el cliente desde el Portal (ver ClientPortal.tsx) como si la anota
 * el propio personal al recibir una llamada o a un cliente sin cuenta del
 * Portal, con el formulario de aquí arriba.
 *
 * Reutiliza tal cual la tabla `solicitudes` y el panel de revisión
 * (SolicitudesPanel, con su aceptar/rechazar de siempre): una solicitud
 * registrada por el personal entra igual que una del Portal, en estado
 * "pendiente", y al aceptarla se crea la orden de seguimiento que luego se
 * completa desde "Recibir vehículo" en el Check-in real (paso 2), con daños,
 * kilometraje y firma — sin tener que volver a teclear los datos del dueño
 * ni del vehículo.
 */
export default function SolicitudCitaPanel() {
  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  const handleGuardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(false);
    // Validación ampliada en el batch 19, parte 4 (feedback del usuario):
    // esta pantalla es sobre todo para llamadas telefónicas o clientes sin
    // cuenta del Portal, así que en vez de exigir el teléfono en concreto
    // basta con AL MENOS una forma de contacto (teléfono o email) — por si
    // hiciera falta volver a localizar al cliente más adelante. La fecha de
    // la cita pasa a ser obligatoria aquí (antes era opcional): sin fecha
    // no hay realmente una "cita". Matrícula sigue siendo opcional a
    // propósito (llamadas urgentes de gente que no se acuerda de ella).
    if (!form.nombre.trim()) {
      setError('El nombre del cliente es obligatorio.');
      return;
    }
    if (!form.telefono.trim() && !form.email.trim()) {
      setError('Indica al menos una forma de contacto: teléfono o email.');
      return;
    }
    if (!form.fechaCita) {
      setError('La fecha de la cita es obligatoria.');
      return;
    }
    setGuardando(true);
    const { error: insertError } = await supabase.from('solicitudes').insert({
      cliente_auth_id: null,
      nombre_cliente: form.nombre.trim(),
      email_cliente: form.email.trim() || null,
      telefono_cliente: form.telefono.trim(),
      matricula: form.matricula.trim() || null,
      tipo_vehiculo: form.tipoVehiculo,
      marca: form.marca.trim() || null,
      modelo: form.modelo.trim() || null,
      tipo_servicio: form.tipoServicio,
      descripcion: form.tipoServicio === 'averia' ? form.descripcion.trim() || null : null,
      neumaticos_cantidad: form.tipoServicio === 'neumaticos' ? form.neumaticosCantidad : null,
      fecha_cita_checkin: form.fechaCita ? new Date(form.fechaCita).toISOString() : null,
    });
    setGuardando(false);
    if (insertError) {
      setError(
        insertError.message.includes('cliente_auth_id')
          ? 'No se pudo guardar: parece que falta ejecutar la migración ' +
              'checkin_split_y_decimales_migration.sql en Supabase.'
          : insertError.message,
      );
      return;
    }
    setExito(true);
    setForm(FORM_VACIO);
    // SolicitudesPanel se actualiza solo vía Realtime en cuanto se inserta
    // esta fila — no hace falta recargar nada aquí a mano.
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitud de cita</h1>
          <p className="text-sm text-gray-500">
            Datos del dueño y del vehículo antes de que llegue al taller — el check-in real (daños,
            kilometraje y firma) se hace después, cuando el coche esté físicamente aquí.
          </p>
        </div>
      </header>

      <div className="mb-6 overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setFormAbierto((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Plus className="h-4 w-4 text-sky-600" /> Nueva solicitud (llamada o cliente sin cuenta)
          </span>
          {formAbierto ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {formAbierto && (
          <form onSubmit={handleGuardar} className="space-y-4 border-t border-sky-100 bg-sky-50/40 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo
                label="Nombre completo"
                value={form.nombre}
                onChange={(v) => setForm((p) => ({ ...p, nombre: v }))}
                required
              />
              <Campo
                label="Teléfono (al menos uno de los dos)"
                value={form.telefono}
                onChange={(v) => setForm((p) => ({ ...p, telefono: v }))}
              />
              <Campo
                label="Email (al menos uno de los dos)"
                value={form.email}
                onChange={(v) => setForm((p) => ({ ...p, email: v }))}
                type="email"
              />
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de vehículo</label>
                <div className="flex w-fit rounded-xl border border-gray-300 bg-white p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, tipoVehiculo: 'coche', neumaticosCantidad: 'las_4' }))}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      form.tipoVehiculo === 'coche' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Car className="h-3.5 w-3.5" /> Coche
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, tipoVehiculo: 'moto', neumaticosCantidad: 'delantero' }))}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      form.tipoVehiculo === 'moto' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Bike className="h-3.5 w-3.5" /> Moto
                  </button>
                </div>
              </div>
              <Campo
                label="Matrícula (si se conoce)"
                value={form.matricula}
                onChange={(v) => setForm((p) => ({ ...p, matricula: v }))}
              />
              <Campo
                label="Marca"
                value={form.marca}
                onChange={(v) => setForm((p) => ({ ...p, marca: v }))}
                listId="lista-fabricantes-cita"
                listOptions={fabricantesPara(form.tipoVehiculo)}
              />
              <Campo
                label="Modelo"
                value={form.modelo}
                onChange={(v) => setForm((p) => ({ ...p, modelo: v }))}
                listId="lista-modelos-cita"
                listOptions={modelosParaFabricante(form.marca, form.tipoVehiculo)}
              />
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
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Fecha propuesta para traerlo<span className="text-red-500"> *</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.fechaCita}
                  onChange={(e) => setForm((p) => ({ ...p, fechaCita: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {form.tipoServicio === 'averia' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Descripción de la avería
                </label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            )}

            {form.tipoServicio === 'neumaticos' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">¿Cuántos neumáticos?</label>
                <select
                  value={form.neumaticosCantidad}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, neumaticosCantidad: e.target.value as NeumaticosCantidad }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-64"
                >
                  {(form.tipoVehiculo === 'moto' ? OPCIONES_NEUMATICOS_MOTO : OPCIONES_NEUMATICOS).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            {exito && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Solicitud registrada — aparece abajo en "Pendientes de revisar".
              </p>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {guardando ? 'Guardando...' : 'Registrar solicitud'}
            </button>
          </form>
        )}
      </div>

      <SolicitudesPanel />
    </div>
  );
}

interface CampoProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  listId?: string;
  listOptions?: string[];
}

function Campo({ label, value, onChange, type = 'text', required, listId, listOptions }: CampoProps) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
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
