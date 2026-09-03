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
  // Añadidos en el batch 19 (parte 3) — todos opcionales (a diferencia de
  // marca/modelo, que siguen siendo obligatorios): tipo de combustible, año
  // del modelo y prestaciones del motor, rellenados con ayuda de un
  // `<datalist>` en el Check-in (ver src/lib/vehicleData.ts) que siempre
  // admite escribir un valor que no esté en la lista.
  combustible: string | null;
  anio: number | null;
  motor: string | null;
  // "Aviso anual" opcional: el cliente acepta (con un botón junto a la
  // firma de salida en la Entrega, ver CheckoutForm.tsx) que se le avise
  // aproximadamente en 12 meses de que toca la próxima revisión. No hay
  // ningún envío automático programado todavía (la app no tiene ningún
  // proceso en segundo plano) — de momento solo queda marcado aquí para que
  // "Próximas revisiones" pueda destacar qué vehículos lo han aceptado.
  aviso_anual_aceptado: boolean;
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
  // Fecha/hora PREVISTA de devolución del coche de sustitución (batch 19,
  // parte 3) — opcional, se rellena al prestarlo (ver AsignarRepuestoModal)
  // para poder avisar con antelación si se pasa la fecha; no se usa para
  // nada automático, solo se muestra en Flota/Panel de gestión.
  fecha_devolucion_repuesto_prevista: string | null;
  // Medida del neumático (batch 19, parte 3) — solo tiene sentido cuando
  // tipo_servicio = 'neumaticos', y es opcional: la foto de arriba
  // (neumaticos_foto_url) sigue siendo suficiente por sí sola. Se rellena
  // con ayuda de un `<datalist>` (ver src/lib/vehicleData.ts).
  neumatico_ancho: string | null;
  neumatico_perfil: string | null;
  neumatico_llanta: string | null;
  neumatico_indice_carga: string | null;
  neumatico_indice_velocidad: string | null;
  neumatico_estacion: string | null;
  // Mecánico del taller asignado a esta orden (batch 20) — opcional, solo
  // para poder filtrar el Panel de gestión por "quién la lleva"; no
  // restringe quién puede trabajar en ella (eso lo sigue haciendo RLS a
  // nivel de "es_personal()", igual que siempre).
  mecanico_asignado_id: string | null;
  // Valoración rápida del cliente (batch 20) — 1 a 5 estrellas + comentario
  // opcional, que el propio cliente deja desde el Portal una vez la orden
  // está 'entregado' (ver ClientPortal.tsx). Null mientras no la ha dejado
  // — una vez puesta, no se puede volver a cambiar (ver trigger
  // bloquear_cambio_cliente_orden en supabase/batch20_migration.sql).
  valoracion_estrellas: number | null;
  valoracion_comentario: string | null;
  valoracion_en: string | null;
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
/** Unidad en la que se mide `cantidad` — 'ud' (piezas contables, por
 *  defecto) o 'L'/'kg' para consumibles a granel (aceites, líquidos,
 *  grasa). Batch 21: antes solo existía 'ud' implícito. IMPORTANTE — al
 *  añadir la columna, los items YA existentes que se etiquetan como 'L'/
 *  'kg' (ver migración) mantienen la `cantidad` que ya tenían, que hasta
 *  ahora contaba "envases" (ej. garrafas de 5L), no litros/kg reales — hay
 *  que corregirla a mano una vez por item desde el propio Inventario. */
export type UnidadInventario = 'ud' | 'L' | 'kg';

export interface InventarioItem {
  id: string;
  nombre: string;
  tipo: string;
  tamano: string | null;
  cantidad: number;
  unidad: UnidadInventario;
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

/** Rol de una cuenta de Supabase Auth — jerarquía desde el batch 19:
 *  'admin' es una cuenta de arranque (se crea a mano por SQL, nunca desde la
 *  app) pensada sobre todo para crear al primer 'dueno' — pero ve y puede
 *  hacer TODO lo mismo que un 'dueno' (check-in, panel, todos los datos,
 *  Gestión de personal incluida), a petición explícita del usuario; la
 *  única diferencia real de 'admin' es que su propia cuenta no se puede
 *  gestionar (editar/desactivar/eliminar) desde Gestión de personal salvo
 *  que sea ella misma, y que nunca aparece en la lista de cuentas de esa
 *  pantalla ni es asignable a otra cuenta desde la app;
 *  'dueno' gestiona el taller entero: todo lo que puede hacer un
 *  'encargado' además de crear/editar/desactivar/eliminar CUALQUIER cuenta
 *  de personal (incluidos otros encargados, y otros dueños) desde Gestión
 *  de personal — antes esto lo hacía el 'encargado', ya no; 'encargado' tiene el mismo
 *  acceso operativo de siempre (inventario, precios, presupuestos, flota,
 *  estadísticas) pero YA NO ve Gestión de personal; 'mecanico' es personal
 *  del taller con acceso a check-in/panel/entrega/inventario en solo
 *  lectura, pero SIN Gestión de personal, SIN Flota, SIN Estadísticas, SIN
 *  Próximas revisiones, y sin ver ningún precio/coste; 'recepcionista' es
 *  personal de cara al cliente (solicitud de cita, agenda, panel de
 *  gestión para ver pendientes) pero SIN Inventario, SIN Próximas
 *  revisiones, SIN Gestión de personal, SIN Flota, SIN Estadísticas;
 *  'cliente' es una cuenta que el propio cliente se crea desde el Portal de
 *  cliente para pedir cita sin pasar por el mecánico. Se guarda en la tabla
 *  `perfiles` (no en `clientes`, que es el registro de datos de
 *  facturación/contacto que rellena el mecánico en el check-in — son cosas
 *  distintas: un mismo cliente de toda la vida puede no tener nunca una
 *  cuenta, y una cuenta nueva no tiene por qué tener aún una fila en
 *  `clientes`). Las cuentas de personal (salvo 'admin', solo por SQL) se
 *  crean desde la propia app en Gestión de personal (solo visible para
 *  'admin'/'dueno'); 'cliente' se auto-asigna al registrarse. */
export type RolPerfil = 'admin' | 'dueno' | 'encargado' | 'mecanico' | 'recepcionista' | 'cliente';

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
  // Consentimiento RGPD (batch 20) — el cliente marca una casilla
  // obligatoria en el Portal antes de enviar la solicitud, aceptando que
  // el taller trate sus datos de contacto y del vehículo para gestionarla.
  // Solo se guarda en las solicitudes creadas desde el Portal por el
  // propio cliente (`rgpd_aceptado_en` queda null en las que registra el
  // personal desde "Solicitud de cita" — no aplica, no hay checkbox ahí).
  rgpd_aceptado: boolean;
  rgpd_aceptado_en: string | null;
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
  // Si el taller ya ha cobrado este presupuesto/factura (batch 20) — no
  // tiene ninguna relación con `estado` (un presupuesto puede estar
  // 'aprobado' sin haberse cobrado todavía, o incluso cobrarse antes de
  // que el cliente lo apruebe formalmente si vino por teléfono).
  pagado: boolean;
  pagado_en: string | null;
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
