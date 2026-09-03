/**
 * Genera y descarga un archivo .ics (formato iCalendar estándar) de una
 * cita puntual — la de recogida del vehículo (`ordenes_trabajo.cita_
 * recogida`) o la propuesta para traerlo (`solicitudes.fecha_cita_
 * checkin`) — para que el cliente se la meta en su calendario (Google
 * Calendar, Apple Calendar, Outlook...) con un solo clic desde el Portal.
 * Sin librería nueva: el formato .ics es texto plano sencillo, no hace
 * falta ninguna dependencia para generarlo.
 */

/** Formatea una fecha a UTC en el formato exigido por iCalendar
 *  (YYYYMMDDTHHMMSSZ) — usar SIEMPRE UTC (sufijo Z) evita cualquier lío de
 *  zona horaria entre el navegador de quien genera el archivo y el de
 *  quien lo abre luego. */
function formatoIcsUtc(fecha: Date): string {
  return fecha.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/** Escapa los caracteres especiales del formato iCalendar (coma, punto y
 *  coma, salto de línea) en un campo de texto libre. */
function escaparTexto(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

interface EventoIcs {
  /** Título del evento (ej. "Recogida del vehículo 1234BBB — TallerGo"). */
  titulo: string;
  /** Descripción/detalle opcional. */
  descripcion?: string;
  /** Fecha/hora de inicio. */
  inicio: Date;
  /** Duración en minutos (por defecto 30). */
  duracionMinutos?: number;
  /** Ubicación opcional (ej. dirección del taller). */
  ubicacion?: string;
}

/** Construye el contenido de un archivo .ics de un único evento. */
function construirIcs(evento: EventoIcs): string {
  const fin = new Date(evento.inicio.getTime() + (evento.duracionMinutos ?? 30) * 60 * 1000);
  // UID único por evento — combina la hora de inicio con un id aleatorio,
  // suficiente para un archivo que se genera al vuelo y no se vuelve a
  // reutilizar (no hace falta que sea estable entre descargas).
  const uid = `${formatoIcsUtc(evento.inicio)}-${Math.random().toString(36).slice(2)}@tallergo`;
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TallerGo//Cita//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatoIcsUtc(new Date())}`,
    `DTSTART:${formatoIcsUtc(evento.inicio)}`,
    `DTEND:${formatoIcsUtc(fin)}`,
    `SUMMARY:${escaparTexto(evento.titulo)}`,
  ];
  if (evento.descripcion) lineas.push(`DESCRIPTION:${escaparTexto(evento.descripcion)}`);
  if (evento.ubicacion) lineas.push(`LOCATION:${escaparTexto(evento.ubicacion)}`);
  lineas.push('END:VEVENT', 'END:VCALENDAR');
  // iCalendar exige saltos de línea CRLF.
  return lineas.join('\r\n');
}

/** Genera el .ics y dispara la descarga en el navegador (crea un enlace
 *  temporal a un Blob y lo "clica" solo — patrón estándar sin librería). */
export function descargarIcs(evento: EventoIcs, nombreArchivo: string): void {
  const contenido = construirIcs(evento);
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo.endsWith('.ics') ? nombreArchivo : `${nombreArchivo}.ics`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
