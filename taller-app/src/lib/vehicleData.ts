// Datos de referencia para los `<datalist>` de vehículo/neumático del
// Check-in (y, en el caso de fabricante/modelo, también de las pantallas
// donde se registra una Solicitud de cita). Son listas de SUGERENCIA para
// rellenar más rápido con el teclado del móvil — nunca una restricción: en
// todos los campos que usan estas listas el `<input>` sigue siendo de texto
// libre (con su propio `<datalist>` asociado por `list=`), así que se puede
// escribir cualquier valor que no aparezca aquí sin que el formulario lo
// rechace. No pretenden ser exhaustivas, solo cubrir los fabricantes/modelos
// más habituales en un taller en España.

/** Fabricantes, en orden alfabético — lista ampliada en el batch 19, parte
 *  4 (el usuario avisó de que faltaban "muchísimos", Range Rover entre
 *  ellos) para cubrir la inmensa mayoría de lo que puede entrar en un
 *  taller español: generalistas, premium, deportivos/exclusivos, chinos
 *  recientes y algunas marcas ya descatalogadas pero todavía en circulación
 *  (Daewoo, Saab, Lada...). Sigue sin pretender ser exhaustiva. **Range
 *  Rover se trata como fabricante APARTE de Land Rover** (con sus propios
 *  modelos Range Rover/Sport/Velar/Evoque) porque hoy se comercializa y se
 *  reconoce así, aunque formalmente sea la misma casa (JLR). */
export const FABRICANTES: string[] = [
  'Abarth',
  'Alfa Romeo',
  'Alpine',
  'Aston Martin',
  'Audi',
  'Bentley',
  'BMW',
  'BYD',
  'Chevrolet',
  'Chrysler',
  'Citroën',
  'Cupra',
  'Dacia',
  'Daewoo',
  'Dodge',
  'DS',
  'Ferrari',
  'Fiat',
  'Ford',
  'GWM',
  'Honda',
  'Hyundai',
  'Ineos',
  'Infiniti',
  'Isuzu',
  'Iveco',
  'Jaguar',
  'Jeep',
  'Kia',
  'Lada',
  'Lamborghini',
  'Lancia',
  'Land Rover',
  'Lexus',
  'Maserati',
  'Mazda',
  'McLaren',
  'Mercedes-Benz',
  'MG',
  'Mini',
  'Mitsubishi',
  'Nissan',
  'Opel',
  'ORA',
  'Peugeot',
  'Polestar',
  'Porsche',
  'Range Rover',
  'Renault',
  'Rolls-Royce',
  'Saab',
  'Seat',
  'Škoda',
  'Smart',
  'SsangYong',
  'Subaru',
  'Suzuki',
  'Tesla',
  'Toyota',
  'Volkswagen',
  'Volvo',
  'XPeng',
];

/** Modelos habituales por fabricante — solo se usa para rellenar el
 *  `<datalist>` del campo "Modelo" en función del fabricante ya escrito en
 *  "Marca" (comparación sin distinguir mayúsculas/acentos, ver
 *  `modelosParaFabricante` más abajo). Un fabricante que no esté aquí (o un
 *  modelo que no esté en su lista) simplemente no ofrece sugerencias, sin
 *  bloquear nada. */
