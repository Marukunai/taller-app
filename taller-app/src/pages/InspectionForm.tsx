import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  MessageCircle,
  PenLine,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { supabase, BUCKETS } from '../lib/supabase';
import CarDamagePicker from '../components/CarDamagePicker';
import SignatureModal from '../components/SignatureModal';
import { generarYSubirInformePdf } from '../lib/generateReportPdf';
import { buildWhatsAppLink } from '../lib/whatsapp';
import type {
  DanoMarcador,
  NeumaticosCantidad,
  NivelCombustible,
  OrdenPendienteRecepcion,
  TipoServicio,
} from '../lib/types';

const NIVELES_COMBUSTIBLE: NivelCombustible[] = ['1/4', '1/2', '3/4', 'Lleno'];
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

interface FotoPendiente {
  id: string;
  file: File;
  previewUrl: string;
}

interface InspectionFormProps {
  /** Si se pasa (viene de pulsar "Recibir vehículo" en el Panel de gestión
   *  sobre una orden 'solicitado'), el formulario se prellena con lo que
   *  el cliente ya dijo en su solicitud y, al guardar, completa ESA orden
   *  (update) en vez de crear una nueva (insert). */
  ordenPendiente?: OrdenPendienteRecepcion | null;
  /** Se llama al terminar de recibir el vehículo (guardado con éxito) o al
   *  descartar el prellenado con el botón de cerrar del aviso — para que
   *  App.tsx deje de pasar el mismo `ordenPendiente` la próxima vez que se
   *  entre en esta pestaña. */
  onOrdenPendienteCompletada?: () => void;
}

