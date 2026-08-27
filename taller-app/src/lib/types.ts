// Tipos compartidos del dominio del taller.
// Reflejan el DDL de Supabase (ver /supabase/schema.sql).

export type TipoDano = 'arañazo' | 'abolladura' | 'rotura';

export interface DanoMarcador {
  id: string;
  // Posición LITERAL del clic sobre el esquema de 4 vistas (lateral,
  // frontal, trasera, cenital, siempre visibles a la vez en un único
  // dibujo), en % (0-100) sobre el recuadro COMPLETO del SVG. El marcador
  // se redibuja exactamente aquí — solo en la vista donde se tocó — sin
  // intentar proyectarlo a las otras 3, que es lo que causaba que el punto
  // no cuadrara entre vistas en versiones anteriores.
  xPct: number;
  yPct: number;
  // Posición canónica en 3 ejes (0-100), calculada UNA vez a partir del
  // clic — ver src/lib/carSchemaZones.ts. Se usa solo para el texto
  // descriptivo del informe (p. ej. "parte delantera, lado derecho"), NUNCA
  // para dibujar el marcador (eso usa xPct/yPct de arriba).
  longitudinal: number; // 0 = parte trasera, 100 = parte delantera
  lateral: number; // 0 = lado izquierdo, 100 = lado derecho
  altura: number; // 0 = techo/zona alta, 100 = bajos/zona baja
  tipo: TipoDano;
  observacion?: string;
}

export type NivelCombustible = '1/4' | '1/2' | '3/4' | 'Lleno';

export type TipoServicio = 'mantenimiento' | 'neumaticos' | 'averia';

export type EstadoOrden =
  | 'solicitado'
  | 'recepcionado'
  | 'en_proceso'
  | 'listo'
  | 'entregado'
  | 'cancelado';

/** Qué neumáticos concretos se van a tocar cuando el servicio es de tipo
 *  'neumaticos' — o bien un eje completo, los 4, o una rueda concreta. */
export type NeumaticosCantidad =
  | '2_delanteros'
  | '2_traseros'
  | 'las_4'
  | 'delantero_izquierdo'
  | 'delantero_derecho'
  | 'trasero_izquierdo'
  | 'trasero_derecho';

export interface Cliente {
  id: string;
  nombre: string;
  dni: string;
  telefono: string;
  email: string | null;
}

export interface Vehiculo {
  id: string;
  matricula: string;
  marca: string | null;
  modelo: string | null;
  // Color del vehículo tal cual lo escribe quien hace el check-in (texto
  // libre, ej. "Rojo", "Gris plata") — se usa para distinguirlo de un
  // vistazo en el Panel de gestión y en la Entrega.
  color: string | null;
  cliente_id: string;
}

export interface OrdenTrabajo {
  id: string;
  vehiculo_id: string;
  estado: EstadoOrden;
  tipo_servicio: TipoServicio;
  descripcion_averia: string | null;
  fecha_entrada: string | null;
  fecha_salida_estimada: string | null;
  firma_salida_url: string | null;
  fecha_entrega: string | null;
  // Solo rellenos cuando tipo_servicio = 'neumaticos'.
  neumaticos_cantidad: NeumaticosCantidad | null;
  neumaticos_foto_url: string | null;
  // Cancelación (el usuario eligió "pasa a estado Cancelado", sin borrar
  // nada — queda el histórico completo).
  motivo_cancelacion: string | null;
  // Cita de recogida concertada al marcar la orden como "Listo", para
  // avisar al cliente de cuándo puede venir a por el vehículo.
  cita_recogida: string | null;
  // URL del informe PDF generado al entregar el vehículo (distinto del PDF
  // de entrada, que vive en inspecciones_entrada.pdf_informe_url).
  pdf_salida_url: string | null;
}

export interface InspeccionEntrada {
  id: string;
  orden_id: string;
  kilometraje: number;
  nivel_combustible: NivelCombustible;
  fotos_urls: string[];
  daños_coordenadas: DanoMarcador[];
  // Notas generales sobre el estado del vehículo al entrar (además de las
  // observaciones puntuales de cada daño marcado en el esquema).
  observaciones: string | null;
  firma_cliente_url: string;
  pdf_informe_url: string | null;
}

