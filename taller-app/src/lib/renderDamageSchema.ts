import type { DanoMarcador, TipoDano, TipoVehiculo } from './types';

const COLOR_POR_TIPO: Record<TipoDano, string> = {
  arañazo: '#f59e0b',
  abolladura: '#ef4444',
  rotura: '#8b5cf6',
};

// Mismo aspect ratio que usa cada picker y que coincide con el viewBox
// real de su SVG — SIN padding, para que la imagen llene el canvas
// exactamente igual que llena el contenedor real (ver historial de
// CarDamagePicker.tsx: un padding que no coincidiera con esta proporción
// desalinearía la imagen respecto a las coordenadas de los marcadores).
// car-schema.svg es 1536x1024 (3:2); moto-schema.svg es 1536x898.
const CANVAS_POR_TIPO: Record<TipoVehiculo, { src: string; width: number; height: number }> = {
  coche: { src: '/car-schema.svg', width: 900, height: 600 },
  moto: { src: '/moto-schema.svg', width: 900, height: 526 },
};
const MARKER_RADIUS = 10;

/**
 * Rasteriza /car-schema.svg con los marcadores de daño superpuestos y
 * devuelve un PNG en base64 (data URL) listo para incrustar en el informe
 * PDF. Cada marcador se dibuja LITERALMENTE en las coordenadas (xPct,
 * yPct) registradas por CarDamagePicker — un único punto, en la vista
 * donde se tocó, sin ningún cálculo ni proyección — así que siempre
 * coincide exactamente con lo que se ve en el esquema interactivo.
 * Devuelve null si algo falla (p. ej. entorno sin DOM) — el informe se
 * sigue generando sin la imagen, con la lista de texto como respaldo.
 */
export async function renderDamageSchemaImage(
  danos: DanoMarcador[],
  tipoVehiculo: TipoVehiculo = 'coche',
): Promise<string | null> {
  if (typeof document === 'undefined') return null;

  try {
    const { src, width: CANVAS_WIDTH, height: CANVAS_HEIGHT } = CANVAS_POR_TIPO[tipoVehiculo];
    const img = new Image();
    img.src = src;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    });

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (const dano of danos) {
      const cx = (dano.xPct / 100) * CANVAS_WIDTH;
      const cy = (dano.yPct / 100) * CANVAS_HEIGHT;
      ctx.beginPath();
      ctx.arc(cx, cy, MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_POR_TIPO[dano.tipo] ?? '#f59e0b';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