export default function InspectionForm({
  ordenPendiente,
  onOrdenPendienteCompletada,
}: InspectionFormProps) {
  // Datos de cliente y vehículo
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [matricula, setMatricula] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [color, setColor] = useState('');
  const [tipoServicio, setTipoServicio] = useState<TipoServicio>('mantenimiento');
  const [descripcionAveria, setDescripcionAveria] = useState('');
  // Solo se usan cuando tipoServicio === 'neumaticos'.
  const [neumaticosCantidad, setNeumaticosCantidad] = useState<NeumaticosCantidad>('las_4');
  const [neumaticoFoto, setNeumaticoFoto] = useState<File | null>(null);
  const [neumaticoFotoPreview, setNeumaticoFotoPreview] = useState<string | null>(null);

  // Documentación obligatoria del check-in — se exige AL MENOS una de las
  // dos (validar() más abajo), nunca las dos a la vez: quien trae el coche
  // puede aportar su propio permiso de conducir (foto) o la ficha técnica
  // del vehículo, lo que tenga a mano en ese momento.
  const [permisoConducirFoto, setPermisoConducirFoto] = useState<File | null>(null);
  const [permisoConducirPreview, setPermisoConducirPreview] = useState<string | null>(null);
  const [fichaTecnicaFoto, setFichaTecnicaFoto] = useState<File | null>(null);
  const [fichaTecnicaPreview, setFichaTecnicaPreview] = useState<string | null>(null);

  // Datos de la inspección
  const [kilometraje, setKilometraje] = useState('');
  const [nivelCombustible, setNivelCombustible] = useState<NivelCombustible>('1/2');
  const [fotos, setFotos] = useState<FotoPendiente[]>([]);
  const [observaciones, setObservaciones] = useState('');
  const [danos, setDanos] = useState<DanoMarcador[]>([]);
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null);

  const [modalFirmaAbierto, setModalFirmaAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [generandoInforme, setGenerandoInforme] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [resultado, setResultado] = useState<{ pdfUrl: string; whatsappUrl: string } | null>(
    null,
  );

  // Prellenar con lo que el cliente ya dijo en su solicitud, al llegar
  // desde "Recibir vehículo" en el Panel de gestión. El DNI nunca se
  // prellena (el Portal no lo pide) — se sigue pidiendo como siempre.
  useEffect(() => {
    if (!ordenPendiente) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNombre(ordenPendiente.nombre);
    setTelefono(ordenPendiente.telefono);
    setEmail(ordenPendiente.email);
    setMatricula(ordenPendiente.matricula);
    setMarca(ordenPendiente.marca);
    setModelo(ordenPendiente.modelo);
    setTipoServicio(ordenPendiente.tipoServicio);
    setDescripcionAveria(ordenPendiente.descripcionAveria);
    if (ordenPendiente.neumaticosCantidad) {
      setNeumaticosCantidad(ordenPendiente.neumaticosCantidad);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenPendiente?.ordenId]);

  const handleFotosSeleccionadas = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files ?? []);
    const nuevas: FotoPendiente[] = archivos.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setFotos((prev) => [...prev, ...nuevas]);
    e.target.value = '';
  };

  const eliminarFoto = (id: string) => {
    setFotos((prev) => prev.filter((f) => f.id !== id));
  };

  const handleNeumaticoFotoSeleccionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNeumaticoFoto(file);
    setNeumaticoFotoPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handlePermisoConducirSeleccionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPermisoConducirFoto(file);
    setPermisoConducirPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleFichaTecnicaSeleccionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFichaTecnicaFoto(file);
    setFichaTecnicaPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const resetFormulario = () => {
    setNombre('');
    setDni('');
    setTelefono('');
    setEmail('');
    setMatricula('');
    setMarca('');
    setModelo('');
    setColor('');
    setTipoServicio('mantenimiento');
    setDescripcionAveria('');
    setNeumaticosCantidad('las_4');
    setNeumaticoFoto(null);
    setNeumaticoFotoPreview(null);
    setPermisoConducirFoto(null);
    setPermisoConducirPreview(null);
    setFichaTecnicaFoto(null);
    setFichaTecnicaPreview(null);
    setKilometraje('');
    setNivelCombustible('1/2');
    setFotos([]);
    setObservaciones('');
    setDanos([]);
    setFirmaUrl(null);
  };

  const validar = (): string | null => {
    if (!nombre.trim() || !dni.trim() || !telefono.trim()) {
      return 'Completa nombre, DNI y teléfono del cliente.';
    }
    if (!email.trim()) return 'El email del cliente es obligatorio.';
    if (!matricula.trim()) return 'La matrícula del vehículo es obligatoria.';
    if (!marca.trim() || !modelo.trim()) return 'La marca y el modelo del vehículo son obligatorios.';
    if (!kilometraje.trim() || Number.isNaN(Number(kilometraje))) {
      return 'Indica un kilometraje válido.';
    }
    // Se exige AL MENOS uno de los dos documentos (no los dos a la vez) —
    // ver comentario junto a los estados permisoConducirFoto/fichaTecnicaFoto.
    if (!permisoConducirFoto && !fichaTecnicaFoto) {
      return 'Adjunta el permiso de conducir o la ficha técnica del vehículo (al menos uno de los dos).';
    }
    if (!firmaUrl) return 'Es necesario recoger la firma del cliente antes de guardar.';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(false);
    setResultado(null);

    const mensajeValidacion = validar();
    if (mensajeValidacion) {
      setError(mensajeValidacion);
      return;
    }
    if (!firmaUrl) {
      setError('Es necesario recoger la firma del cliente antes de guardar.');
      return;
    }

    setGuardando(true);
    try {
      // 1. Cliente (upsert por DNI, que es UNIQUE en la tabla)
      const { data: cliente, error: clienteError } = await supabase
        .from('clientes')
        .upsert({ nombre, dni, telefono, email: email || null }, { onConflict: 'dni' })
        .select()
        .single();
      if (clienteError) throw clienteError;

      // 2. Vehículo (upsert por matrícula, que es UNIQUE en la tabla)
      const { data: vehiculo, error: vehiculoError } = await supabase
        .from('vehiculos')
        .upsert(
          {
            matricula,
            marca: marca || null,
            modelo: modelo || null,
            color: color || null,
            cliente_id: cliente.id,
          },
          { onConflict: 'matricula' },
        )
        .select()
        .single();
      if (vehiculoError) throw vehiculoError;

      // 3. Foto del neumático actual (si el servicio es de neumáticos) — se
      // sube ANTES de crear la orden, con un nombre propio (no depende del
      // id de la orden), para poder incluir ya la URL en el mismo insert.
      let neumaticoFotoUrl: string | null = null;
      if (tipoServicio === 'neumaticos' && neumaticoFoto) {
        const ruta = `${matricula}/neumatico-${crypto.randomUUID()}-${neumaticoFoto.name}`;
        const { error: neumaticoFotoError } = await supabase.storage
          .from(BUCKETS.fotosVehiculos)
          .upload(ruta, neumaticoFoto, { upsert: true });
        if (neumaticoFotoError) throw neumaticoFotoError;
        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKETS.fotosVehiculos).getPublicUrl(ruta);
        neumaticoFotoUrl = publicUrl;
      }

      // 4. Orden de trabajo — si venimos de "Recibir vehículo" (una orden
      // 'solicitado' que ya existía por haber aceptado una solicitud del
      // Portal de cliente), se completa ESA orden con un update en vez de
      // crear una nueva, para no duplicar la tarjeta en el Panel de gestión.
      const datosOrden = {
        vehiculo_id: vehiculo.id,
        estado: 'recepcionado',
        tipo_servicio: tipoServicio,
        descripcion_averia: descripcionAveria || null,
        fecha_entrada: new Date().toISOString(),
        neumaticos_cantidad: tipoServicio === 'neumaticos' ? neumaticosCantidad : null,
        neumaticos_foto_url: neumaticoFotoUrl,
      };
      const { data: orden, error: ordenError } = ordenPendiente
        ? await supabase
            .from('ordenes_trabajo')
            .update(datosOrden)
            .eq('id', ordenPendiente.ordenId)
            .select()
            .single()
        : await supabase.from('ordenes_trabajo').insert(datosOrden).select().single();
      if (ordenError) throw ordenError;

      // 4b. Permiso de conducir / ficha técnica (bucket propio, distinto de
      // fotos-vehiculos, para no mezclar documentación del cliente con las
      // fotos del propio coche) — se sube lo que se haya aportado (al menos
      // uno de los dos, validado en validar()).
      let permisoConducirUrl: string | null = null;
      if (permisoConducirFoto) {
        const ruta = `${matricula}/permiso-conducir-${crypto.randomUUID()}-${permisoConducirFoto.name}`;
        const { error: subidaError } = await supabase.storage
          .from(BUCKETS.documentosCliente)
          .upload(ruta, permisoConducirFoto, { upsert: true });
        if (subidaError) throw subidaError;
        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKETS.documentosCliente).getPublicUrl(ruta);
        permisoConducirUrl = publicUrl;
      }
      let fichaTecnicaUrl: string | null = null;
      if (fichaTecnicaFoto) {
        const ruta = `${matricula}/ficha-tecnica-${crypto.randomUUID()}-${fichaTecnicaFoto.name}`;
        const { error: subidaError } = await supabase.storage
          .from(BUCKETS.documentosCliente)
          .upload(ruta, fichaTecnicaFoto, { upsert: true });
        if (subidaError) throw subidaError;
        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKETS.documentosCliente).getPublicUrl(ruta);
        fichaTecnicaUrl = publicUrl;
      }

      // 5. Subida de fotos al bucket 'fotos-vehiculos'
      const fotosUrls: string[] = [];
      for (const foto of fotos) {
        const ruta = `${matricula}/${orden.id}-${foto.id}-${foto.file.name}`;
        const { error: fotoError } = await supabase.storage
          .from(BUCKETS.fotosVehiculos)
          .upload(ruta, foto.file, { upsert: true });
        if (fotoError) throw fotoError;

        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKETS.fotosVehiculos).getPublicUrl(ruta);
        fotosUrls.push(publicUrl);
      }

      // 6. Inspección de entrada
      const { data: inspeccion, error: inspeccionError } = await supabase
        .from('inspecciones_entrada')
        .insert({
          orden_id: orden.id,
          kilometraje: Number(kilometraje),
          nivel_combustible: nivelCombustible,
          fotos_urls: fotosUrls,
          daños_coordenadas: danos,
          observaciones: observaciones || null,
          firma_cliente_url: firmaUrl,
          permiso_conducir_url: permisoConducirUrl,
          ficha_tecnica_url: fichaTecnicaUrl,
        })
        .select()
        .single();
      if (inspeccionError) throw inspeccionError;

      setExito(true);
      setGuardando(false);

      // 7. Informe PDF (client-side) + enlace de WhatsApp — no bloquea el
      // guardado si falla, solo se muestra un aviso aparte.
      setGenerandoInforme(true);
      try {
        const pdfUrl = await generarYSubirInformePdf({
          ordenId: orden.id,
          matricula,
          cliente: { nombre, dni, telefono, email },
          vehiculo: { matricula, marca, modelo },
          tipoServicio,
          descripcionAveria,
          kilometraje: Number(kilometraje),
          nivelCombustible,
          fotos: fotosUrls,
          danos,
          observaciones,
          firmaUrl,
        });

        await supabase
          .from('inspecciones_entrada')
          .update({ pdf_informe_url: pdfUrl })
          .eq('id', inspeccion.id);

        const whatsappUrl = buildWhatsAppLink({ telefono, nombreCliente: nombre, matricula, pdfUrl });
        setResultado({ pdfUrl, whatsappUrl });
      } catch (pdfErr) {
        setError(
          pdfErr instanceof Error
            ? `Inspección guardada, pero falló la generación del PDF: ${pdfErr.message}`
            : 'Inspección guardada, pero falló la generación del PDF.',
        );
      } finally {
        setGenerandoInforme(false);
      }

      resetFormulario();
      onOrdenPendienteCompletada?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la inspección.');
      setGuardando(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Check-in de vehículo</h1>
          <p className="text-sm text-gray-500">
            Inspección de entrada: datos del cliente, estado del vehículo y firma digital.
          </p>
        </div>
      </header>

      {ordenPendiente && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          <p>
            Recibiendo el vehículo de una solicitud aceptada — se han rellenado los datos que ya
            dio el cliente. Completa el DNI, las fotos, los daños y la firma como en cualquier
            check-in.
          </p>
          <button
            type="button"
            onClick={() => {
              resetFormulario();
              onOrdenPendienteCompletada?.();
            }}
            className="shrink-0 rounded-full p-1 text-sky-400 hover:bg-sky-100 hover:text-sky-600"
            aria-label="Descartar y hacer un check-in normal"
            title="Descartar y hacer un check-in normal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Seccion titulo="Cliente" icono={<User className="h-4 w-4" />} color="blue">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nombre completo" value={nombre} onChange={setNombre} required />
            <Campo label="DNI" value={dni} onChange={setDni} required />
            <Campo label="Teléfono" value={telefono} onChange={setTelefono} required />
            <Campo label="Email" value={email} onChange={setEmail} type="email" required />
          </div>
        </Seccion>

        <Seccion titulo="Vehículo y servicio" icono={<Wrench className="h-4 w-4" />} color="violet">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Matrícula" value={matricula} onChange={setMatricula} required />
            <Campo label="Marca" value={marca} onChange={setMarca} required />
            <Campo label="Modelo" value={modelo} onChange={setModelo} required />
            <Campo label="Color" value={color} onChange={setColor} placeholder="Ej. Rojo, Gris plata" />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de servicio</label>
              <select
                value={tipoServicio}
                onChange={(e) => setTipoServicio(e.target.value as TipoServicio)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {TIPOS_SERVICIO.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {tipoServicio === 'averia' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Descripción de la avería
              </label>
              <textarea
                value={descripcionAveria}
                onChange={(e) => setDescripcionAveria(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          {tipoServicio === 'neumaticos' && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  ¿Cuántos neumáticos?
                </label>
                <select
                  value={neumaticosCantidad}
                  onChange={(e) => setNeumaticosCantidad(e.target.value as NeumaticosCantidad)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {OPCIONES_NEUMATICOS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Foto del neumático actual
                </label>
                <p className="mb-2 -mt-1 text-xs text-gray-400">
                  No hace falta escribir la medida (205/55 R16...): con la foto se ve el neumático
                  actual tal cual.
                </p>
                <div className="flex items-center gap-3">
                  {neumaticoFotoPreview && (
                    <img
                      src={neumaticoFotoPreview}
                      alt=""
                      className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
                    />
                  )}
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:border-slate-400">
                    <Camera className="h-4 w-4" />
                    {neumaticoFotoPreview ? 'Cambiar foto' : 'Añadir foto'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleNeumaticoFotoSeleccionada}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <p className="mb-1 text-sm font-medium text-gray-700">
              Documentación <span className="text-red-500">*</span>
            </p>
            <p className="mb-3 text-xs text-gray-400">
              Obligatorio adjuntar al menos uno de los dos: el permiso de conducir de quien trae el
              vehículo, o la ficha técnica del vehículo.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Permiso de conducir (A1, A2, B, B+E...)
                </label>
                <div className="flex items-center gap-3">
                  {permisoConducirPreview && (
                    <img
                      src={permisoConducirPreview}
                      alt=""
                      className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
                    />
                  )}
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:border-slate-400">
                    <Camera className="h-4 w-4" />
                    {permisoConducirPreview ? 'Cambiar foto' : 'Añadir foto'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePermisoConducirSeleccionado}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Ficha técnica del vehículo</label>
                <div className="flex items-center gap-3">
                  {fichaTecnicaPreview && (
                    <img
                      src={fichaTecnicaPreview}
                      alt=""
                      className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
                    />
                  )}
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:border-slate-400">
                    <Camera className="h-4 w-4" />
                    {fichaTecnicaPreview ? 'Cambiar foto' : 'Añadir foto'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFichaTecnicaSeleccionada}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Inspección de entrada" icono={<Camera className="h-4 w-4" />} color="amber">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo
              label="Kilometraje"
              value={kilometraje}
              onChange={setKilometraje}
              type="number"
              required
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nivel de combustible
              </label>
              <select
                value={nivelCombustible}
                onChange={(e) => setNivelCombustible(e.target.value as NivelCombustible)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {NIVELES_COMBUSTIBLE.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Fotos del vehículo
            </label>
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-4 py-2 text-sm text-amber-700 hover:border-amber-400">
              <Camera className="h-4 w-4" />
              Añadir fotos
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handleFotosSeleccionadas}
                className="hidden"
              />
            </label>
            {fotos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {fotos.map((f) => (
                  <div key={f.id} className="group relative aspect-square overflow-hidden rounded-lg border">
                    <img src={f.previewUrl} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => eliminarFoto(f.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                      aria-label="Eliminar foto"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Observaciones generales
            </label>
            <p className="mb-2 text-xs text-gray-400">
              Notas sobre el estado del vehículo (además de los daños marcados abajo), por ejemplo
              ruidos, testigos encendidos u otros detalles a tener en cuenta.
            </p>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Ej. Testigo de aceite encendido, ruido al frenar..."
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Daños en la carrocería
            </label>
            <CarDamagePicker value={danos} onChange={setDanos} />
          </div>
        </Seccion>

        <Seccion titulo="Firma del cliente" icono={<PenLine className="h-4 w-4" />} color="emerald">
          {firmaUrl ? (
            <div className="flex items-center gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              Firma registrada correctamente.
              <button
                type="button"
                onClick={() => setModalFirmaAbierto(true)}
                className="ml-auto underline underline-offset-2"
              >
                Repetir
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setModalFirmaAbierto(true)}
              className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50/50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <PenLine className="h-4 w-4" /> Recoger firma del cliente
            </button>
          )}
        </Seccion>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        )}

        {generandoInforme && (
          <p className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Inspección guardada. Generando informe PDF...
          </p>
        )}

        {resultado && (
          <div className="space-y-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Inspección guardada e informe generado correctamente.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={resultado.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-3 py-1.5 font-medium text-green-700 hover:bg-green-100"
              >
                <ExternalLink className="h-4 w-4" /> Ver informe (PDF)
              </a>
              <a
                href={resultado.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 font-medium text-white hover:bg-green-700"
              >
                <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
              </a>
            </div>
          </div>
        )}

        {exito && !resultado && !generandoInforme && (
          <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
            Inspección guardada correctamente.
          </p>
        )}

        <button
          type="submit"
          disabled={guardando}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-700 hover:to-blue-700 disabled:opacity-60"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
          {guardando ? 'Guardando...' : 'Guardar e Inspeccionar'}
        </button>
      </form>

      <SignatureModal
        open={modalFirmaAbierto}
        tipo="entrada"
        referencia={matricula || 'sin-matricula'}
        onClose={() => setModalFirmaAbierto(false)}
        onSaved={(url) => setFirmaUrl(url)}
      />
    </div>
  );
}

const COLOR_SECCION: Record<string, { border: string; bg: string; text: string }> = {
  blue: { border: 'border-blue-100', bg: 'bg-blue-100', text: 'text-blue-600' },
  violet: { border: 'border-violet-100', bg: 'bg-violet-100', text: 'text-violet-600' },
  amber: { border: 'border-amber-100', bg: 'bg-amber-100', text: 'text-amber-600' },
  emerald: { border: 'border-emerald-100', bg: 'bg-emerald-100', text: 'text-emerald-600' },
};

interface SeccionProps {
  titulo: string;
  icono: ReactNode;
  color: keyof typeof COLOR_SECCION;
  children: ReactNode;
}

function Seccion({ titulo, icono, color, children }: SeccionProps) {
  const c = COLOR_SECCION[color];
  return (
    <section className={`space-y-4 rounded-2xl border ${c.border} bg-white p-5 shadow-sm`}>
      <h2 className="flex items-center gap-2 font-semibold text-gray-800">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.bg} ${c.text}`}>
          {icono}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

interface CampoProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}

function Campo({ label, value, onChange, type = 'text', required, placeholder }: CampoProps) {
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
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