const MODELOS_POR_FABRICANTE: Record<string, string[]> = {
  abarth: ['500', '595', '695', 'Grande Panda'],
  'alfa romeo': ['Giulia', 'Giulietta', 'Stelvio', 'Tonale', 'MiTo', '4C'],
  alpine: ['A110', 'A290'],
  'aston martin': ['DB11', 'DB12', 'Vantage', 'DBX'],
  audi: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'TT', 'e-tron'],
  bentley: ['Continental GT', 'Bentayga', 'Flying Spur'],
  bmw: [
    'Serie 1', 'Serie 2', 'Serie 3', 'Serie 4', 'Serie 5', 'Serie 6', 'Serie 7', 'Serie 8',
    'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'i3', 'i4', 'i5', 'i7', 'iX',
  ],
  byd: ['Atto 3', 'Dolphin', 'Seal', 'Han', 'Tang', 'Yuan Plus'],
  chevrolet: ['Aveo', 'Cruze', 'Spark', 'Captiva', 'Orlando', 'Camaro'],
  chrysler: ['300C', 'Voyager', 'Grand Voyager', 'PT Cruiser'],
  'citroën': [
    'C1', 'C3', 'C3 Aircross', 'C4', 'C4 Cactus', 'C4 Picasso', 'C4 X', 'C5 Aircross', 'C5 X',
    'Berlingo', 'Jumpy', 'Jumper', 'SpaceTourer', 'e-C4',
  ],
  cupra: ['Leon', 'Formentor', 'Ateca', 'Born', 'Tavascan'],
  dacia: ['Sandero', 'Sandero Stepway', 'Duster', 'Jogger', 'Spring', 'Logan', 'Lodgy'],
  daewoo: ['Matiz', 'Lanos', 'Nubira', 'Kalos'],
  dodge: ['Journey', 'Caliber', 'Nitro', 'RAM'],
  ds: ['DS3', 'DS4', 'DS7', 'DS9'],
  ferrari: ['Roma', 'Portofino', '296', 'SF90', 'Purosangue'],
  fiat: ['500', '500X', '500L', '500e', 'Panda', 'Tipo', 'Punto', 'Doblo', 'Ducato', 'Talento', '600'],
  ford: [
    'Fiesta', 'Focus', 'Kuga', 'Puma', 'EcoSport', 'Mondeo', 'Ka', 'Ka+', 'S-Max', 'Galaxy', 'Edge',
    'Mustang', 'Mustang Mach-E', 'Ranger', 'Transit', 'Transit Connect', 'Transit Custom',
    'Tourneo Connect', 'Tourneo Custom',
  ],
  gwm: ['Poer', 'Wey', 'Tank 300', 'Haval H6'],
  honda: ['Civic', 'CR-V', 'Jazz', 'HR-V', 'e', 'e:Ny1', 'Accord'],
  hyundai: [
    'i10', 'i20', 'i30', 'Tucson', 'Kona', 'Santa Fe', 'Bayon', 'Ioniq', 'Ioniq 5', 'Ioniq 6',
    'Staria', 'Accent', 'Elantra',
  ],
  ineos: ['Grenadier'],
  infiniti: ['Q30', 'Q50', 'QX30', 'QX70'],
  isuzu: ['D-Max', 'Trooper'],
  iveco: ['Daily'],
  jaguar: ['XE', 'XF', 'F-Pace', 'E-Pace', 'I-Pace', 'F-Type'],
  jeep: ['Renegade', 'Compass', 'Cherokee', 'Grand Cherokee', 'Wrangler', 'Avenger'],
  kia: [
    'Picanto', 'Rio', 'Ceed', 'Sportage', 'Niro', 'Stonic', 'Sorento', 'XCeed', 'EV6', 'EV9',
    'Carnival', 'Soul',
  ],
  lada: ['Niva', '4x4'],
  lamborghini: ['Huracán', 'Urus', 'Aventador', 'Revuelto'],
  lancia: ['Ypsilon', 'Delta', 'Musa'],
  'land rover': ['Discovery', 'Discovery Sport', 'Defender', 'Freelander'],
  lexus: ['CT', 'IS', 'ES', 'NX', 'RX', 'UX', 'LC', 'LS'],
  maserati: ['Ghibli', 'Levante', 'Quattroporte', 'Grecale', 'GranTurismo'],
  mazda: ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-9', 'MX-5', 'MX-30', 'BT-50'],
  mclaren: ['540C', '570S', 'GT', '720S', 'Artura'],
  'mercedes-benz': [
    'Clase A', 'Clase B', 'Clase C', 'Clase E', 'Clase S', 'Clase G', 'CLA', 'CLS', 'GLA', 'GLB',
    'GLC', 'GLE', 'GLS', 'Vito', 'Sprinter', 'Citan', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS',
  ],
  mg: ['MG3', 'MG4', 'MG5', 'ZS', 'HS', 'Marvel R'],
  mini: ['Cooper', 'Countryman', 'Clubman', 'Cabrio', 'Aceman'],
  mitsubishi: ['Space Star', 'ASX', 'Eclipse Cross', 'Outlander', 'L200', 'Pajero'],
  nissan: ['Micra', 'Note', 'Juke', 'Qashqai', 'X-Trail', 'Leaf', 'Navara', 'Ariya', 'NV200', 'Interstar', 'Primastar'],
  opel: ['Corsa', 'Astra', 'Mokka', 'Crossland', 'Grandland', 'Combo', 'Insignia', 'Zafira', 'Vivaro', 'Movano', 'Adam'],
  ora: ['Funky Cat', '03'],
  peugeot: ['108', '208', '308', '408', '2008', '3008', '5008', 'Partner', 'Rifter', 'Traveller', 'Expert', 'Boxer'],
  polestar: ['Polestar 2', 'Polestar 3', 'Polestar 4'],
  porsche: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan', 'Cayman', 'Boxster', '718'],
  'range rover': ['Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque'],
  renault: [
    'Clio', 'Captur', 'Megane', 'Kadjar', 'Arkana', 'Twingo', 'Scenic', 'Kangoo', 'Espace', 'Koleos',
    'Zoe', 'Trafic', 'Master', 'Austral', 'Symbioz',
  ],
  'rolls-royce': ['Ghost', 'Phantom', 'Cullinan', 'Wraith'],
  saab: ['9-3', '9-5'],
  seat: ['Ibiza', 'Leon', 'Arona', 'Ateca', 'Tarraco', 'Alhambra', 'Mii'],
  'škoda': ['Fabia', 'Octavia', 'Kamiq', 'Karoq', 'Kodiaq', 'Scala', 'Superb', 'Yeti', 'Enyaq'],
  smart: ['Fortwo', 'Forfour', '#1'],
  ssangyong: ['Tivoli', 'Korando', 'Rexton', 'Musso'],
  subaru: ['Impreza', 'XV', 'Forester', 'Outback', 'Legacy', 'Crosstrek', 'Solterra'],
  suzuki: ['Swift', 'Vitara', 'S-Cross', 'Ignis', 'Jimny', 'Across'],
  tesla: ['Model 3', 'Model S', 'Model X', 'Model Y'],
  toyota: [
    'Yaris', 'Yaris Cross', 'Corolla', 'C-HR', 'RAV4', 'Aygo', 'Aygo X', 'Camry', 'Hilux',
    'Land Cruiser', 'Prius', 'Proace', 'Auris', 'Highlander',
  ],
  volkswagen: [
    'Polo', 'Golf', 'Tiguan', 'T-Roc', 'Passat', 'T-Cross', 'Touran', 'Caddy', 'up!', 'Arteon',
    'Touareg', 'Multivan', 'Transporter', 'Amarok', 'ID.3', 'ID.4', 'ID.5', 'ID.7',
  ],
  volvo: ['V40', 'V60', 'V90', 'S60', 'S90', 'XC40', 'XC60', 'XC90', 'C40', 'EX30'],
  xpeng: ['G6', 'G9', 'P7'],
};