/** Un almacén/inventario físico del taller. La mayoría de talleres tienen
 *  uno solo ("Almacén 1"), pero una cadena con varias naves puede tener
 *  más — cada uno con su propio stock independiente. */
export interface Almacen {
  id: string;
  nombre: string;
  created_at: string;
}

/** Item del inventario/almacén del taller (repuestos, materiales de
 *  consumo...). Es un catálogo propio del taller, no está ligado a
 *  clientes ni a órdenes de trabajo concretas. Pertenece a un almacén
 *  concreto (`almacen_id`) — el mismo repuesto en dos almacenes distintos
 *  son dos filas independientes, con su propio stock. */
export interface InventarioItem {
  id: string;
  nombre: string;
  tipo: string;
  tamano: string | null;
  cantidad: number;
  imagen_url: string | null;
  almacen_id: string;
}

/** Registro de una pieza del inventario consumida en una orden de trabajo
 *  concreta. `nombre_item` es una copia del nombre en el momento de
 *  usarla, para conservar el histórico aunque el item se borre o renombre
 *  después en el inventario. `item_id` puede ser null si el item de
 *  inventario original ya no existe. */
export interface PiezaUsada {
  id: string;
  orden_id: string;
  item_id: string | null;
  nombre_item: string;
  cantidad: number;
  created_at: string;
}

/** Rol de una cuenta de Supabase Auth: 'encargado' gestiona el taller
 *  entero (inventario, altas de personal, y todo lo que puede hacer un
 *  'mecanico' además); 'mecanico' es personal del taller con acceso a
 *  check-in/panel/entrega pero SIN Inventario, SIN Gestión de personal, y
 *  sin ver ningún precio/coste que pueda añadirse en el futuro; 'cliente'
 *  es una cuenta que el propio cliente se crea desde el Portal de cliente
 *  para pedir cita sin pasar por el mecánico. Se guarda en la tabla
 *  `perfiles` (no en `clientes`, que es el registro de datos de
 *  facturación/contacto que rellena el mecánico en el check-in — son cosas
 *  distintas: un mismo cliente de toda la vida puede no tener nunca una
 *  cuenta, y una cuenta nueva no tiene por qué tener aún una fila en
 *  `clientes`). Las cuentas de 'encargado'/'mecanico' se crean a mano (la
 *  primera desde el dashboard de Supabase, las siguientes desde la propia
 *  app en Gestión de personal); 'cliente' se auto-asigna al registrarse. */
export type RolPerfil = 'encargado' | 'mecanico' | 'cliente';

export interface Perfil {
  id: string; // == auth.users.id
  rol: RolPerfil;
  nombre: string | null;
  email: string | null;
  // Cuenta de personal desactivada desde "Gestión de personal" (siempre
  // true para una cuenta de cliente). Una cuenta desactivada pierde el
  // acceso al instante por RLS (ver es_personal()/es_encargado() en
  // schema.sql), independientemente de si su sesión sigue siendo válida.
  activo: boolean;
}

export type EstadoSolicitud = 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada';

/** Petición de servicio que un cliente crea él mismo desde el Portal de
 *  cliente (sin pasar por el mecánico) — "quiero una revisión de
 *  mantenimiento", etc. Es un aviso previo, no un check-in: cuando el
 *  vehículo llega físicamente al taller, el check-in real (con fotos, daños
 *  y firma) se sigue haciendo desde el Check-in normal, igual que siempre —
 *  esta tabla solo mueve la conversación de "quiero pedir cita" al taller
 *  sin una llamada de teléfono. */
export interface Solicitud {
  id: string;
  created_at: string;
  cliente_auth_id: string;
  nombre_cliente: string;
  email_cliente: string;
  telefono_cliente: string | null;
  matricula: string | null;
  marca: string | null;
  modelo: string | null;
  tipo_servicio: TipoServicio;
  descripcion: string | null;
  neumaticos_cantidad: NeumaticosCantidad | null;
  estado: EstadoSolicitud;
  // Nota corta del taller al aceptar/rechazar (p. ej. "Te esperamos el
  // jueves a las 9h"), visible para el cliente en su propio portal.
  respuesta_taller: string | null;
}
