// car-schema.svg dibuja las 4 vistas del coche (lateral, frontal, trasera,
// cenital) siempre visibles a la vez en un único SVG. El mecánico ve las 4
// juntas para elegir con precisión en cuál conviene tocar — cada vista
// muestra con más claridad un aspecto distinto del daño (la lateral da
// delante/detrás y altura; la frontal/trasera dan izquierda/derecha y
// altura; la cenital da delante/detrás e izquierda/derecha) — pero CADA
// DAÑO SE MARCA UNA SOLA VEZ: se dibuja un único punto, exactamente donde
// se tocó, solo en esa vista. No se intenta "reflejar" el mismo punto en
// las otras 3 vistas.
//
// Historial: la primera versión de este esquema sí intentaba reflejar el
// mismo daño en las 4 vistas a la vez, calculando por geometría la
// posición que faltaba en las otras 3. Llevó tres vueltas de ajuste (letra
// izq/der, calibración geométrica del contorno real del coche, bug de
// padding CSS) sin que el punto reflejado quedara bien colocado de forma
// fiable en las 4 vistas simultáneamente. El usuario pidió explícitamente
// mantener las 4 vistas visibles (ayudan mucho a elegir con precisión
// dónde tocar) pero SIN esa proyección cruzada — que era la fuente real
// del problema, no algo que hiciera falta seguir calibrando. Con un único
// punto LITERAL (las mismas coordenadas del clic, redibujadas tal cual, sin
// ninguna transformación) ya no hay proyección que pueda desincronizarse.

export type VistaEsquema = 'lateral' | 'frontal' | 'trasera' | 'cenital';