/** Fabricantes de MOTO habituales en un taller español (batch 24) —
 *  motos "de carretera" convencionales (naked, scooter, trail, custom...),
 *  incluye marcas japonesas generalistas, europeas premium, marcas de
 *  scooter, y algunas históricas/españolas que siguen mucho en circulación
 *  (Derbi, Rieju) — no pretende ser exhaustiva, mismo criterio que
 *  `FABRICANTES` de coche. */
export const FABRICANTES_MOTO: string[] = [
  'Aprilia',
  'Benelli',
  'Beta',
  'BMW',
  'CFMoto',
  'Derbi',
  'Ducati',
  'GasGas',
  'Harley-Davidson',
  'Honda',
  'Husqvarna',
  'Indian',
  'Kawasaki',
  'KTM',
  'Kymco',
  'Moto Guzzi',
  'MV Agusta',
  'Peugeot Motocycles',
  'Piaggio',
  'Rieju',
  'Royal Enfield',
  'Sherco',
  'Suzuki',
  'SYM',
  'Triumph',
  'Vespa',
  'Yamaha',
  'Zontes',
];

/** Modelos habituales por fabricante de MOTO — mismo criterio y misma
 *  función (`modelosParaFabricante`, ahora con el tipo de vehículo) que
 *  para coche. */
