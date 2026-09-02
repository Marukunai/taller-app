import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Euro, ImagePlus, Loader2, Minus, Package, Pencil, Plus, Search, Trash2, Warehouse, X } from 'lucide-react';
import { supabase, BUCKETS } from '../lib/supabase';
import type { Almacen, InventarioItem } from '../lib/types';

/** Colores de acento por categoría, solo para que el panel se lea de un
 *  vistazo (mismo tipo → mismo color de icono/etiqueta). Si aparece una
 *  categoría nueva que no está en esta lista, cae a un gris neutro. */
const COLOR_POR_TIPO: Record<string, { bg: string; text: string }> = {
  'Aceites y lubricantes': { bg: 'bg-amber-100', text: 'text-amber-700' },
  Filtros: { bg: 'bg-sky-100', text: 'text-sky-700' },
  Frenos: { bg: 'bg-rose-100', text: 'text-rose-700' },
  Neumáticos: { bg: 'bg-slate-200', text: 'text-slate-700' },
  'Correas y transmisión': { bg: 'bg-violet-100', text: 'text-violet-700' },
  Encendido: { bg: 'bg-orange-100', text: 'text-orange-700' },
  Eléctrico: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  'Suspensión y dirección': { bg: 'bg-teal-100', text: 'text-teal-700' },
  Refrigeración: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  Escape: { bg: 'bg-stone-200', text: 'text-stone-700' },
  'Limpieza y consumibles': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
};

function colorTipo(tipo: string) {
  return COLOR_POR_TIPO[tipo] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
}

interface NuevoItemForm {
  nombre: string;
  tipo: string;
  tamano: string;
  cantidad: string;
  imagenFile: File | null;
  imagenPreview: string | null;
}

const FORM_VACIO: NuevoItemForm = {
  nombre: '',
  tipo: '',
  tamano: '',
  cantidad: '1',
  imagenFile: null,
  imagenPreview: null,
};

interface InventoryPanelProps {
  /** Un mecánico puede CONSULTAR el inventario (para saber si hay stock
   *  antes de empezar un trabajo), pero solo el encargado puede
   *  añadir/editar/borrar items o almacenes, ajustar cantidades o tocar
   *  precios — igual que ya impone la RLS de Supabase (ver schema.sql:
   *  "Encargado Inventario crea/actualiza/borra"). Sin este prop (o en
   *  false) el panel se muestra en modo solo lectura. */
  esEncargado: boolean;
}

/**
 * Inventario/almacén de repuestos y materiales del taller. Es un catálogo
 * propio del taller (no depende de clientes ni órdenes de trabajo): viene
 * precargado con un catálogo inicial habitual, y el propio personal puede
 * añadir lo que le falte, con una foto opcional para distinguir piezas
 * parecidas. Un taller puede tener más de un almacén/nave (p. ej. una
 * cadena con varios locales) — cada uno con su propio stock independiente;
 * si solo hay uno ("Almacén 1", el que se crea por defecto) no se muestra
 * ningún selector, para no complicar la pantalla a quien no lo necesita.
 */
