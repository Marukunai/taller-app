// Datos de referencia para los `<datalist>` de vehículo/neumático del
// Check-in (y, en el caso de fabricante/modelo, también de las pantallas
// donde se registra una Solicitud de cita). Son listas de SUGERENCIA para
// rellenar más rápido con el teclado del móvil — nunca una restricción: en
// todos los campos que usan estas listas el `<input>` sigue siendo de texto
// libre (con su propio `<datalist>` asociado por `list=`), así que se puede
// escribir cualquier valor que no aparezca aquí sin que el formulario lo
// rechace. No pretenden ser exhaustivas, solo cubrir los fabricantes/modelos
// más habituales en un taller en España.

/** Fabricantes más habituales, en orden alfabético. */
export const FABRICANTES: string[] = [
  'Alfa Romeo',
  'Audi',
  'BMW',
  'Citroën',
  'Cupra',
  'Dacia',
  'DS',
  'Fiat',
  'Ford',
  'Honda',
  'Hyundai',
  'Jeep',
  'Kia',
  'Land Rover',
  'Lexus',
  'Mazda',
  'Mercedes-Benz',
  'MG',
  'Mini',
  'Mitsubishi',
  'Nissan',
  'Opel',
  'Peugeot',
  'Porsche',
  'Renault',
  'Seat',
  'Škoda',
  'Subaru',
  'Suzuki',
  'Tesla',
  'Toyota',
  'Volkswagen',
  'Volvo',
];

/** Modelos habituales por fabricante — solo se usa para rellenar el
 *  `<datalist>` del campo "Modelo" en función del fabricante ya escrito en
 *  "Marca" (comparación sin distinguir mayúsculas/acentos, ver
 *  `modelosParaFabricante` más abajo). Un fabricante que no esté aquí (o un
 *  modelo que no esté en su lista) simplemente no ofrece sugerencias, sin
 *  bloquear nada. */
const MODELOS_POR_FABRICANTE: Record<string, string[]> = {
  'alfa romeo': ['Giulia', 'Giulietta', 'Stelvio', 'Tonale', 'MiTo'],
  audi: ['A1', 'A3', 'A4', 'A5', 'A6', 'Q2', 'Q3', 'Q5', 'Q7', 'TT', 'e-tron'],
  bmw: ['Serie 1', 'Serie 2', 'Serie 3', 'Serie 4', 'Serie 5', 'X1', 'X2', 'X3', 'X5', 'i3', 'i4'],
  'citroën': ['C3', 'C4', 'C5 Aircross', 'Berlingo', 'C1', 'C3 Aircross', 'e-C4'],
  cupra: ['Leon', 'Formentor', 'Ateca', 'Born', 'Tavascan'],
  dacia: ['Sandero', 'Duster', 'Jogger', 'Spring', 'Logan'],
  ds: ['DS3', 'DS4', 'DS7'],
  fiat: ['500', '500X', 'Panda', 'Tipo', 'Punto', 'Doblo'],
  ford: ['Fiesta', 'Focus', 'Kuga', 'Puma', 'EcoSport', 'Mondeo', 'Transit'],
  honda: ['Civic', 'CR-V', 'Jazz', 'HR-V', 'e'],
  hyundai: ['i10', 'i20', 'i30', 'Tucson', 'Kona', 'Santa Fe'],
  jeep: ['Renegade', 'Compass', 'Cherokee', 'Wrangler'],
  kia: ['Picanto', 'Rio', 'Ceed', 'Sportage', 'Niro', 'Stonic', 'Sorento'],
  'land rover': ['Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Evoque', 'Defender'],
  lexus: ['CT', 'IS', 'NX', 'RX', 'UX'],
  mazda: ['Mazda2', 'Mazda3', 'CX-3', 'CX-30', 'CX-5', 'MX-5'],
  'mercedes-benz': ['Clase A', 'Clase B', 'Clase C', 'Clase E', 'GLA', 'GLC', 'Vito', 'Sprinter'],
  mg: ['MG3', 'MG4', 'ZS', 'HS'],
  mini: ['Cooper', 'Countryman', 'Clubman'],
  mitsubishi: ['Space Star', 'ASX', 'Eclipse Cross', 'Outlander', 'L200'],
  nissan: ['Micra', 'Juke', 'Qashqai', 'X-Trail', 'Leaf', 'Navara'],
  opel: ['Corsa', 'Astra', 'Mokka', 'Crossland', 'Grandland', 'Combo'],
  peugeot: ['108', '208', '308', '2008', '3008', '5008', 'Partner'],
  porsche: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
  renault: ['Clio', 'Captur', 'Megane', 'Kadjar', 'Arkana', 'Twingo', 'Scenic', 'Kangoo'],
  seat: ['Ibiza', 'Leon', 'Arona', 'Ateca', 'Tarraco'],
  'škoda': ['Fabia', 'Octavia', 'Kamiq', 'Karoq', 'Kodiaq', 'Scala'],
  subaru: ['Impreza', 'XV', 'Forester', 'Outback'],
  suzuki: ['Swift', 'Vitara', 'S-Cross', 'Ignis', 'Jimny'],
  tesla: ['Model 3', 'Model S', 'Model X', 'Model Y'],
  toyota: ['Yaris', 'Corolla', 'C-HR', 'RAV4', 'Aygo', 'Camry', 'Hilux'],
  volkswagen: ['Polo', 'Golf', 'Tiguan', 'T-Roc', 'Passat', 'T-Cross', 'Touran', 'Caddy'],
  volvo: ['V40', 'V60', 'XC40', 'XC60', 'XC90'],
};