export interface PosicionCanonica {
  longitudinal: number;
  lateral: number;
  altura: number;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// La vista lateral (perfil del coche) es la única de las 4 que, por sí
// sola, NO puede distinguir el lado izquierdo del derecho — es un dibujo
// de un solo perfil. Como ya no se dibuja el punto en las otras vistas
// (solo se usa para el TEXTO del informe), aquí solo hace falta para que
// el informe diga "lado izquierdo/derecho" correctamente en vez de dejarlo
// en blanco cuando el daño se marcó en la vista lateral.
export type LadoLateral = 'izquierdo' | 'derecho';

export const LATERAL_POR_LADO: Record<LadoLateral, number> = {
  izquierdo: 15,
  derecho: 85,
};

// Bandas (%, 0-100 sobre el recuadro completo) usadas para DETECTAR en qué
// vista cae un clic — generosas, cubren toda la franja de cada fila del
// layout (fila superior = lateral, fila media = frontal/trasera, fila
// inferior = cenital).
const BANDA_Y_LATERAL_MAX = 32;
const BANDA_Y_MEDIA_MAX = 63;
const BANDA_X_MEDIA_SPLIT = 50;

/** Determina en cuál de las 4 vistas cae un clic, dadas sus coordenadas en
 *  porcentaje (0-100) relativas al recuadro completo del esquema. */
export function detectarVista(xPct: number, yPct: number): VistaEsquema {
  if (yPct < BANDA_Y_LATERAL_MAX) return 'lateral';
  if (yPct < BANDA_Y_MEDIA_MAX) return xPct < BANDA_X_MEDIA_SPLIT ? 'frontal' : 'trasera';
  return 'cenital';
}

// -----------------------------------------------------------------------
// Calibración geométrica de cada vista — SOLO para calcular la posición
// canónica de 3 ejes que alimenta el texto del informe (describirPosicion).
// El dibujo del marcador NO usa nada de esto — usa directamente xPct/yPct
// del clic (ver CarDamagePicker.tsx).
//
// Un coche no es rectangular: la silueta se estrecha hacia los extremos.
// Cada vista se calibra con dos ejes: uno "fijo" (recuadro simple) para el
// eje razonablemente lineal, y un "perfil" (tabla de tramos, medida
// directamente sobre /car-schema.svg renderizado a alta resolución y
// analizado con Python/PIL) para el eje que varía según la posición.
const EJE_FIJO: Record<VistaEsquema, { min: number; max: number }> = {
  lateral: { min: 12, max: 80 },
  frontal: { min: 31, max: 60 },
  trasera: { min: 31, max: 60 },
  cenital: { min: 23, max: 74 },
};

interface Tramo {
  frac: number;
  min: number;
  max: number;
}

function valorPerfil(perfil: Tramo[], frac: number): { min: number; max: number } {
  const f = clamp01(frac);
  const primero = perfil[0];
  if (f <= primero.frac) return { min: primero.min, max: primero.max };
  const ultimo = perfil[perfil.length - 1];
  if (f >= ultimo.frac) return { min: ultimo.min, max: ultimo.max };
  for (let i = 0; i < perfil.length - 1; i++) {
    const a = perfil[i];
    const b = perfil[i + 1];
    if (f >= a.frac && f <= b.frac) {
      const t = (f - a.frac) / (b.frac - a.frac);
      return { min: a.min + t * (b.min - a.min), max: a.max + t * (b.max - a.max) };
    }
  }
  return { min: ultimo.min, max: ultimo.max };
}

const PERFIL_LATERAL: Tramo[] = [
  { frac: 0.0, min: 28.4, max: 28.5 },
  { frac: 0.06, min: 28.4, max: 28.5 },
  { frac: 0.107, min: 17.1, max: 28.7 },
  { frac: 0.153, min: 14.9, max: 28.8 },
  { frac: 0.2, min: 13.4, max: 28.9 },
  { frac: 0.246, min: 12.3, max: 28.9 },
  { frac: 0.293, min: 11.8, max: 28.9 },
  { frac: 0.339, min: 11.3, max: 28.9 },
  { frac: 0.386, min: 9.0, max: 28.9 },
  { frac: 0.432, min: 6.9, max: 28.9 },
  { frac: 0.479, min: 5.2, max: 28.9 },
  { frac: 0.525, min: 4.2, max: 28.9 },
  { frac: 0.571, min: 4.1, max: 28.9 },
  { frac: 0.618, min: 4.3, max: 28.9 },
  { frac: 0.664, min: 4.9, max: 28.9 },
  { frac: 0.711, min: 5.8, max: 28.9 },
  { frac: 0.757, min: 6.8, max: 28.9 },
  { frac: 0.804, min: 7.8, max: 28.8 },
  { frac: 0.85, min: 9.1, max: 28.8 },
  { frac: 0.897, min: 9.8, max: 28.8 },
  { frac: 0.943, min: 9.7, max: 28.8 },
  { frac: 0.99, min: 28.4, max: 28.6 },
  { frac: 1.0, min: 28.4, max: 28.6 },
];

const PERFIL_FRONTAL: Tramo[] = [
  { frac: 0.0, min: 25.0, max: 34.6 },
  { frac: 0.103, min: 25.0, max: 34.6 },
  { frac: 0.158, min: 21.0, max: 38.7 },
  { frac: 0.212, min: 20.1, max: 39.6 },
  { frac: 0.267, min: 16.1, max: 43.6 },
  { frac: 0.321, min: 15.1, max: 44.7 },
  { frac: 0.375, min: 16.6, max: 43.1 },
  { frac: 0.429, min: 15.6, max: 44.1 },
  { frac: 0.483, min: 15.2, max: 44.5 },
  { frac: 0.538, min: 15.2, max: 44.5 },
  { frac: 0.592, min: 15.2, max: 44.5 },
  { frac: 0.647, min: 15.2, max: 44.5 },
  { frac: 0.701, min: 15.2, max: 44.6 },
  { frac: 0.755, min: 15.2, max: 44.6 },
  { frac: 0.809, min: 15.2, max: 44.6 },
  { frac: 0.864, min: 15.2, max: 44.5 },
  { frac: 0.918, min: 15.2, max: 44.5 },
  { frac: 0.972, min: 14.0, max: 45.7 },
  { frac: 1.0, min: 14.0, max: 45.7 },
];

const PERFIL_TRASERA: Tramo[] = [
  { frac: 0.0, min: 66.7, max: 71.9 },
  { frac: 0.107, min: 66.7, max: 71.9 },
  { frac: 0.161, min: 59.3, max: 75.7 },
  { frac: 0.215, min: 58.5, max: 76.5 },
  { frac: 0.269, min: 54.5, max: 80.5 },
  { frac: 0.323, min: 53.8, max: 81.3 },
  { frac: 0.377, min: 54.8, max: 80.2 },
  { frac: 0.431, min: 54.0, max: 81.0 },
  { frac: 0.486, min: 53.8, max: 81.2 },
  { frac: 0.54, min: 53.8, max: 81.2 },
  { frac: 0.594, min: 53.8, max: 81.2 },
  { frac: 0.648, min: 53.7, max: 81.3 },
  { frac: 0.702, min: 53.7, max: 81.3 },
  { frac: 0.756, min: 53.7, max: 81.3 },
  { frac: 0.81, min: 53.7, max: 81.3 },
  { frac: 0.864, min: 53.7, max: 81.3 },
  { frac: 0.918, min: 53.8, max: 81.2 },
  { frac: 0.972, min: 52.5, max: 82.5 },
  { frac: 1.0, min: 52.5, max: 82.5 },
];

const PERFIL_CENITAL: Tramo[] = [
  { frac: 0.0, min: 78.0, max: 81.3 },
  { frac: 0.006, min: 78.0, max: 81.3 },
  { frac: 0.056, min: 68.8, max: 90.8 },
  { frac: 0.105, min: 66.3, max: 93.2 },
  { frac: 0.155, min: 65.4, max: 94.1 },
  { frac: 0.205, min: 65.2, max: 94.2 },
  { frac: 0.255, min: 65.3, max: 94.1 },
  { frac: 0.305, min: 65.7, max: 93.8 },
  { frac: 0.355, min: 65.7, max: 93.7 },
  { frac: 0.404, min: 63.5, max: 95.9 },
  { frac: 0.454, min: 65.7, max: 93.8 },
  { frac: 0.504, min: 65.7, max: 93.8 },
  { frac: 0.554, min: 65.8, max: 93.8 },
  { frac: 0.604, min: 65.8, max: 93.8 },
  { frac: 0.653, min: 65.5, max: 94.0 },
  { frac: 0.703, min: 65.2, max: 94.4 },
  { frac: 0.753, min: 64.9, max: 94.5 },
  { frac: 0.803, min: 64.9, max: 94.6 },
  { frac: 0.853, min: 65.0, max: 94.5 },
  { frac: 0.902, min: 65.8, max: 93.8 },
  { frac: 0.952, min: 67.9, max: 91.5 },
  { frac: 1.0, min: 76.5, max: 82.8 },
];

/** Convierte un clic (vista + % dentro del recuadro completo) en una
 *  posición canónica de 3 ejes — SOLO para el texto del informe, ver
 *  cabecera del archivo. `ladoLateral` solo hace falta para clics en la
 *  vista lateral (ver comentario de LadoLateral). */
export function clicACanonico(
  vista: VistaEsquema,
  xPct: number,
  yPct: number,
  ladoLateral: LadoLateral = 'izquierdo',
): PosicionCanonica {
  switch (vista) {
    case 'lateral': {
      const eje = EJE_FIJO.lateral;
      const lx = clamp01((xPct - eje.min) / (eje.max - eje.min));
      // El morro del coche queda a la IZQUIERDA en el dibujo (comprobado
      // visualmente sobre /car-schema.svg) — lx=0 es por tanto DELANTERA.
      const longitudinal = (1 - lx) * 100;
      const { min: yArriba, max: yAbajo } = valorPerfil(PERFIL_LATERAL, lx);
      const ly = clamp01((yPct - yArriba) / Math.max(0.5, yAbajo - yArriba));
      return { longitudinal, lateral: LATERAL_POR_LADO[ladoLateral], altura: ly * 100 };
    }
    case 'frontal': {
      const eje = EJE_FIJO.frontal;
      const ly = clamp01((yPct - eje.min) / (eje.max - eje.min));
      const { min: xIzq, max: xDer } = valorPerfil(PERFIL_FRONTAL, ly);
      const lx = clamp01((xPct - xIzq) / Math.max(0.5, xDer - xIzq));
      // Vista frontal: no indica longitudinal (es una vista "de frente"),
      // pero al ser la parte delantera se aproxima cerca del extremo 100.
      return { longitudinal: 92, lateral: lx * 100, altura: ly * 100 };
    }
    case 'trasera': {
      const eje = EJE_FIJO.trasera;
      const ly = clamp01((yPct - eje.min) / (eje.max - eje.min));
      const { min: xIzq, max: xDer } = valorPerfil(PERFIL_TRASERA, ly);
      const lx = clamp01((xPct - xIzq) / Math.max(0.5, xDer - xIzq));
      // Vista trasera: al mirar el coche desde atrás, izquierda/derecha del
      // dibujo queda invertido respecto al lado real del vehículo.
      return { longitudinal: 8, lateral: (1 - lx) * 100, altura: ly * 100 };
    }
    case 'cenital': {
      const eje = EJE_FIJO.cenital;
      const lx = clamp01((xPct - eje.min) / (eje.max - eje.min));
      // Mismo criterio que en 'lateral': izquierda del dibujo = delantera.
      const longitudinal = (1 - lx) * 100;
      const { min: yArriba, max: yAbajo } = valorPerfil(PERFIL_CENITAL, lx);
      const ly = clamp01((yPct - yArriba) / Math.max(0.5, yAbajo - yArriba));
      return { longitudinal, lateral: ly * 100, altura: 50 };
    }
  }
}

/** Descripción corta y legible de una posición canónica, para el listado de
 *  texto del informe PDF (p. ej. "parte delantera, lado derecho"). */
export function describirPosicion(canonico: PosicionCanonica): string {
  const partes: string[] = [];

  if (canonico.longitudinal >= 66) partes.push('parte delantera');
  else if (canonico.longitudinal <= 33) partes.push('parte trasera');
  else partes.push('zona central');

  if (canonico.lateral >= 66) partes.push('lado derecho');
  else if (canonico.lateral <= 33) partes.push('lado izquierdo');

  if (canonico.altura <= 25) partes.push('zona alta');
  else if (canonico.altura >= 75) partes.push('bajos');

  return partes.join(', ');
}
