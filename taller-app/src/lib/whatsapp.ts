/**
 * Genera un enlace `wa.me` con texto pre-redactado para enviar el informe de
 * inspección por WhatsApp, sin usar la API oficial de WhatsApp Business
 * (modo demo, ver Anexo Técnico del proyecto).
 */
export function buildWhatsAppLink(params: {
  telefono?: string;
  nombreCliente: string;
  matricula: string;
  pdfUrl: string;
}): string {
  const { telefono, nombreCliente, matricula, pdfUrl } = params;

  const mensaje =
    `Hola ${nombreCliente}, aquí tienes el informe de entrada de tu vehículo ` +
    `con matrícula ${matricula}: ${pdfUrl}`;

  return `${waBase(telefono)}?text=${encodeURIComponent(mensaje)}`;
}

/** Igual que buildWhatsAppLink, pero para el informe de SALIDA (al entregar
 *  el vehículo). */
export function buildWhatsAppLinkSalida(params: {
  telefono?: string;
  nombreCliente: string;
  matricula: string;
  pdfUrl: string;
}): string {
  const { telefono, nombreCliente, matricula, pdfUrl } = params;

  const mensaje =
    `Hola ${nombreCliente}, aquí tienes el informe de entrega de tu vehículo ` +
    `con matrícula ${matricula}: ${pdfUrl}`;

  return `${waBase(telefono)}?text=${encodeURIComponent(mensaje)}`;
}

/** Enlace de WhatsApp para avisar al cliente de que su vehículo está listo,
 *  con la cita de recogida ya concertada. */
export function buildWhatsAppLinkListo(params: {
  telefono?: string;
  nombreCliente: string;
  matricula: string;
  fechaCita: Date;
}): string {
  const { telefono, nombreCliente, matricula, fechaCita } = params;

  const fechaTexto = fechaCita.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const horaTexto = fechaCita.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const mensaje =
    `Hola ${nombreCliente}, tu vehículo con matrícula ${matricula} ya está listo. ` +
    `Te esperamos para recogerlo el ${fechaTexto} a las ${horaTexto}. ¡Gracias!`;

  return `${waBase(telefono)}?text=${encodeURIComponent(mensaje)}`;
}

function waBase(telefono?: string): string {
  const telefonoNormalizado = normalizarTelefonoEs(telefono);
  return telefonoNormalizado ? `https://wa.me/${telefonoNormalizado}` : 'https://wa.me/';
}

/**
 * Normaliza un teléfono español a formato E.164 sin '+' (ej. 34600112233).
 * Si no reconoce el formato, devuelve null y se deja que el usuario elija
 * el contacto manualmente en WhatsApp.
 */
function normalizarTelefonoEs(telefono?: string): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, '');
  if (digitos.length === 9) return `34${digitos}`;
  if (digitos.length === 11 && digitos.startsWith('34')) return digitos;
  return null;
}
