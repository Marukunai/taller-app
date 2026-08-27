import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan las variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Defínelas en tu archivo .env.local (ver README.md).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Nombres de los buckets de Supabase Storage usados por la app.
// Deben crearse en el panel de Supabase (Storage) antes de usar el formulario.
export const BUCKETS = {
  fotosVehiculos: 'fotos-vehiculos',
  firmas: 'firmas',
  documentosPdf: 'documentos-pdf',
  inventarioImagenes: 'inventario-imagenes',
} as const;
