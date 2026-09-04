// moto-schema.svg dibuja las 4 vistas de la moto (lateral izquierdo, lateral
// derecho, frontal, trasera) siempre visibles a la vez en un único SVG,
// igual que car-schema.svg — ver cabecera de carSchemaZones.ts para la
// explicación completa del criterio de diseño (un solo punto LITERAL por
// daño, dibujado tal cual donde se tocó, sin proyectarlo a las otras
// vistas; este archivo solo calcula la posición canónica de 3 ejes usada
// para el TEXTO del informe).
//
// A diferencia del coche, aquí SÍ hay dos vistas laterales reales (no una
// sola con un botón manual de "¿izquierda o derecha?"), porque el usuario
// pidió explícitamente distinguir ambos lados de la moto (caballete,
// escape, disco de freno trasero... suelen ser distintos en cada lado).
// Se identificó cuál vista es cuál mirando el dibujo: la vista con cadena/
// piñón visible en la rueda trasera y SIN tubo de escape es el lado
// IZQUIERDO; la vista con disco de freno trasero y el tubo de escape/
// silenciador visible es el lado DERECHO (convención habitual en motos
// con cadena: transmisión a la izquierda, escape a la derecha).
//
// Calibración geométrica (igual método que carSchemaZones.ts): se
// renderizó /moto-schema.svg y se analizó con Python/PIL (percentiles
// 3-97 del contorno con tinta por columna/fila, para no dejarse llevar
// por detalles finos sueltos como retrovisores o el caballete) para medir
// dónde cae la silueta de la moto en cada vista, en % del lienzo completo
// (1536×898).

export type VistaEsquemaMoto = 'lateral_izquierdo' | 'lateral_derecho' | 'frontal' | 'trasera';

