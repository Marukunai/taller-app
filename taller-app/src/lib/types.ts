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

export type TipoServicio = 'mantenimiento' | 'neumaticos' | 'averia' | 'pre_itv';

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
  // Nulo mientras la orden solo existe como seguimiento de una solicitud
  // aceptada del Portal de cliente (estado 'solicitado') — se rellena al
  // "Recibir vehículo" cuando el coche llega físicamente, ver
  // `solicitud_id` más abajo.
  vehiculo_id: string | null;
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
  // Si esta orden nació de una solicitud del Portal de cliente aceptada
  // (en vez de un check-in directo), referencia a esa solicitud — permite
  // mostrar los datos que dio el cliente en el Panel de gestión mientras
  // `vehiculo_id` sigue siendo null.
  solicitud_id: string | null;
  // Coche de sustitución prestado mientras dura esta orden (si se le
  // prestó alguno) — ver `coches_repuesto` más abajo. `fecha_devolucion_
  // repuesto` queda null mientras el préstamo sigue activo.
  coche_repuesto_id: string | null;
  fecha_prestamo_repuesto: string | null;
  fecha_devolucion_repuesto: string | null;
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
  // Documentación del conductor/vehículo recogida en el check-in — se exige
  // AL MENOS una de las dos (ver validación en InspectionForm.tsx), nunca
  // las dos obligatoriamente: quien trae el coche puede aportar su propio
  // permiso de conducir (foto) o la ficha técnica del vehículo.
  permiso_conducir_url: string | null;
  ficha_tecnica_url: string | null;
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

/** Coche propio del taller que se presta a un cliente mientras dura el
 *  servicio de su vehículo. Es un catálogo propio (como `Almacen`), no
 *  ligado a ningún cliente en concreto — a quién se le presta cada uno se
 *  guarda en `OrdenTrabajo.coche_repuesto_id`, no aquí. `baja` es un "dado
 *  de baja" (se dejó de usar en la flota, p. ej. se vendió) sin borrar la
 *  fila, para no perder el histórico de préstamos que lo referencian. */
export interface CocheRepuesto {
  id: string;
  matricula: string;
  marca: string | null;
  modelo: string | null;
  notas: string | null;
  baja: boolean;
  // Precio por hora de uso (opcional) — para poder cobrar el préstamo del
  // coche de sustitución si el taller así lo decide. Null = no se cobra.
  precio_hora: number | null;
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

/** Datos que se pasan del Panel de gestión al Check-in al pulsar "Recibir
 *  vehículo" sobre una orden en estado 'solicitado' (nacida de aceptar una
 *  solicitud del Portal de cliente) — para prellenar el formulario con lo
 *  que el cliente ya dijo, sin tener que volver a teclearlo. El DNI nunca
 *  se prellena (el Portal no lo pide) — se sigue pidiendo como siempre. */
export interface OrdenPendienteRecepcion {
  ordenId: string;
  nombre: string;
  telefono: string;
  email: string;
  matricula: string;
  marca: string;
  modelo: string;
  tipoServicio: TipoServicio;
  descripcionAveria: string;
  neumaticosCantidad: NeumaticosCantidad | null;
}

export type EstadoSolicitud = 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada';

/** Petición de servicio que un cliente crea él mismo desde el Portal de
 *  cliente (sin pasar por el mecánico) — "quiero una revisión de
 *  mantenimiento", etc. Al aceptarla, el personal ya obtiene una orden de
 *  trabajo en estado 'solicitado' (ver `OrdenTrabajo.solicitud_id`) para
 *  poder hacerle seguimiento en el Panel de gestión — pero SIN vehículo
 *  real vinculado todavía: el check-in real (DNI, fotos, daños y firma) se
 *  sigue haciendo desde el Check-in normal cuando el vehículo llega
 *  físicamente al taller, completando esa misma orden en vez de crear una
 *  nueva ("Recibir vehículo"). */
export interface Solicitud {
  id: string;
  created_at: string;
  // Nulo cuando la crea el propio personal (pestaña "Solicitud de cita",
  // ej. una llamada telefónica) en vez de un cliente con cuenta del Portal.
  cliente_auth_id: string | null;
  nombre_cliente: string;
  // Nulo también en el caso anterior: un cliente sin cuenta del Portal
  // puede no haber dado ningún email por teléfono.
  email_cliente: string | null;
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
  // Fecha/hora que el cliente propone para TRAER el vehículo (check-in),
  // elegida al crear la solicitud desde el Portal — con la misma
  // sencillez que la cita de recogida (sin gestión de franjas/aforo).
  fecha_cita_checkin: string | null;
}

/** Precio de un item de inventario — en tabla APARTE de `InventarioItem` a
 *  propósito: solo el encargado puede leer/escribir esto (ver RLS en
 *  schema.sql), así un mecánico nunca ve coste alguno aunque inspeccione
 *  las peticiones de red de la pantalla de Inventario que sí puede usar. */
export interface InventarioPrecio {
  item_id: string;
  precio_unitario: number;
}

export type EstadoPresupuesto = 'borrador' | 'enviado' | 'aprobado' | 'rechazado';

/** Presupuesto/factura interna de una orden de trabajo — documento de
 *  gestión interna (NO una factura fiscal válida ante Hacienda: sin
 *  numeración correlativa oficial ni desglose de IVA) que resume mano de
 *  obra + piezas usadas. Lo crea/edita el encargado; si la orden viene de
 *  una solicitud del Portal, el cliente puede verlo y aprobarlo/rechazarlo
 *  desde su cuenta. Una orden tiene como mucho un presupuesto. */
export interface Presupuesto {
  id: string;
  orden_id: string;
  solicitud_id: string | null;
  concepto_mano_obra: string | null;
  precio_mano_obra: number;
  estado: EstadoPresupuesto;
  nota_cliente: string | null;
  created_at: string;
  enviado_en: string | null;
  respondido_en: string | null;
  factura_pdf_url: string | null;
}

/** Línea de detalle de un presupuesto — snapshot del precio en el momento
 *  en que el encargado lo calculó (recalculado desde `piezas_usadas` +
 *  `inventario_precios`, no sincronizado automáticamente). */
export interface PresupuestoPieza {
  id: string;
  presupuesto_id: string;
  pieza_usada_id: string | null;
  nombre_item: string;
  cantidad: number;
  precio_unitario: number;
}