const MODELOS_POR_FABRICANTE_MOTO: Record<string, string[]> = {
  aprilia: ['RS 660', 'Tuono 660', 'RSV4', 'SR GT', 'Tuareg 660', 'RS 125', 'Tuono 125'],
  benelli: ['Leoncino 500', 'TRK 502', 'TRK 502 X', 'Imperiale 400', '752 S', 'BN 302'],
  beta: ['RR 250', 'RR 300', 'Xtrainer', 'Alp 200'],
  bmw: [
    'R 1250 GS', 'R 1250 GS Adventure', 'F 900 R', 'F 900 XR', 'F 850 GS', 'S 1000 RR', 'S 1000 R',
    'R nineT', 'G 310 R', 'G 310 GS', 'C 400 X', 'C 400 GT', 'CE 04',
  ],
  cfmoto: ['300SR', '450SR', '650MT', '700CL-X', '800MT', '800NK'],
  derbi: ['Senda', 'GPR 125', 'Terra', 'Boulevard'],
  ducati: [
    'Monster', 'Panigale V2', 'Panigale V4', 'Multistrada V2', 'Multistrada V4', 'Scrambler Icon',
    'Diavel', 'Hypermotard 950', 'DesertX',
  ],
  gasgas: ['EC 250', 'EC 300', 'MC 450F', 'Enduro GP'],
  'harley-davidson': [
    'Iron 883', 'Forty-Eight', 'Street Bob', 'Fat Boy', 'Road King', 'Sportster S', 'Pan America',
    'Low Rider S',
  ],
  honda: [
    'CB125R', 'CB500F', 'CB650R', 'CBR500R', 'CBR600RR', 'CB1000R', 'Africa Twin', 'Transalp',
    'PCX125', 'SH125i', 'SH350i', 'Forza 125', 'Forza 350', 'Monkey', 'CRF300L',
  ],
  husqvarna: ['Svartpilen 125', 'Svartpilen 401', 'Vitpilen 401', 'Norden 901', 'FE 350'],
  indian: ['Scout', 'Scout Bobber', 'Chief', 'Springfield', 'Chieftain'],
  kawasaki: [
    'Ninja 400', 'Ninja 650', 'Ninja ZX-10R', 'Z650', 'Z900', 'Z400', 'Versys 650', 'Versys 1000',
    'Vulcan S', 'W800',
  ],
  ktm: [
    'Duke 125', 'Duke 390', 'Duke 790', 'Duke 890', 'Adventure 390', 'Adventure 790',
    'Adventure 890', 'Adventure 1290', 'RC 125', 'RC 390',
  ],
  kymco: ['Agility 125', 'People 125', 'People 300', 'AK 550', 'Xciting 400', 'DTX 360'],
  'moto guzzi': ['V7', 'V9', 'V85 TT', 'California', 'Mandello'],
  'mv agusta': ['Brutale', 'F3', 'Turismo Veloce', 'Superveloce'],
  'peugeot motocycles': ['Django', 'Speedfight', 'Kisbee', 'Tweet', 'Metropolis'],
  piaggio: ['Liberty', 'MP3', 'Beverly', 'Medley'],
  rieju: ['MRT', 'Marathon', 'MRX', 'Century'],
  'royal enfield': [
    'Meteor 350', 'Classic 350', 'Hunter 350', 'Himalayan', 'Interceptor 650', 'Continental GT 650',
    'Scram 411',
  ],
  sherco: ['SE 300', 'SEF 450', 'Factory'],
  suzuki: [
    'GSX-R600', 'GSX-R750', 'GSX-R1000', 'GSX-S750', 'GSX-S1000', 'SV650', 'V-Strom 650',
    'V-Strom 1050', 'Burgman 125', 'Burgman 400',
  ],
  sym: ['Symphony', 'Jet 14', 'NH-T', 'Cruisym'],
  triumph: [
    'Street Triple', 'Speed Triple', 'Tiger 900', 'Tiger 1200', 'Bonneville T100', 'Bonneville T120',
    'Trident 660', 'Scrambler 900',
  ],
  vespa: ['Primavera', 'Sprint', 'GTS 125', 'GTS 300', 'LX'],
  yamaha: [
    'MT-07', 'MT-09', 'MT-125', 'YZF-R125', 'YZF-R7', 'YZF-R1', 'Tracer 7', 'Tracer 9',
    'Ténéré 700', 'XMAX 125', 'XMAX 300', 'NMAX 125', 'Tricity 125',
  ],
  zontes: ['ZT125', 'ZT310', 'ZT350', 'GK350'],
};

/** Fabricantes de coche o de moto según `tipoVehiculo` — la lista a pasar
 *  al `<datalist>` de "Marca" del formulario que corresponda. */
export function fabricantesPara(tipoVehiculo: 'coche' | 'moto'): string[] {
  return tipoVehiculo === 'moto' ? FABRICANTES_MOTO : FABRICANTES;
}

/** Devuelve las sugerencias de modelo para el fabricante ya escrito (si lo
 *  reconoce) o una lista vacía — nunca lanza ni bloquea, es solo para
 *  rellenar el `<datalist>` del campo "Modelo". `tipoVehiculo` (batch 24,
 *  por defecto 'coche' para no romper las llamadas ya existentes) elige
 *  entre la lista de modelos de coche o de moto. */
export function modelosParaFabricante(fabricante: string, tipoVehiculo: 'coche' | 'moto' = 'coche'): string[] {
  const clave = fabricante.trim().toLowerCase();
  const mapa = tipoVehiculo === 'moto' ? MODELOS_POR_FABRICANTE_MOTO : MODELOS_POR_FABRICANTE;
  return mapa[clave] ?? [];
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