export default function InventoryPanel({ esEncargado }: InventoryPanelProps) {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [almacenActivo, setAlmacenActivo] = useState<string | null>(null);
  const [nuevoAlmacenAbierto, setNuevoAlmacenAbierto] = useState(false);
  const [nombreNuevoAlmacen, setNombreNuevoAlmacen] = useState('');
  const [creandoAlmacen, setCreandoAlmacen] = useState(false);

  const [items, setItems] = useState<InventarioItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloPocoStock, setSoloPocoStock] = useState(false);
  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState<NuevoItemForm>(FORM_VACIO);
  const [guardandoItem, setGuardandoItem] = useState(false);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  // Edición/borrado de items ya existentes (dar de alta usa `form` arriba,
  // esto es aparte porque coexisten: se puede editar un item mientras el
  // formulario de "Nuevo item" está abierto).
  const [itemEditando, setItemEditando] = useState<string | null>(null);
  const [formEdicion, setFormEdicion] = useState<NuevoItemForm & { imagenUrlActual: string | null }>({
    ...FORM_VACIO,
    imagenUrlActual: null,
  });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [confirmandoBorradoId, setConfirmandoBorradoId] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  // Precios de inventario — pantalla solo accesible al encargado (ver
  // App.tsx: la pestaña "Inventario" ni siquiera se muestra a un
  // mecánico), así que aquí no hace falta ningún gating adicional; la RLS
  // de `inventario_precios` (solo encargado) es la barrera real. Se
  // guarda aparte de `items` porque vive en su propia tabla — ver
  // supabase/schema.sql.
  const [precios, setPrecios] = useState<Record<string, number>>({});
  const [editandoPrecioId, setEditandoPrecioId] = useState<string | null>(null);
  const [precioForm, setPrecioForm] = useState('');
  const [guardandoPrecio, setGuardandoPrecio] = useState(false);

  const cargarPrecios = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('inventario_precios')
      .select('item_id, precio_unitario');
    if (fetchError) return; // sin ruido: si aún no se ejecutó la migración, simplemente no se ven precios
    const mapa: Record<string, number> = {};
    for (const fila of data ?? []) {
      mapa[(fila as { item_id: string }).item_id] = Number((fila as { precio_unitario: number }).precio_unitario);
    }
    setPrecios(mapa);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarPrecios();
  }, [cargarPrecios]);

  const abrirEdicionPrecio = (item: InventarioItem) => {
    setEditandoPrecioId(item.id);
    setPrecioForm(precios[item.id] != null ? String(precios[item.id]) : '');
  };

  const guardarPrecio = async (itemId: string) => {
    const valor = Number(precioForm.replace(',', '.'));
    if (Number.isNaN(valor) || valor < 0) {
      setError('El precio debe ser un número válido.');
      return;
    }
    setGuardandoPrecio(true);
    setError(null);
    const { error: upsertError } = await supabase
      .from('inventario_precios')
      .upsert({ item_id: itemId, precio_unitario: valor });
    setGuardandoPrecio(false);
    if (upsertError) {
      setError(`No se pudo guardar el precio: ${upsertError.message}`);
      return;
    }
    setPrecios((prev) => ({ ...prev, [itemId]: valor }));
    setEditandoPrecioId(null);
  };

  const cargarAlmacenes = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('almacenes')
      .select('id, nombre, created_at')
      .order('created_at', { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    const lista = (data ?? []) as Almacen[];
    setAlmacenes(lista);
    setAlmacenActivo((actual) => actual ?? lista[0]?.id ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarAlmacenes();
  }, [cargarAlmacenes]);

  const cargarInventario = useCallback(async () => {
    if (!almacenActivo) return;
    setCargando(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('inventario_items')
      .select('id, nombre, tipo, tamano, cantidad, imagen_url, almacen_id')
      .eq('almacen_id', almacenActivo)
      .order('tipo', { ascending: true })
      .order('nombre', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setItems((data ?? []) as InventarioItem[]);
    }
    setCargando(false);
  }, [almacenActivo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarInventario();
  }, [cargarInventario]);

  const crearAlmacen = async (e: FormEvent) => {
    e.preventDefault();
    const nombre = nombreNuevoAlmacen.trim() || `Almacén ${almacenes.length + 1}`;
    setCreandoAlmacen(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('almacenes')
      .insert({ nombre })
      .select()
      .single();
    setCreandoAlmacen(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    const nuevo = data as Almacen;
    setAlmacenes((prev) => [...prev, nuevo]);
    setAlmacenActivo(nuevo.id);
    setNombreNuevoAlmacen('');
    setNuevoAlmacenAbierto(false);
  };

  const tiposExistentes = useMemo(
    () => Array.from(new Set(items.map((i) => i.tipo))).sort(),
    [items],
  );

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = soloPocoStock ? items.filter((i) => i.cantidad <= 3) : items;
    if (!q) return base;
    return base.filter(
      (i) => i.nombre.toLowerCase().includes(q) || i.tipo.toLowerCase().includes(q),
    );
  }, [items, busqueda, soloPocoStock]);

  const agotados = useMemo(() => items.filter((i) => i.cantidad === 0).length, [items]);
  const pocasUnidades = useMemo(
    () => items.filter((i) => i.cantidad > 0 && i.cantidad <= 3).length,
    [items],
  );

  const grupos = useMemo(() => {
    const mapa = new Map<string, InventarioItem[]>();
    for (const item of itemsFiltrados) {
      const lista = mapa.get(item.tipo) ?? [];
      lista.push(item);
      mapa.set(item.tipo, lista);
    }
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [itemsFiltrados]);

  const ajustarCantidad = async (item: InventarioItem, delta: number) => {
    const nuevaCantidad = Math.max(0, item.cantidad + delta);
    setActualizandoId(item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, cantidad: nuevaCantidad } : i)));
    const { error: updateError } = await supabase
      .from('inventario_items')
      .update({ cantidad: nuevaCantidad })
      .eq('id', item.id);
    setActualizandoId(null);
    if (updateError) {
      setError(updateError.message);
      // revierte el cambio optimista si falló en el servidor
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, cantidad: item.cantidad } : i)));
    }
  };

  const handleImagenSeleccionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm((prev) => ({ ...prev, imagenFile: file, imagenPreview: URL.createObjectURL(file) }));
  };

  const handleCrearItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.tipo.trim()) {
      setError('El nombre y la categoría del item son obligatorios.');
      return;
    }
    if (!almacenActivo) {
      setError('No hay ningún almacén seleccionado.');
      return;
    }
    setGuardandoItem(true);
    setError(null);
    try {
      let imagenUrl: string | null = null;
      if (form.imagenFile) {
        const ruta = `${crypto.randomUUID()}-${form.imagenFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKETS.inventarioImagenes)
          .upload(ruta, form.imagenFile, { upsert: true });
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKETS.inventarioImagenes).getPublicUrl(ruta);
        imagenUrl = publicUrl;
      }

      const { data, error: insertError } = await supabase
        .from('inventario_items')
        .insert({
          nombre: form.nombre.trim(),
          tipo: form.tipo.trim(),
          tamano: form.tamano.trim() || null,
          cantidad: Number(form.cantidad) || 0,
          imagen_url: imagenUrl,
          almacen_id: almacenActivo,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      setItems((prev) => [...prev, data as InventarioItem]);
      setForm(FORM_VACIO);
      setFormAbierto(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo añadir el item: ${err.message}`
          : 'No se pudo añadir el item.',
      );
    } finally {
      setGuardandoItem(false);
    }
  };

  const abrirEdicion = (item: InventarioItem) => {
    setConfirmandoBorradoId(null);
    setItemEditando(item.id);
    setFormEdicion({
      nombre: item.nombre,
      tipo: item.tipo,
      tamano: item.tamano ?? '',
      cantidad: String(item.cantidad),
      imagenFile: null,
      imagenPreview: null,
      imagenUrlActual: item.imagen_url,
    });
  };

  const cerrarEdicion = () => {
    setItemEditando(null);
    setFormEdicion({ ...FORM_VACIO, imagenUrlActual: null });
  };

  const handleImagenEdicionSeleccionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormEdicion((prev) => ({ ...prev, imagenFile: file, imagenPreview: URL.createObjectURL(file) }));
  };

  const quitarImagenEdicion = () => {
    setFormEdicion((prev) => ({ ...prev, imagenFile: null, imagenPreview: null, imagenUrlActual: null }));
  };

  const guardarEdicion = async (e: FormEvent, item: InventarioItem) => {
    e.preventDefault();
    if (!formEdicion.nombre.trim() || !formEdicion.tipo.trim()) {
      setError('El nombre y la categoría del item son obligatorios.');
      return;
    }
    setGuardandoEdicion(true);
    setError(null);
    try {
      let imagenUrl = formEdicion.imagenUrlActual;
      if (formEdicion.imagenFile) {
        const ruta = `${crypto.randomUUID()}-${formEdicion.imagenFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKETS.inventarioImagenes)
          .upload(ruta, formEdicion.imagenFile, { upsert: true });
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKETS.inventarioImagenes).getPublicUrl(ruta);
        imagenUrl = publicUrl;
      }

      const { data, error: updateError } = await supabase
        .from('inventario_items')
        .update({
          nombre: formEdicion.nombre.trim(),
          tipo: formEdicion.tipo.trim(),
          tamano: formEdicion.tamano.trim() || null,
          cantidad: Number(formEdicion.cantidad) || 0,
          imagen_url: imagenUrl,
        })
        .eq('id', item.id)
        .select()
        .single();
      if (updateError) throw updateError;

      setItems((prev) => prev.map((i) => (i.id === item.id ? (data as InventarioItem) : i)));
      cerrarEdicion();
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo guardar el item: ${err.message}`
          : 'No se pudo guardar el item.',
      );
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const borrarItem = async (item: InventarioItem) => {
    setBorrandoId(item.id);
    setError(null);
    const { error: deleteError } = await supabase.from('inventario_items').delete().eq('id', item.id);
    setBorrandoId(null);
    if (deleteError) {
      setError(`No se pudo borrar el item: ${deleteError.message}`);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setConfirmandoBorradoId(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
            <p className="text-sm text-gray-500">Repuestos y materiales disponibles en el taller.</p>
            {(agotados > 0 || pocasUnidades > 0) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {agotados > 0 && (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    {agotados} agotado{agotados !== 1 ? 's' : ''}
                  </span>
                )}
                {pocasUnidades > 0 && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    {pocasUnidades} con pocas unidades
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {esEncargado && (
          <button
            type="button"
            onClick={() => setFormAbierto((v) => !v)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Añadir item
          </button>
        )}
      </header>
      {!esEncargado && (
        <p className="mb-5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Modo consulta: puedes ver el stock disponible, pero solo el encargado puede añadir,
          editar o ajustar cantidades.
        </p>
      )}

      {/* Selector de almacén: solo se muestra si hay más de uno — un taller
          de una sola nave no ve ningún control adicional aquí. */}
      {(almacenes.length > 1 || nuevoAlmacenAbierto) && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Warehouse className="h-3.5 w-3.5" /> Almacén:
          </span>
          {almacenes.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAlmacenActivo(a.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                almacenActivo === a.id
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {a.nombre}
            </button>
          ))}
          {esEncargado &&
            (nuevoAlmacenAbierto ? (
              <form onSubmit={crearAlmacen} className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={nombreNuevoAlmacen}
                  onChange={(e) => setNombreNuevoAlmacen(e.target.value)}
                  placeholder={`Almacén ${almacenes.length + 1}`}
                  className="rounded-full border border-gray-300 px-3 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={creandoAlmacen}
                  className="rounded-full bg-gray-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {creandoAlmacen ? '...' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => setNuevoAlmacenAbierto(false)}
                  className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100"
                  aria-label="Cancelar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setNuevoAlmacenAbierto(true)}
                className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
              >
                <Plus className="h-3.5 w-3.5" /> Nuevo almacén
              </button>
            ))}
        </div>
      )}
      {esEncargado && almacenes.length === 1 && !nuevoAlmacenAbierto && (
        <button
          type="button"
          onClick={() => setNuevoAlmacenAbierto(true)}
          className="mb-5 flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
        >
          <Warehouse className="h-3.5 w-3.5" />
          ¿Más de una nave? Añadir otro almacén
        </button>
      )}

      {formAbierto && (
        <form
          onSubmit={handleCrearItem}
          className="mb-6 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Nuevo item de inventario</h2>
            <button
              type="button"
              onClick={() => setFormAbierto(false)}
              className="rounded-full p-1 text-gray-400 hover:bg-white hover:text-gray-600"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {almacenes.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Almacén</label>
              <select
                value={almacenActivo ?? ''}
                onChange={(e) => setAlmacenActivo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:w-64"
              >
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ej. Pastillas de freno delanteras"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Categoría <span className="text-red-500">*</span>
              </label>
              <input
                value={form.tipo}
                onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))}
                required
                list="tipos-existentes"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ej. Frenos"
              />
              <datalist id="tipos-existentes">
                {tiposExistentes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Talla / medida (opcional)
              </label>
              <input
                value={form.tamano}
                onChange={(e) => setForm((p) => ({ ...p, tamano: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ej. 205/55 R16"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cantidad</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.cantidad}
                onChange={(e) => setForm((p) => ({ ...p, cantidad: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Foto del item (opcional, para distinguirlo de otros parecidos)
            </label>
            <div className="flex items-center gap-3">
              {form.imagenPreview && (
                <img
                  src={form.imagenPreview}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                />
              )}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:border-gray-400">
                <ImagePlus className="h-4 w-4" />
                {form.imagenPreview ? 'Cambiar foto' : 'Añadir foto'}
                <input type="file" accept="image/*" onChange={handleImagenSeleccionada} className="hidden" />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={guardandoItem}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {guardandoItem && <Loader2 className="h-4 w-4 animate-spin" />}
            {guardandoItem ? 'Guardando...' : 'Guardar item'}
          </button>
        </form>
      )}

      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o categoría..."
            className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setSoloPocoStock((v) => !v)}
          className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-sm transition ${
            soloPocoStock
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Poco stock
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando inventario...
        </p>
      ) : grupos.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          No se encontraron items{busqueda ? ' para esa búsqueda' : ''}.
        </p>
      ) : (
        <div className="space-y-8">
          {grupos.map(([tipo, itemsGrupo]) => {
            const color = colorTipo(tipo);
            return (
              <section key={tipo}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <span className={`h-2.5 w-2.5 rounded-full ${color.bg}`} />
                  {tipo}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">
                    {itemsGrupo.length}
                  </span>
                </h2>
                {/* Tarjetas más grandes y en menos columnas que antes: el
                    nombre del item ya no se corta con "..." cuando es
                    largo — se permite que ocupe 2 líneas en vez de
                    truncarse en una sola. */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {itemsGrupo.map((item) =>
                    itemEditando === item.id ? (
                      <form
                        key={item.id}
                        onSubmit={(e) => guardarEdicion(e, item)}
                        className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:col-span-2"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-800">Editar item</h3>
                          <button
                            type="button"
                            onClick={cerrarEdicion}
                            className="rounded-full p-1 text-gray-400 hover:bg-white hover:text-gray-600"
                            aria-label="Cancelar edición"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Nombre</label>
                            <input
                              value={formEdicion.nombre}
                              onChange={(e) => setFormEdicion((p) => ({ ...p, nombre: e.target.value }))}
                              required
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Categoría</label>
                            <input
                              value={formEdicion.tipo}
                              onChange={(e) => setFormEdicion((p) => ({ ...p, tipo: e.target.value }))}
                              required
                              list="tipos-existentes"
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                              Talla / medida
                            </label>
                            <input
                              value={formEdicion.tamano}
                              onChange={(e) => setFormEdicion((p) => ({ ...p, tamano: e.target.value }))}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">Cantidad</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={formEdicion.cantidad}
                              onChange={(e) => setFormEdicion((p) => ({ ...p, cantidad: e.target.value }))}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-medium text-gray-700">Foto</label>
                          <div className="flex items-center gap-3">
                            {formEdicion.imagenPreview || formEdicion.imagenUrlActual ? (
                              <img
                                src={formEdicion.imagenPreview ?? formEdicion.imagenUrlActual ?? undefined}
                                alt=""
                                className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
                              />
                            ) : (
                              <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                                <Package className="h-5 w-5" />
                              </span>
                            )}
                            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-gray-400">
                              <ImagePlus className="h-3.5 w-3.5" />
                              {formEdicion.imagenUrlActual || formEdicion.imagenPreview
                                ? 'Cambiar foto'
                                : 'Añadir foto'}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImagenEdicionSeleccionada}
                                className="hidden"
                              />
                            </label>
                            {(formEdicion.imagenUrlActual || formEdicion.imagenPreview) && (
                              <button
                                type="button"
                                onClick={quitarImagenEdicion}
                                className="text-xs font-medium text-gray-400 hover:text-red-600"
                              >
                                Quitar foto
                              </button>
                            )}
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
                    ) : (
                      <div
                        key={item.id}
                        // En móvil se apila en dos filas (foto+nombre arriba,
                        // controles de cantidad/edición abajo, alineados a la
                        // derecha) en vez de forzar todo en una sola fila: con
                        // 10 pestañas y controles a la derecha no queda ancho
                        // suficiente para el nombre y el texto se partía
                        // letra por letra. A partir de `sm` vuelve a ser una
                        // sola fila horizontal como antes.
                        className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-4">
                        {item.imagen_url ? (
                          <img
                            src={item.imagen_url}
                            alt=""
                            className="h-16 w-16 shrink-0 rounded-lg border border-gray-100 object-cover"
                          />
                        ) : (
                          <span
                            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg ${color.bg} ${color.text}`}
                          >
                            <Package className="h-6 w-6" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-base font-medium leading-snug text-gray-900">
                            {item.nombre}
                          </p>
                          {item.tamano && <p className="text-sm text-gray-500">{item.tamano}</p>}
                          {esEncargado &&
                          (editandoPrecioId === item.id ? (
                            <div className="mt-1 flex items-center gap-1.5">
                              <input
                                autoFocus
                                type="number"
                                min={0}
                                step="0.01"
                                value={precioForm}
                                onChange={(e) => setPrecioForm(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && guardarPrecio(item.id)}
                                className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-xs"
                                placeholder="0.00"
                              />
                              <button
                                type="button"
                                onClick={() => guardarPrecio(item.id)}
                                disabled={guardandoPrecio}
                                className="rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditandoPrecioId(null)}
                                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
                                aria-label="Cancelar"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => abrirEdicionPrecio(item)}
                              className="mt-1 flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-emerald-600"
                              title="Editar precio unitario"
                            >
                              <Euro className="h-3 w-3" />
                              {precios[item.id] != null ? `${precios[item.id].toFixed(2)} €/ud` : 'Añadir precio'}
                            </button>
                          ))}
                          {item.cantidad === 0 ? (
                            <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                              Agotado
                            </span>
                          ) : (
                            item.cantidad <= 3 && (
                              <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                Pocas unidades
                              </span>
                            )
                          )}
                        </div>
                        </div>
                        {!esEncargado ? (
                          <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-base font-semibold text-gray-700">
                              {item.cantidad}
                            </span>
                          </div>
                        ) : confirmandoBorradoId === item.id ? (
                          <div className="flex shrink-0 flex-col items-end gap-1 self-end sm:flex-row sm:items-center sm:self-auto">
                            <span className="text-xs text-gray-500">¿Borrar item?</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => borrarItem(item)}
                                disabled={borrandoId === item.id}
                                className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                              >
                                {borrandoId === item.id ? '...' : 'Sí, borrar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmandoBorradoId(null)}
                                className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => ajustarCantidad(item, -1)}
                              disabled={actualizandoId === item.id || item.cantidad === 0}
                              className="rounded-full border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                              aria-label="Quitar una unidad"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-7 text-center text-base font-semibold text-gray-900">
                              {item.cantidad}
                            </span>
                            <button
                              type="button"
                              onClick={() => ajustarCantidad(item, 1)}
                              disabled={actualizandoId === item.id}
                              className="rounded-full border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                              aria-label="Añadir una unidad"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                            <span className="mx-1 h-5 w-px bg-gray-200" />
                            <button
                              type="button"
                              onClick={() => abrirEdicion(item)}
                              className="rounded-full border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
                              aria-label="Editar item"
                              title="Editar item"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoBorradoId(item.id)}
                              className="rounded-full border border-gray-200 p-1.5 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                              aria-label="Borrar item"
                              title="Borrar item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
