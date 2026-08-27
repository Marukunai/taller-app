import { pdf } from '@react-pdf/renderer';
import { createElement } from 'react';
import { supabase, BUCKETS } from './supabase';
import ExitReportPdf from '../components/ExitReportPdf';
import type { TipoServicio } from './types';

interface GenerarInformeSalidaParams {
  ordenId: string;
  matricula: string;
  cliente: { nombre: string; telefono?: string | null };
  vehiculo: { matricula: string; marca?: string | null; modelo?: string | null };
  tipoServicio: TipoServicio;
  fechaEntrada?: string | null;
  pdfEntradaUrl?: string | null;
  firmaUrl: string;
}

/** Fecha/hora local en formato compacto y ordenable, p. ej. "20260826-2148". */
function formatFechaArchivo(fecha: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${fecha.getFullYear()}${pad(fecha.getMonth() + 1)}${pad(fecha.getDate())}-${pad(fecha.getHours())}${pad(fecha.getMinutes())}`;
}

/**
 * Genera el PDF del informe de ENTREGA (checkout) en el navegador y lo sube
 * al bucket 'documentos-pdf'. Análogo a generarYSubirInformePdf (informe de
 * entrada) pero para el momento de la salida del vehículo. Devuelve la URL
 * pública.
 */
export async function generarYSubirInformeSalida(params: GenerarInformeSalidaParams): Promise<string> {
  const fecha = new Date();

  const documento = createElement(ExitReportPdf, {
    cliente: params.cliente,
    vehiculo: params.vehiculo,
    tipoServicio: params.tipoServicio,
    fechaEntrada: params.fechaEntrada ? new Date(params.fechaEntrada) : null,
    fechaEntrega: fecha,
    pdfEntradaUrl: params.pdfEntradaUrl,
    firmaUrl: params.firmaUrl,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(documento as any).toBlob();

  const nombreArchivo = `${params.matricula}/${formatFechaArchivo(fecha)}-informe-salida-${params.ordenId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKETS.documentosPdf)
    .upload(nombreArchivo, blob, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKETS.documentosPdf).getPublicUrl(nombreArchivo);

  return publicUrl;
}
