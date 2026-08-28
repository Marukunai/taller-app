import { pdf } from '@react-pdf/renderer';
import { createElement } from 'react';
import { supabase, BUCKETS } from './supabase';
import FacturaPdf from '../components/FacturaPdf';

interface LineaFactura {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

interface GenerarFacturaParams {
  ordenId: string;
  matricula: string;
  cliente: { nombre: string; telefono?: string | null };
  vehiculo: { matricula: string; marca?: string | null; modelo?: string | null };
  conceptoManoObra: string | null;
  precioManoObra: number;
  piezas: LineaFactura[];
}

/** Fecha/hora local en formato compacto y ordenable, p. ej. "20260826-2148". */
function formatFechaArchivo(fecha: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${fecha.getFullYear()}${pad(fecha.getMonth() + 1)}${pad(fecha.getDate())}-${pad(fecha.getHours())}${pad(fecha.getMinutes())}`;
}

/**
 * Genera el PDF de la factura/presupuesto interno final (a partir de un
 * Presupuesto aprobado) y lo sube al bucket 'documentos-pdf'. Se llama al
 * ENTREGAR el vehículo (checkout), análogo a generarYSubirInformeSalida.
 * Devuelve la URL pública.
 */
export async function generarYSubirFactura(params: GenerarFacturaParams): Promise<string> {
  const fecha = new Date();

  const documento = createElement(FacturaPdf, {
    cliente: params.cliente,
    vehiculo: params.vehiculo,
    fecha,
    conceptoManoObra: params.conceptoManoObra,
    precioManoObra: params.precioManoObra,
    piezas: params.piezas,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(documento as any).toBlob();

  const nombreArchivo = `${params.matricula}/${formatFechaArchivo(fecha)}-factura-${params.ordenId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKETS.documentosPdf)
    .upload(nombreArchivo, blob, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKETS.documentosPdf).getPublicUrl(nombreArchivo);

  return publicUrl;
}