/** Devuelve las sugerencias de modelo para el fabricante ya escrito (si lo
 *  reconoce) o una lista vacía — nunca lanza ni bloquea, es solo para
 *  rellenar el `<datalist>` del campo "Modelo". */
export function modelosParaFabricante(fabricante: string): string[] {
  const clave = fabricante.trim().toLowerCase();
  return MODELOS_POR_FABRICANTE[clave] ?? [];
}

/** Tipos de combustible habituales. */
export const COMBUSTIBLES: string[] = [
  'Gasolina',
  'Diésel',
  'Híbrido',
  'Híbrido enchufable',
  'Eléctrico',
  'GLP (autogás)',
  'GNC',
];

/** Años de modelo, del más reciente al más antiguo — hasta el año que viene
 *  (por si ya se vende el modelo del año siguiente) y 35 años atrás, más que
 *  de sobra para un taller normal. */
export function aniosVehiculo(): string[] {
  const actual = new Date().getFullYear();
  const anios: string[] = [];
  for (let a = actual + 1; a >= actual - 35; a--) {
    anios.push(String(a));
  }
  return anios;
}

/** Ejemplos de "prestaciones del motor" (cilindrada + potencia) — es el
 *  campo con menos posibilidad de tener una lista cerrada real (varía por
 *  marca/modelo/año), así que esto es solo un puñado de formatos habituales
 *  a modo de plantilla; se espera que la mayoría de las veces se escriba a
 *  mano un valor que no está aquí. */
export const PRESTACIONES_MOTOR_SUGERENCIAS: string[] = [
  '1.0 65CV',
  '1.2 TSI 110CV',
  '1.4 TSI 150CV',
  '1.5 dCi 115CV',
  '1.5 TDI 115CV',
  '1.6 TDI 115CV',
  '1.6 TDI 120CV',
  '1.9 TDI 105CV',
  '2.0 TDI 150CV',
  '2.0 TDI 190CV',
  '2.0 TSI 190CV',
  'Híbrido 1.8 122CV',
  'Eléctrico',
];

/** Anchos de neumático habituales (mm). */
export const NEUMATICO_ANCHOS: string[] = [
  '145', '155', '165', '175', '185', '195', '205', '215', '225', '235', '245', '255', '265', '275', '285', '295', '305', '315',
];

/** Perfiles (altura del flanco, % del ancho) habituales. */
export const NEUMATICO_PERFILES: string[] = [
  '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80',
];

/** Diámetros de llanta habituales (pulgadas). */
export const NEUMATICO_LLANTAS: string[] = [
  '13', '14', '15', '16', '17', '18', '19', '20', '21', '22',
];

/** Índices de carga habituales (código numérico ETRTO). */
export const NEUMATICO_INDICES_CARGA: string[] = [
  '62', '65', '68', '71', '75', '79', '82', '85', '88', '91', '94', '95', '97', '98', '100', '104', '109',
];

/** Índices de velocidad habituales (letra ETRTO). */
export const NEUMATICO_INDICES_VELOCIDAD: string[] = ['Q', 'R', 'S', 'T', 'U', 'H', 'V', 'W', 'Y'];

/** "Estación" del neumático. */
export const NEUMATICO_ESTACIONES: string[] = ['Verano', 'Invierno', 'Todo tiempo (All Season)'];
