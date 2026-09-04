import { pdf } from '@react-pdf/renderer';
import { createElement } from 'react';
import { supabase, BUCKETS } from './supabase';
import InspectionReportPdf from '../components/InspectionReportPdf';
import { renderDamageSchemaImage } from './renderDamageSchema';
import type { DanoMarcador, NivelCombustible, TipoServicio, TipoVehiculo } from './types';

interface GenerarInformeParams {
  ordenId: string;
  matricula: string;
  cliente: { nombre: string; dni: string; telefono: string; email?: string | null };
  vehiculo: { matricula: string; marca?: string; modelo?: string };
  tipoVehiculo: TipoVehiculo;
  tipoServicio: TipoServicio;
  descripcionAveria?: string;
  kilometraje: number;
  nivelCombustible: NivelCombustible;
  fotos: string[];
  danos: DanoMarcador[];
  observaciones?: string;
  firmaUrl: string;
}

/** Fecha/hora local en formato compacto y ordenable, p. ej. "20260826-2148". */
function formatFechaArchivo(fecha: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${fecha.getFullYear()}${pad(fecha.getMonth() + 1)}${pad(fecha.getDate())}-${pad(fecha.getHours())}${pad(fecha.getMinutes())}`;
}

/**
 * Genera el PDF del informe de inspección en el navegador (client-side, sin
 * backend) y lo sube al bucket 'documentos-pdf'. Devuelve la URL pública.
 */
export async function generarYSubirInformePdf(params: GenerarInformeParams): Promise<string> {
  const fecha = new Date();
  const esquemaImagenUrl = await renderDamageSchemaImage(params.danos, params.tipoVehiculo);

  const documento = createElement(InspectionReportPdf, {
    cliente: params.cliente,
    vehiculo: params.vehiculo,
    tipoServicio: params.tipoServicio,
    descripcionAveria: params.descripcionAveria,
    kilometraje: params.kilometraje,
    nivelCombustible: params.nivelCombustible,
    fotos: params.fotos,
    danos: params.danos,
    observaciones: params.observaciones,
    esquemaImagenUrl,
    firmaUrl: params.firmaUrl,
    fecha,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(documento as any).toBlob();

  const nombreArchivo = `${params.matricula}/${formatFechaArchivo(fecha)}-informe-entrada-${params.ordenId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKETS.documentosPdf)
    .upload(nombreArchivo, blob, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKETS.documentosPdf).getPublicUrl(nombreArchivo);

  return publicUrl;
}