export interface PosicionCanonicaMoto {
  longitudinal: number;
  lateral: number;
  altura: number;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// Bandas (%, 0-100 sobre el recuadro completo) usadas para DETECTAR en qué
// vista cae un clic. moto-schema.svg tiene 2 filas (lateral arriba,
// frontal/trasera abajo) — a diferencia del coche no hay vista cenital.
const BANDA_Y_FILA_SPLIT = 49.3;
const BANDA_X_LATERAL_SPLIT = 49.8;
const BANDA_X_INFERIOR_SPLIT = 35.0;

/** Determina en cuál de las 4 vistas cae un clic, dadas sus coordenadas en
 *  porcentaje (0-100) relativas al recuadro completo del esquema. */
export function detectarVista(xPct: number, yPct: number): VistaEsquemaMoto {
  if (yPct < BANDA_Y_FILA_SPLIT) {
    return xPct < BANDA_X_LATERAL_SPLIT ? 'lateral_izquierdo' : 'lateral_derecho';
  }
  return xPct < BANDA_X_INFERIOR_SPLIT ? 'frontal' : 'trasera';
}

// -----------------------------------------------------------------------
// Calibración geométrica de cada vista — SOLO para calcular la posición
// canónica de 3 ejes que alimenta el texto del informe (describirPosicion).
// El dibujo del marcador NO usa nada de esto — usa directamente xPct/yPct
// del clic (ver MotoDamagePicker.tsx).
const EJE_FIJO: Record<VistaEsquemaMoto, { min: number; max: number }> = {
  lateral_izquierdo: { min: 0.8, max: 46.6 },
  lateral_derecho: { min: 52.9, max: 98.2 },
  frontal: { min: 53.0, max: 97.8 },
  trasera: { min: 53.0, max: 97.8 },
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

const PERFIL_LATERAL_IZQUIERDO: Tramo[] = [
  { frac: 0.0, min: 24.5, max: 43.4 },
  { frac: 0.062, min: 24.5, max: 43.4 },
  { frac: 0.125, min: 12.2, max: 42.2 },
  { frac: 0.188, min: 7.2, max: 42.8 },
  { frac: 0.25, min: 5.5, max: 41.9 },
  { frac: 0.312, min: 10.3, max: 38.8 },
  { frac: 0.375, min: 9.6, max: 39.9 },
  { frac: 0.438, min: 8.2, max: 40.0 },
  { frac: 0.5, min: 9.4, max: 39.7 },
  { frac: 0.562, min: 11.6, max: 39.5 },
  { frac: 0.625, min: 16.5, max: 37.3 },
  { frac: 0.688, min: 15.6, max: 38.3 },
  { frac: 0.75, min: 9.5, max: 40.8 },
  { frac: 0.812, min: 9.4, max: 42.4 },
  { frac: 0.875, min: 7.8, max: 44.4 },
  { frac: 0.938, min: 13.7, max: 41.8 },
  { frac: 1.0, min: 13.7, max: 41.8 },
];

const PERFIL_LATERAL_DERECHO: Tramo[] = [
  { frac: 0.0, min: 13.9, max: 42.4 },
  { frac: 0.062, min: 13.9, max: 42.4 },
  { frac: 0.125, min: 7.6, max: 42.9 },
  { frac: 0.188, min: 9.4, max: 42.3 },
  { frac: 0.25, min: 9.3, max: 43.0 },
  { frac: 0.312, min: 15.3, max: 37.0 },
  { frac: 0.375, min: 16.7, max: 37.7 },
  { frac: 0.438, min: 15.3, max: 39.7 },
  { frac: 0.5, min: 8.3, max: 39.7 },
  { frac: 0.562, min: 8.6, max: 39.8 },
  { frac: 0.625, min: 9.5, max: 39.5 },
  { frac: 0.688, min: 9.3, max: 39.4 },
  { frac: 0.75, min: 6.0, max: 41.9 },
  { frac: 0.812, min: 8.5, max: 42.9 },
  { frac: 0.875, min: 12.3, max: 42.4 },
  { frac: 0.938, min: 24.5, max: 43.2 },
  { frac: 1.0, min: 24.5, max: 43.2 },
];

const PERFIL_FRONTAL: Tramo[] = [
  { frac: 0.0, min: 11.2, max: 28.7 },
  { frac: 0.062, min: 11.2, max: 28.7 },
  { frac: 0.125, min: 15.2, max: 24.7 },
  { frac: 0.188, min: 13.2, max: 26.6 },
  { frac: 0.25, min: 14.5, max: 25.3 },
  { frac: 0.312, min: 14.3, max: 25.5 },
  { frac: 0.375, min: 17.0, max: 22.6 },
  { frac: 0.438, min: 15.4, max: 24.4 },
  { frac: 0.5, min: 15.9, max: 23.8 },
  { frac: 0.562, min: 15.1, max: 24.5 },
  { frac: 0.625, min: 14.1, max: 25.7 },
  { frac: 0.688, min: 15.8, max: 23.8 },
  { frac: 0.75, min: 16.8, max: 22.9 },
  { frac: 0.812, min: 18.1, max: 21.5 },
  { frac: 0.875, min: 18.4, max: 21.3 },
  { frac: 0.938, min: 18.4, max: 21.3 },
  { frac: 1.0, min: 18.4, max: 21.3 },
];

const PERFIL_TRASERA: Tramo[] = [
  { frac: 0.0, min: 41.2, max: 58.3 },
  { frac: 0.062, min: 41.2, max: 58.3 },
  { frac: 0.125, min: 45.5, max: 54.0 },
  { frac: 0.188, min: 44.2, max: 55.7 },
  { frac: 0.25, min: 45.5, max: 54.0 },
  { frac: 0.312, min: 45.8, max: 53.8 },
  { frac: 0.375, min: 44.9, max: 54.7 },
  { frac: 0.438, min: 45.2, max: 54.3 },
  { frac: 0.5, min: 45.2, max: 55.7 },
  { frac: 0.562, min: 45.4, max: 55.9 },
  { frac: 0.625, min: 44.1, max: 54.3 },
  { frac: 0.688, min: 44.5, max: 54.6 },
  { frac: 0.75, min: 45.9, max: 53.1 },
  { frac: 0.812, min: 46.6, max: 51.7 },
  { frac: 0.875, min: 47.7, max: 51.7 },
  { frac: 0.938, min: 47.7, max: 51.7 },
  { frac: 1.0, min: 47.7, max: 51.7 },
];

/** Convierte un clic (vista + % dentro del recuadro completo) en una
 *  posición canónica de 3 ejes — SOLO para el texto del informe, ver
 *  cabecera del archivo. */
export function clicACanonico(vista: VistaEsquemaMoto, xPct: number, yPct: number): PosicionCanonicaMoto {
  switch (vista) {
    case 'lateral_izquierdo': {
      const eje = EJE_FIJO.lateral_izquierdo;
      const lx = clamp01((xPct - eje.min) / (eje.max - eje.min));
      // En esta vista el morro de la moto queda a la IZQUIERDA del dibujo
      // (comprobado visualmente sobre /moto-schema.svg) — lx=0 es delantera.
      const longitudinal = (1 - lx) * 100;
      const { min: yArriba, max: yAbajo } = valorPerfil(PERFIL_LATERAL_IZQUIERDO, lx);
      const ly = clamp01((yPct - yArriba) / Math.max(0.5, yAbajo - yArriba));
      return { longitudinal, lateral: 15, altura: ly * 100 };
    }
    case 'lateral_derecho': {
      const eje = EJE_FIJO.lateral_derecho;
      const lx = clamp01((xPct - eje.min) / (eje.max - eje.min));
      // Vista espejo de la anterior: aquí el morro queda a la DERECHA del
      // dibujo — lx=1 es delantera.
      const longitudinal = lx * 100;
      const { min: yArriba, max: yAbajo } = valorPerfil(PERFIL_LATERAL_DERECHO, lx);
      const ly = clamp01((yPct - yArriba) / Math.max(0.5, yAbajo - yArriba));
      return { longitudinal, lateral: 85, altura: ly * 100 };
    }
    case 'frontal': {
      const eje = EJE_FIJO.frontal;
      const ly = clamp01((yPct - eje.min) / (eje.max - eje.min));
      const { min: xIzq, max: xDer } = valorPerfil(PERFIL_FRONTAL, ly);
      const lx = clamp01((xPct - xIzq) / Math.max(0.5, xDer - xIzq));
      return { longitudinal: 92, lateral: lx * 100, altura: ly * 100 };
    }
    case 'trasera': {
      const eje = EJE_FIJO.trasera;
      const ly = clamp01((yPct - eje.min) / (eje.max - eje.min));
      const { min: xIzq, max: xDer } = valorPerfil(PERFIL_TRASERA, ly);
      const lx = clamp01((xPct - xIzq) / Math.max(0.5, xDer - xIzq));
      // Vista trasera: al mirar la moto desde atrás, izquierda/derecha del
      // dibujo queda invertido respecto al lado real del vehículo (mismo
      // criterio que carSchemaZones.ts).
      return { longitudinal: 8, lateral: (1 - lx) * 100, altura: ly * 100 };
    }
  }
}

/** Descripción corta y legible de una posición canónica, para el listado de
 *  texto del informe PDF (p. ej. "parte delantera, lado derecho") — misma
 *  lógica que describirPosicion en carSchemaZones.ts. */
export function describirPosicion(canonico: PosicionCanonicaMoto): string {
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
