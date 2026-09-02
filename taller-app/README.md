# TallerGo — MVP de Check-In e Inspección

App web (React + TypeScript + Vite + Tailwind CSS) para la recepción de vehículos
en un taller mecánico: datos de cliente/vehículo, kilometraje, nivel de
combustible, fotos, marcado de daños sobre un esquema del coche y firma
digital con validez legal (RGPD). Backend: Supabase (PostgreSQL + Storage +
Auth) + Edge Functions para el email automático al cliente y la creación de
cuentas de mecánico.

## 1. Requisitos previos

- Node.js 20+ y npm
- Un proyecto en [Supabase](https://supabase.com) (plan gratuito es suficiente)
- La [Supabase CLI](https://supabase.com/docs/guides/cli) instalada en tu
  ordenador: hace falta para desplegar las Edge Functions
  `crear-cuenta-mecanico` y `administrar-cuenta-personal` (sección 13,
  obligatorias si vas a dar de alta o gestionar cuentas de mecánico desde la
  app) y, opcionalmente, para el aviso automático por email de "vehículo
  listo" (sección 16, junto con una cuenta gratuita en
  [Resend](https://resend.com)).

## 2. Configurar Supabase

1. Abre el **SQL Editor** de tu proyecto Supabase y ejecuta el contenido de
   [`supabase/schema.sql`](./supabase/schema.sql). Crea todas las tablas
   (`clientes`, `vehiculos`, `ordenes_trabajo`, `inspecciones_entrada`,
   `almacenes`, `inventario_items`, `piezas_usadas`, `perfiles`,
   `solicitudes`, `coches_repuesto`, `inventario_precios`, `presupuestos`,
   `presupuesto_piezas`), las políticas de RLS, la publicación de Realtime
   y unos datos de prueba.
2. Ve a **Storage** y crea estos 3 buckets, marcados como **Public**:
   - `fotos-vehiculos`
   - `firmas`
   - `documentos-pdf`
   El cuarto y quinto bucket (`inventario-imagenes`, para las fotos del
   inventario, y `documentos-cliente`, para el permiso de conducir/ficha
   técnica del check-in) no hace falta crearlos a mano: los crea el propio
   `schema.sql` por SQL.
3. Ve a **Authentication → Users → Add user** y crea el usuario (email +
   contraseña) con el que el **dueño** iniciará sesión en la app por
   primera vez (`schema.sql` da rol `dueno` a las cuentas de Auth que ya
   existan al ejecutarlo) — el resto de cuentas del taller (encargados,
   mecánicos, recepcionistas) se crean después desde dentro de la propia
   app, no hace falta darlas de alta a mano aquí (ver sección 13). La app no
   tiene pantalla de registro público para el personal. (El Portal de
   cliente, en cambio, sí tiene registro propio — ver sección 14.)
4. Si quieres que el registro del Portal de cliente sea instantáneo (que el
   cliente pueda entrar nada más crear su cuenta, sin pasos intermedios), ve
   a **Authentication → Providers → Email** y desactiva **"Confirm email"**.
   Si lo dejas activado, el cliente tendrá que confirmar su email desde un
   enlace antes de poder iniciar sesión la primera vez.
5. Para que funcione la recuperación de contraseña (sección 20), en
   **Authentication → URL Configuration** añade la URL desde la que sirves
   la app (por ejemplo `http://localhost:5173` en desarrollo, o tu dominio en
   producción) a la lista de **Redirect URLs** — si no está en esa lista,
   Supabase rechaza el enlace del email de restablecimiento.

> Si ya tenías la app funcionando desde antes y solo quieres añadir lo
> nuevo de esta versión (almacenes múltiples, cancelación de órdenes,
> servicio de neumáticos, informe de salida y Portal de cliente) sin tocar
> nada de lo que ya tienes, ejecuta
> [`supabase/portal_taller_migration.sql`](./supabase/portal_taller_migration.sql)
> en su lugar — es idempotente (se puede ejecutar más de una vez sin
> duplicar nada) y no borra ningún dato existente.
>
> ⚠️ Esa migración da automáticamente rol **"personal"** a todas las
> cuentas de Supabase Auth que ya existan en tu proyecto en el momento de
> ejecutarla (se asume que son las del taller, porque el Portal de cliente
> es nuevo). Si para cuando la ejecutes ya tienes clientes reales
> registrados a través del Portal, avisa antes de correrla — habría que
> excluirlos a mano para que no acaben con acceso de personal.
>
> Si tu proyecto ya tiene aplicada la migración anterior (`portal_taller_
> migration.sql`) y solo quieres añadir los roles finos (encargado/mecánico),
> el historial de vehículo por matrícula, próximas revisiones, las
> notificaciones en tiempo real y la recuperación de contraseña — todo lo
> descrito en las secciones 12, 13 y 17 a 20 — sin volver a ejecutar nada
> anterior, ejecuta
> [`supabase/roles_finos_migration.sql`](./supabase/roles_finos_migration.sql).
> También es idempotente. Convierte automáticamente a **"encargado"** (el
> rol con más permisos, equivalente al antiguo "personal") a todas las
> cuentas que ya tuvieran rol `personal`; si quieres que alguna de esas
> cuentas pase a ser un mecánico con permisos reducidos, cámbiaselo después
> desde la propia app (sección 13) o a mano en la tabla `perfiles`.
>
> Si tu proyecto ya tiene aplicada `roles_finos_migration.sql` y solo
> quieres añadir la posibilidad de **editar, desactivar/reactivar o
> eliminar** cuentas de personal desde la propia app (sección 13), ejecuta
> [`supabase/gestion_personal_migration.sql`](./supabase/gestion_personal_migration.sql).
> También idempotente — añade una única columna (`perfiles.activo`) y
> actualiza las funciones de roles para tenerla en cuenta.
>
> Si tu proyecto ya tiene aplicado todo lo anterior y solo quieres añadir
> que aceptar una solicitud del Portal de cliente cree ya una orden de
> seguimiento en "Solicitado" (sección 14), ejecuta
> [`supabase/solicitud_a_orden_migration.sql`](./supabase/solicitud_a_orden_migration.sql).
> Y si además quieres la flota propia de coches de sustitución (sección 24),
> ejecuta también
> [`supabase/coches_repuesto_migration.sql`](./supabase/coches_repuesto_migration.sql).
> Ambas son idempotentes e independientes entre sí — puedes ejecutar una
> sin la otra.
>
> Si tu proyecto ya tiene aplicado todo lo anterior y solo quieres añadir
> precios de inventario, presupuestos/factura interna y la cita de
> check-in reservable desde el Portal (secciones 25 y 26), ejecuta
> [`supabase/presupuestos_agenda_migration.sql`](./supabase/presupuestos_agenda_migration.sql).
> También idempotente.
>
> Si tu proyecto ya tiene aplicado todo lo anterior y solo quieres añadir
> cantidades decimales en inventario/piezas usadas y la pestaña "Solicitud
> de cita" (secciones 8 y 31), ejecuta
> [`supabase/checkin_split_y_decimales_migration.sql`](./supabase/checkin_split_y_decimales_migration.sql).
> También idempotente.
>
> Si tu proyecto ya tiene aplicado todo lo anterior y solo quieres añadir
> el precio por hora de los coches de sustitución, la documentación
> obligatoria del check-in (permiso de conducir/ficha técnica) y que
> cancelar una orden devuelva las piezas al stock (secciones 6, 10 y 24),
> ejecuta
> [`supabase/batch18_migration.sql`](./supabase/batch18_migration.sql).
> También idempotente.
>
> Si tu proyecto ya tiene aplicado todo lo anterior y solo quieres añadir la
> jerarquía de roles **admin/dueño/encargado/mecánico/recepcionista**
> (sección 12), ejecuta
> [`supabase/roles_v2_migration.sql`](./supabase/roles_v2_migration.sql).
> También idempotente. Convierte automáticamente a **"dueño"** todas las
> cuentas que ya tuvieran rol `encargado` (es el rol con más permisos hasta
> ahora, así que hereda el nuevo rol de más permisos operativos). Después de
> ejecutarla, vuelve a desplegar las Edge Functions
> `crear-cuenta-personal` y `administrar-cuenta-personal` (la antigua
> `crear-cuenta-mecanico` ya no la usa la app — puedes borrarla del
> dashboard si quieres). Si además quieres una cuenta `admin` de arranque,
> créala a mano por SQL — ver sección 12.
>
> Si prefieres borrar todos los datos de prueba y empezar de cero en vez
> de aplicar migraciones una a una, ejecuta primero
> [`supabase/reset_database.sql`](./supabase/reset_database.sql) y después
> el `schema.sql` del paso 1 — ya trae todo junto y al día, sin necesidad
> de ningún archivo de migración por separado.

## 3. Variables de entorno

Copia `.env.local.example` (o edita `.env.local`) con las credenciales de tu
proyecto Supabase (**Project Settings → API**):

```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_ANON_PUBLIC
```

> ⚠️ **Importante:** usa siempre la clave **`anon` / `public`**, nunca la
> `service_role` (secreta). La clave se incluye en el JavaScript que se envía
> al navegador, así que cualquier clave que pongas aquí queda expuesta
> públicamente. La clave `service_role` salta la Row Level Security y no debe
> usarse jamás en el frontend.

## 4. Instalación y arranque

```bash
npm install
npm run dev
```

```bash
npm run build    # build de producción (tsc -b && vite build)
npm run lint     # ESLint
```

## 5. Estructura relevante

```
public/
  favicon.svg              # favicon (esquinas redondeadas, se usa tal cual en el navegador)
  apple-icon-source.svg    # mismo diseño sin redondear, fuente del apple-touch-icon
  apple-touch-icon.png     # generado desde apple-icon-source.svg (ver sección 22)
  favicon-512.png          # PNG de alta resolución del favicon (por si hace falta, PWA...)
  og-image-source.svg      # fuente vectorial de la tarjeta de vista previa (sección 22)
  og-image.png             # generado desde og-image-source.svg, 1200x630
src/
  lib/
    supabase.ts        # cliente de Supabase + nombres de buckets
    types.ts            # tipos compartidos (Cliente, Vehiculo, DanoMarcador...)
    whatsapp.ts          # enlaces wa.me (informe de entrada, de salida, "listo")
    useSolicitudesPendientes.ts # hook: nº de solicitudes de cita pendientes (badge de la pestaña)
  components/
    CarDamagePicker.tsx    # esquema del coche interactivo para marcar daños
    SignatureModal.tsx     # modal de firma digital + cláusulas legales + RGPD
    LoginScreen.tsx         # pantalla de acceso del personal (email + contraseña)
    ClientAuthScreen.tsx    # registro/login propio del Portal de cliente
    ResetPasswordScreen.tsx # pantalla de "elige tu nueva contraseña" (enlace del email)
    CuentaMenu.tsx           # menú de la cuenta en la barra: cambiar contraseña, cerrar sesión
    PiezasUsadasModal.tsx   # registrar/quitar piezas de inventario usadas en una orden (con buscador)
    CitaRecogidaModal.tsx   # concierta cita de recogida y avisa al cliente ("Listo")
    CancelarOrdenModal.tsx  # cancela una orden de trabajo (pasa a "Cancelado")
    SolicitudesPanel.tsx    # revisión de solicitudes de cita (Portal o registradas por el taller)
    AsignarRepuestoModal.tsx # asigna un coche de sustitución libre de la flota a una orden
    ExitReportPdf.tsx        # plantilla del informe PDF de entrega/salida
  pages/
    SolicitudCitaPanel.tsx # paso 1 del check-in: reserva de cita (dueño+vehículo) — sección 31
    InspectionForm.tsx    # paso 2 del check-in: daños, kilometraje y firma con el coche ya presente
    ManagementPanel.tsx     # tablero de órdenes de trabajo por estado
    CheckoutForm.tsx         # entrega del vehículo (segunda firma + informe de salida)
    InventoryPanel.tsx       # inventario/almacén de repuestos del taller (no recepcionista)
    PersonnelPanel.tsx        # alta, edición, desactivación y borrado de cuentas (solo dueño/admin)
    HistorialVehiculo.tsx      # historial de un vehículo por matrícula
    ProximasRevisiones.tsx      # lista de vehículos a los que probablemente toca revisión
    ClientPortal.tsx              # portal del cliente (pedir servicio, ver solicitudes)
    FlotaRepuestoPanel.tsx         # flota propia de coches de sustitución (solo encargado)
supabase/
  schema.sql                     # DDL, políticas RLS, buckets, Realtime y seed data (todo al día)
  portal_taller_migration.sql    # migración incremental: almacenes, Portal de cliente, etc.
  roles_finos_migration.sql       # migración incremental: roles finos, historial, Realtime, etc.
  gestion_personal_migration.sql   # migración incremental: activo (des/reactivar cuentas)
  solicitud_a_orden_migration.sql  # migración incremental: solicitud aceptada → orden "Solicitado"
  checkin_split_y_decimales_migration.sql # migración incremental: cantidades decimales + Solicitud de cita del personal
  coches_repuesto_migration.sql    # migración incremental: flota de coches de sustitución
  batch18_migration.sql            # migración incremental: precio/hora sustitución, doc. obligatoria check-in, cancelar devuelve stock
  roles_v2_migration.sql           # migración incremental: jerarquía admin/dueño/encargado/mecánico/recepcionista
  functions/
    enviar-aviso-cliente/         # Edge Function: email real de "vehículo listo"
    crear-cuenta-personal/         # Edge Function: alta de cuentas de personal (cualquier rol asignable)
    administrar-cuenta-personal/   # Edge Function: editar/desactivar/reactivar/eliminar cuentas
```

## 6. Flujo del formulario de check-in

> Desde esta tanda de cambios, el check-in de entrada es el **paso 2** del
> flujo — ver sección 31 para el paso 1 ("Solicitud de cita"), donde se
> registran los datos del dueño y el vehículo antes de que llegue al
> taller. Se puede seguir haciendo un check-in completo de un tirón (sin
> pasar por una solicitud previa) exactamente igual que antes.

1. Se rellenan los datos del cliente y del vehículo — matrícula, marca,
   modelo, teléfono y **email** son obligatorios (no se puede guardar la
   inspección sin ellos). El tipo de servicio incluye ahora también
   **Pre ITV**, además de Mantenimiento/Neumáticos/Avería.
1b. Es obligatorio adjuntar (foto) **al menos uno** de estos dos
   documentos — nunca los dos a la vez: el permiso de conducir (A1, A2, B,
   B+E...) de quien trae el vehículo, o la ficha técnica del vehículo. Se
   suben al bucket `documentos-cliente` y quedan enlazados en
   `inspecciones_entrada` (`permiso_conducir_url`/`ficha_tecnica_url`).
2. Se registran kilometraje, nivel de combustible y fotos del estado actual.
3. Si el tipo de servicio es **Neumáticos**, aparecen dos campos adicionales:
   cuántos neumáticos se van a tocar (2 delanteros, 2 traseros, los 4, o uno
   concreto) y una foto del neumático actual — no hace falta anotar la
   medida (205/55 R16...) a mano, con la foto se ve tal cual.
4. Se marcan los daños existentes tocando la silueta del vehículo. El
   esquema muestra 4 vistas a la vez (lateral, frontal, trasera, cenital)
   para poder elegir con precisión en cuál conviene tocar según el daño,
   pero cada toque marca un ÚNICO punto — se dibuja solo en la vista donde
   se tocó, sin intentar reflejarlo también en las otras 3. Cada marcador
   admite además una observación de texto libre opcional (p. ej. "raya de
   unos 5cm, poco profunda") para detallar qué es exactamente el daño.
5. El cliente firma en el modal, que muestra la cláusula legal de entrada y
   el checkbox RGPD obligatorio; la firma se sube como PNG transparente al
   bucket `firmas`.
6. Al pulsar **"Guardar e Inspeccionar"** se crean/actualizan el cliente y el
   vehículo (por DNI/matrícula, incluyendo el color si se indicó), se crea
   la orden de trabajo y se inserta el registro en `inspecciones_entrada`
   con las URLs de fotos, las observaciones generales y la firma.

## 7. Inventario y almacenes múltiples

Pestaña independiente para el stock de repuestos y materiales del taller
(no depende de clientes ni de órdenes de trabajo). Viene precargado con un
catálogo inicial de unos 55 items habituales de un taller mecánico
generalista (aceites, filtros, frenos, neumáticos, correas, encendido,
eléctrico, suspensión, refrigeración, escape y consumibles). Desde la app
se puede: buscar por nombre o categoría, ajustar la cantidad con los
botones +/-, añadir items nuevos (nombre, categoría, talla/medida
opcional, cantidad y una foto opcional para distinguir piezas parecidas), y
**editar o borrar** cualquier item ya creado (icono de lápiz/papelera junto
a cada tarjeta) — incluyendo cambiar o quitar su foto, sin tener que
volver a crearlo desde cero. Borrar pide una confirmación explícita en dos
pasos. Las tarjetas de cada item son lo bastante grandes como para que el
nombre nunca se corte con "..." — si es largo, ocupa dos líneas en vez de
una.

Si el taller es una cadena con más de una nave, cada una puede tener su
propio almacén/stock independiente: en cuanto se crea un segundo almacén
aparece un selector en la parte superior de la pestaña ("Almacén 1",
"Almacén 2"...) para cambiar entre ellos, y el formulario de nuevo item
pide a cuál pertenece. Si solo hay uno (el caso normal, "Almacén 1" creado
por defecto), no se muestra ningún selector — solo un enlace discreto
("¿Más de una nave? Añadir otro almacén") para quien lo necesite. El mismo
repuesto puede existir en dos almacenes distintos como dos filas
independientes, cada una con su propio stock.

Un reset de datos de clientes (`reset_database.sql`) no toca los almacenes
ni el inventario — es un catálogo propio del taller, no un dato de prueba.

Esta pestaña la ve **todo el personal**, pero en modo distinto según el rol
(ver sección 12): el encargado puede añadir/editar/borrar items y almacenes
y ajustar cantidades; un mecánico solo puede **consultar** el stock
disponible (búsqueda, filtro por almacén, cantidad actual) — sin botones de
añadir/editar/+−/borrar ni acceso a ningún precio, exactamente igual que ya
imponía la RLS de Supabase para escritura.

## 8. Piezas usadas en una reparación (consumo de stock)

Desde el Panel de gestión, cada orden de trabajo tiene un botón **"Piezas
usadas"** (con el número de piezas ya registradas, si hay alguna) que abre
un listado de los repuestos del inventario consumidos en esa reparación.
Al añadir una pieza se descuenta automáticamente esa cantidad del
inventario, y al quitar un registro (por ejemplo, si el mecánico se
equivocó) se repone — ambas operaciones se hacen en la base de datos como
una sola transacción atómica (funciones `registrar_pieza_usada` /
`quitar_pieza_usada` en `schema.sql`, marcadas `security definer` para que
un mecánico pueda invocarlas aunque no tenga permiso directo de escritura
sobre `inventario_items`), para que el registro y el stock nunca queden
desincronizados.

Un buscador por nombre o categoría filtra el desplegable antes de elegir el
item, útil en catálogos largos. El desplegable muestra cuántas unidades
quedan disponibles y no deja seleccionar los que están a 0 ("Agotado"); si
pides más cantidad de la que queda, se avisa pero se permite continuar (por
si el conteo del inventario estuviera desactualizado). La cantidad admite
decimales (ej. 0.5 o 5.5) — necesario para líquidos como el aceite, donde
distintos coches consumen cantidades fraccionarias distintas; el propio
stock del inventario también se guarda con decimales por el mismo motivo
(migración `checkin_split_y_decimales_migration.sql`).

En la propia pestaña de Inventario, además de la etiqueta "Pocas unidades" (≤ 3), los items a cero
se marcan claramente como "Agotado", hay un resumen en la cabecera con
cuántos items están en cada situación, y un filtro rápido ("Poco stock")
para verlos todos juntos.

Un reset de datos de clientes (`reset_database.sql`) sí borra los
registros de `piezas_usadas` (van ligados a las órdenes de trabajo que se
eliminan), pero nunca toca el catálogo de `inventario_items` en sí.

## 9. Distinguir vehículos al entregar

Para no confundir el vehículo al entregarlo cuando hay varios listos a la
vez, tanto el Panel de gestión como la pantalla de Entrega muestran la
primera foto subida en el check-in de cada vehículo (si hay alguna) y una
pastilla con su color (si se indicó al hacer el check-in). En la pantalla
de Entrega, además, si hay más de un vehículo listo se muestra un aviso
recordando fijarse en la foto, el color y la matrícula antes de confirmar.

### 9.1 Ocultar entregados antiguos del tablero

La columna "Entregado" del Panel de gestión deja de mostrar un vehículo
pasados **3 días desde su entrega** (campo `fecha_entrega`, que ya se
guardaba al confirmar la entrega — ver sección 11). No se borra nada: la
orden, sus fotos, la firma y el PDF de salida siguen intactos en la base
de datos y se pueden consultar en cualquier momento desde el **Historial
de vehículo** (sección 17) buscando la matrícula. Si hay vehículos
ocultados por esta regla, la columna muestra un aviso discreto
("+N entregados hace más de 3 días — consulta el Historial de vehículo")
para que quede claro que no han desaparecido de verdad. El umbral de 3
días está en la constante `OCULTAR_ENTREGADOS_TRAS_MS` de
`ManagementPanel.tsx` si en algún momento se quiere cambiar.

## 10. Cancelar una orden de trabajo

Si un cliente cambia de idea o cancela un pedido, cada tarjeta del Panel de
gestión (en cualquier estado salvo "Entregado" o ya "Cancelado") tiene un
botón discreto **"Cancelar orden"**. Al confirmar, la orden pasa a un nuevo
estado **"Cancelado"** con un motivo opcional de texto libre — no se borra
nada, queda en el histórico junto al resto de columnas del tablero, y se
puede consultar el motivo directamente en la tarjeta. Si la orden tenía
piezas del inventario registradas como usadas (sección 8), se devuelven
automáticamente al stock en la misma operación (función SQL
`cancelar_orden_devolviendo_stock`) — si el trabajo no llega a completarse,
esas piezas nunca se llegaron a consumir de verdad.

## 11. Informe de entrega (PDF de salida)

Al confirmar la entrega de un vehículo en la pantalla de Entrega (segunda
firma de conformidad), además de marcar la orden como "Entregado" se genera
automáticamente un segundo informe PDF — distinto del informe de entrada,
sin repetir el detalle de daños/fotos (remite al informe de entrada si hace
falta consultarlo) — con los datos del cliente y el vehículo, la fecha de
entrega y la firma de conformidad de salida. El PDF se sube al mismo bucket
`documentos-pdf` y queda enlazado en la propia orden (`pdf_salida_url`); la
pantalla de éxito ofrece verlo y enviarlo por WhatsApp igual que el informe
de entrada. Si la generación del PDF fallara por lo que sea, la entrega
queda igualmente confirmada — solo se muestra un aviso aparte, nunca bloquea
el proceso.

## 12. Autenticación y roles (admin / dueño / encargado / mecánico / recepcionista / cliente)

Toda cuenta con sesión iniciada en Supabase Auth tiene un **rol** guardado
en la tabla `perfiles`. Desde el batch 19 hay seis roles posibles, en
jerarquía:

- **`admin`** — cuenta de arranque, **se crea solo por SQL directo** (nunca
  desde la app, ver sección 2 y el propio `roles_v2_migration.sql`). Ve y
  puede hacer TODO lo mismo que un `dueno` (Check-in, Panel de gestión,
  todos los datos, **Gestión de personal** incluida) — a petición
  explícita del usuario, no es una pantalla reducida. La única diferencia
  real es que la propia cuenta `admin` no se puede gestionar (editar,
  desactivar, eliminar) desde Gestión de personal salvo que sea ella misma
  quien lo haga, y que nunca aparece en el listado de esa pantalla ni es
  un rol asignable a otra cuenta desde la app — pensada sobre todo para
  poder crear al primer `dueno` del taller (o uno nuevo si hiciera falta
  en el futuro) sin depender de que exista ya una cuenta `dueno` activa.
- **`dueno`** — gestiona el taller entero: todo lo que puede hacer un
  `encargado` (ver abajo) MÁS **Gestión de personal** completa — crear,
  editar (incluido el rol), desactivar o eliminar CUALQUIER cuenta de
  personal, incluidos otros dueños o encargados (un dueño puede crear otro
  dueño; de momento no hay ninguna restricción adicional sobre esto, es
  algo a revisar más adelante si hace falta). Es el rol con más permisos
  operativos del día a día.
- **`encargado`** — mismo acceso operativo que siempre: Check-in, Panel de
  gestión, Entrega, Historial, Próximas revisiones, Agenda, **Inventario**,
  **Flota** y **Estadísticas**. Desde el batch 19 **ya NO ve Gestión de
  personal** — esa pantalla es ahora solo de dueño/admin.
- **`mecanico`** — mismo día a día del taller (Check-in, Panel de gestión,
  Entrega, Historial, Agenda, Inventario en solo lectura), pero **sin**
  Gestión de personal, Flota, Estadísticas ni **Próximas revisiones**, y sin
  ver ningún dato de precio/coste del taller.
- **`recepcionista`** — rol nuevo del batch 19, pensado para quien atiende
  al cliente y la agenda pero no trabaja en el coche: Solicitud de cita,
  Agenda y Panel de gestión (para ver lo pendiente y gestionar bien las
  citas), Check-in, Entrega e Historial. **Sin** Inventario, **sin**
  Próximas revisiones, y sin Flota/Estadísticas/Gestión de personal.
- **`cliente`** — una cuenta que el propio cliente se crea desde el Portal
  de cliente (sección 14). Ve únicamente su propio Portal, nunca los datos
  de otros clientes ni nada del taller.

La primera cuenta de personal (la que se crea a mano en el dashboard,
sección 2 paso 3) pasa a `dueno` al ejecutar `roles_v2_migration.sql` (si
ya tenías el proyecto de antes de este batch, tu cuenta `encargado` se
convierte automáticamente en `dueno` — ver esa migración). A partir de ahí,
el dueño da de alta a todo el resto del personal desde dentro de la propia
app (sección 13) — no hace falta volver al dashboard de Supabase para eso,
salvo para crear una cuenta `admin` (deliberadamente fuera de la app, ver
sección 13).

Toda cuenta que ya existiera en el proyecto antes de aplicar los roles
finos originales se trata como `dueno` automáticamente si la app no
encuentra su fila en `perfiles` (por si alguna migración no se ha
ejecutado todavía), así que ninguna cuenta pierde acceso por eso. El
nombre de la cuenta, en la esquina superior derecha de la barra de
navegación, es un menú desplegable — ver sección 13.1.

**Nota de seguridad**: cambiar el rol o desactivar una cuenta SIEMPRE pasa
por la Edge Function `administrar-cuenta-personal` (que comprueba que quien
llama es dueño/admin) — un trigger en la propia base de datos
(`bloquear_cambio_rol_propio`, ver `roles_v2_migration.sql`) bloquea
cualquier intento de cambiar `rol`/`activo` que no venga de ahí, así que ni
manipulando la petición a mano se puede uno auto-ascender.

## 13. Gestión de personal

Pestaña **"Personal"**, visible SOLO para dueño y admin desde el batch 19
(un encargado ya no la ve), con:

- Un formulario para dar de alta cualquier cuenta de personal (dueño,
  encargado, mecánico o recepcionista — el rol se elige en el propio
  formulario) directamente con nombre, email y contraseña — sin enlaces de
  invitación ni pasos intermedios: en cuanto se crea, esa persona ya puede
  iniciar sesión con esas credenciales. Por debajo llama a la Edge Function
  `crear-cuenta-personal`, que comprueba que quien la invoca es
  efectivamente dueño o admin antes de crear la cuenta (usa la clave
  `service_role` de Supabase, así que no puede hacerse directamente desde
  el frontend con la clave `anon`). El rol `admin` nunca aparece en este
  formulario — se crea solo por SQL directo (ver sección 12).
- Un listado de todas las cuentas de personal (dueños, encargados,
  mecánicos y recepcionistas — las cuentas `admin` NUNCA aparecen aquí, ni
  siquiera para un dueño: se gestionan solo por SQL, como protección extra
  de la cuenta de arranque), cada una con:
  - **Editar**: cambiar el nombre, el email o el rol sin tocar el dashboard
    de Supabase.
  - **Restablecer contraseña**: manda el enlace de restablecimiento al
    email de esa cuenta — ver sección 20.
  - **Desactivar / Reactivar**: bloquea (o desbloquea) el acceso de una
    cuenta sin borrar nada — útil para alguien que ya no trabaja en el
    taller pero cuyo historial (piezas usadas, etc.) interesa conservar.
    Una cuenta desactivada no puede volver a iniciar sesión, y si ya tenía
    una sesión abierta, pierde el acceso a los datos al instante (no hace
    falta esperar a que caduque su token).
  - **Eliminar**: borra la cuenta por completo — irreversible, pide
    confirmación explícita. Para la mayoría de casos, "Desactivar" es la
    opción más segura (se puede revertir).
  - Editar/Restablecer/Desactivar/Eliminar piden confirmación antes de
    ejecutarse cuando la acción es irreversible o bloquea el acceso, y las
    acciones de desactivar/eliminar/cambiar el propio rol están
    deshabilitadas sobre **tu propia cuenta** — así nunca te puedes quedar
    sin ningún dueño/admin con acceso (si de verdad hace falta, pídeselo a
    otro dueño/admin, o hazlo desde el dashboard de Supabase).

Además, **todo el personal** (cualquier rol, incluido mecánico y
recepcionista) puede modificarse **a sí mismo** su nombre y email desde el
menú de la cuenta ("Editar mi nombre/email", ver sección 13.1) aunque no
tenga acceso a esta pantalla — nunca puede cambiarse el propio rol.

**Requiere desplegar dos Edge Functions una vez**, desde tu propio
ordenador (no se puede hacer desde este entorno):

```bash
supabase functions deploy crear-cuenta-personal
supabase functions deploy administrar-cuenta-personal
```

(La antigua `crear-cuenta-mecanico` del batch 8 ya no la usa la app —
puedes borrarla de tu proyecto de Supabase si quieres, no es obligatorio.)
No hace falta configurar ningún secreto adicional para ninguna de las dos —
usan las claves de Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
que la plataforma inyecta automáticamente. Hasta que las despliegues, los
botones correspondientes mostrarán un error claro al usarlos; el resto de
la app funciona con normalidad.

**Cómo crear una cuenta `admin`** (opcional — no hace falta si ya tienes al
menos un `dueno`): crea primero la cuenta en Supabase Auth (Authentication
→ Users → Add user) y luego, desde el SQL Editor:

```sql
update perfiles set rol = 'admin' where email = 'tu-email-admin@ejemplo.com';
```

### 13.1. Menú de la cuenta

El nombre de la cuenta en la barra de navegación (arriba a la derecha, ya
separado visualmente del resto de pestañas) es un menú desplegable con:

- Nombre, email y rol de la propia cuenta.
- **Cambiar mi contraseña**: la cambia directamente sin salir de la app ni
  pasar por el email (ya hay una sesión abierta) — distinto del
  "¿Olvidaste tu contraseña?" de la pantalla de login, pensado para cuando
  SÍ recuerdas la contraseña actual pero quieres cambiarla.
- **Editar mi nombre/email** (nuevo en el batch 19): cualquier cuenta de
  personal (encargado, mecánico, recepcionista... también dueño/admin)
  puede cambiarse su propio nombre y email aquí mismo, aunque no tenga
  acceso a Gestión de personal — nunca su propio rol.
- **Cerrar sesión**.

## 14. Portal de cliente

Pensado para que el cliente pida un servicio ("quiero una revisión de
mantenimiento", "se me ha pinchado una rueda"...) sin llamar por teléfono
ni pasar por el mecánico. Desde la pantalla de login normal hay un enlace
("¿Eres cliente y quieres pedir cita? Entra aquí") que lleva a una pantalla
propia donde el cliente crea su cuenta al momento con solo nombre, email y
contraseña (ver el aviso de "Confirm email" en la sección 2, paso 4, para
que sea instantáneo) o inicia sesión si ya la tiene.

Una vez dentro, el cliente puede:

- Rellenar un formulario con matrícula, marca/modelo, teléfono de
  contacto, tipo de servicio (con los mismos campos de neumáticos que en
  el check-in si aplica) y una descripción libre, y enviarlo como una
  **solicitud**.
- Ver el estado de sus solicitudes (Pendiente / Aceptada / Rechazada /
  Cancelada) y la nota que el taller haya dejado al aceptar o rechazar.
- Cancelar una solicitud propia mientras siga "Pendiente".

Una solicitud es un **aviso previo, no un check-in**: al aceptarla se crea
ya una orden de trabajo de seguimiento en estado **"Solicitado"** — visible
en la columna correspondiente del Panel de gestión, con los datos que el
cliente ya dio (nombre, teléfono, matrícula...) — pero todavía **sin**
ninguna fila real en `clientes`/`vehiculos`: el check-in real (DNI, fotos,
daños marcados y firma) se sigue haciendo desde el Check-in normal cuando
el vehículo llega físicamente al taller. Esa tarjeta "Solicitado" tiene un
botón **"Recibir vehículo"** que lleva directamente al Check-in con el
nombre, teléfono, email, matrícula, marca/modelo y tipo de servicio ya
rellenados (un aviso en la parte superior lo deja claro, y se puede
descartar para hacer un check-in normal en su lugar) — solo falta
completar el DNI, las fotos, los daños y la firma. Al guardar, se completa
esa misma orden (pasa a "Recepcionado") en vez de crear una nueva, así que
la tarjeta no se duplica en el tablero. Rechazar una solicitud, en cambio,
no crea ninguna orden.

El personal revisa las solicitudes desde una pestaña **"Solicitudes de
clientes"** dentro del Panel de gestión (con un contador de pendientes),
donde puede aceptar o rechazar cada una con una nota corta opcional para
el cliente (p. ej. "Te esperamos el jueves a las 9h"). Tanto el contador
como el listado se actualizan solos, sin recargar la página, en cuanto un
cliente crea o cancela una solicitud — ver sección 19.

## 15. Avisar al cliente cuando el vehículo está listo

Al pasar una orden de "En proceso" a "Listo" desde el Panel de gestión, en
vez de avanzar directamente se abre un modal para **concertar una cita de
recogida** (día y hora) con el cliente — la orden no cambia de estado hasta
confirmarla. Una vez guardada la cita (visible después en la propia
tarjeta de la orden), el modal ofrece dos formas de avisar al cliente,
independientes entre sí:

- **Enlace de WhatsApp** (`wa.me`, igual que los informes de entrada/salida
  — no requiere ninguna configuración adicional, funciona siempre).
- **Email automático de verdad**, a través de una Supabase Edge Function
  propia (`enviar-aviso-cliente`) que usa la API de
  [Resend](https://resend.com) — esta sí requiere el despliegue de la
  sección 16. Si no está desplegada, el botón simplemente avisa de que no
  pudo enviarse y sugiere usar WhatsApp mientras tanto; nunca bloquea nada
  del resto de la app.

## 16. Desplegar el aviso por email automático (opcional)

El enlace de WhatsApp no necesita ninguna configuración y ya funciona sin
hacer nada más. Si además quieres que salga un email real al marcar un
vehículo como listo, hace falta desplegar la Edge Function una vez, desde
tu propio ordenador (no se puede hacer desde este entorno):

1. Instala la [Supabase CLI](https://supabase.com/docs/guides/cli) y haz
   login (`supabase login`), vinculando tu proyecto si no lo está ya.
2. Crea una cuenta gratuita en [Resend](https://resend.com) y genera una
   API key.
3. Despliega la función y configura sus secretos:
   ```bash
   supabase functions deploy enviar-aviso-cliente
   supabase secrets set RESEND_API_KEY=tu_clave_de_resend
   supabase secrets set RESEND_FROM="TallerGo <onboarding@resend.dev>"
   ```
4. Listo — el botón "Avisar por email automático" del modal de cita de
   recogida empezará a funcionar sin ningún cambio más en la app.

## 17. Historial de vehículo por matrícula

Pestaña **"Historial"**, disponible tanto para encargado como para
mecánico. Se busca un vehículo por matrícula y se muestran sus datos
(marca, modelo, color, cliente asociado) junto con **todas** sus órdenes de
trabajo pasadas, incluidas las canceladas, con su estado, tipo de servicio,
kilometraje al entrar y enlaces directos a los informes PDF de entrada y de
salida de cada una. Pensado para responder rápido cuando un cliente
pregunta "¿qué le hicisteis la última vez?", sin tener que buscar orden por
orden en el Panel de gestión.

## 18. Próximas revisiones

Pestaña **"Próximas revisiones"**, también disponible para encargado y
mecánico: una lista de los vehículos a los que probablemente toca una
revisión, sin necesidad de repasar el historial de cada uno a mano. Un
vehículo aparece en la lista si se cumple **cualquiera** de estos dos
criterios desde su última visita registrada (no hace falta que se cumplan
los dos a la vez):

- Han pasado más de 12 meses desde la última visita.
- Se estima que ha recorrido más de 15.000 km desde entonces.

Como la app no tiene forma de conocer el kilometraje real de un vehículo
que no está en el taller (no hay ningún dispositivo conectado al coche), el
kilometraje se **estima** de forma lineal a partir del kilometraje
registrado en su última inspección de entrada, asumiendo 15.000 km/año — la
propia pantalla deja claro con un aviso que es una estimación, no un dato
exacto. Es solo una lista informativa: no manda ningún aviso automático al
cliente, eso se decide y se hace a mano (por ejemplo por WhatsApp) si se
quiere contactar.

## 19. Notificaciones en tiempo real

La pestaña "Solicitud de cita" (sección 30) y su aviso numérico en la barra
de navegación usan Supabase Realtime: en cuanto un cliente crea, cancela o
el personal registra/actualiza una solicitud, se refleja al momento en
todas las sesiones de personal abiertas, sin recargar la página. Requiere
que la tabla `solicitudes` esté añadida a la publicación
`supabase_realtime`, lo cual ya hacen tanto `schema.sql` como
`roles_finos_migration.sql` — no hace falta ninguna configuración manual
adicional en el dashboard.

## 20. Recuperación de contraseña

Cualquier cuenta del taller (encargado o mecánico) o del Portal de cliente
que olvide su contraseña puede pedir un enlace de restablecimiento por
email desde el propio enlace "¿Olvidaste tu contraseña?" en su pantalla de
login correspondiente — solo hace falta el email, sin necesidad de que
nadie más intervenga. Además, el encargado puede disparar ese mismo enlace
en nombre de cualquier cuenta del taller desde la pestaña "Personal"
(sección 13), por ejemplo si un mecánico no tiene acceso a su propio email
en ese momento o prefiere que se lo gestionen. En ambos casos, al abrir el
enlace del email se muestra una pantalla para elegir la contraseña nueva;
no hace falta que nadie conozca la contraseña anterior. Recuerda que la
URL desde la que sirves la app debe estar en la lista de **Redirect URLs**
de Supabase (sección 2, paso 5) para que el enlace funcione.

## 21. Despliegue en Vercel (hosting gratuito)

La app se puede alojar gratis en [Vercel](https://vercel.com), con
despliegue automático cada vez que se hace push a `main`:

1. Crea una cuenta en Vercel (puede ser con tu cuenta de GitHub) y pulsa
   **"Add New... → Project"**, eligiendo el repositorio
   `Marukunai/taller-app`.
2. **Importante — "Root Directory":** el proyecto Vite real está anidado un
   nivel más abajo dentro del repositorio (`taller-app/`, no la raíz). En
   la pantalla de configuración del proyecto, despliega **"Root
   Directory"** y selecciona la carpeta `taller-app` — si no, el build
   falla porque Vercel busca el `package.json` en la raíz del repo.
3. Añade las variables de entorno del paso 3 de este README
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) en **Project Settings →
   Environment Variables** — Vercel no lee `.env.local` (normalmente ni se
   sube al repositorio).
4. Pulsa **Deploy**. Al terminar, Vercel da una URL del tipo
   `tallergo.vercel.app` (o `taller-app-xxxx.vercel.app` si el nombre ya
   está cogido — se puede cambiar después en **Settings → Domains**).
5. **Con la URL ya asignada**, dos últimos pasos:
   - Añádela a **Authentication → URL Configuration → Redirect URLs** en
     Supabase (sección 2, paso 5 de este README), sin quitar
     `http://localhost:5173` — si no, la recuperación de contraseña
     (sección 20) no funcionará en producción.
   - Actualiza el dominio en las etiquetas `og:image`, `og:url`,
     `twitter:image` de `index.html` (ver sección 22 más abajo) — si no, la
     vista previa al compartir el enlace por WhatsApp no encontrará la
     imagen.

**Estado actual del despliegue**: la app ya está en producción en
`https://taller-app-bay-tau.vercel.app`, con las etiquetas Open Graph de
`index.html` apuntando a ese dominio.

## 22. Vista previa al compartir por WhatsApp/redes sociales

`index.html` incluye las etiquetas Open Graph/Twitter Card (`og:title`,
`og:image`, `twitter:card`, etc.) y una imagen propia
(`public/og-image.png`, 1200×630, generada a partir de
`public/og-image-source.svg`) para que al compartir el enlace de la app
por WhatsApp, Telegram o redes sociales aparezca una tarjeta con el
logo/nombre de TallerGo en vez de un enlace pelado. Estas etiquetas
necesitan una URL absoluta para que WhatsApp pueda descargar la imagen —
actualmente apuntan a `https://taller-app-bay-tau.vercel.app`, el dominio
real ya desplegado. Si en el futuro cambias de dominio (por ejemplo, al
añadir uno propio en **Settings → Domains** de Vercel), recuerda actualizar
las URLs de `og:image`/`og:url`/`twitter:image` en `index.html` y volver a
desplegar. Tras cualquier cambio de dominio, conviene comprobar la vista
previa con una herramienta como el
[Sharing Debugger de Facebook](https://developers.facebook.com/tools/debug/)
(WhatsApp reutiliza el mismo sistema de rastreo de Open Graph), ya que
WhatsApp cachea la primera vista previa que ve de una URL.

## 23. Limpiar datos de prueba antes de producción

Una vez desplegada la app y probada, antes de empezar a usarla de verdad
conviene limpiar los datos que hayas ido creando mientras probabas.
Ejecuta [`supabase/limpiar_datos_prueba.sql`](./supabase/limpiar_datos_prueba.sql)
en el **SQL Editor** de Supabase:

- Borra todos los clientes, vehículos, órdenes de trabajo, inspecciones,
  piezas usadas registradas y solicitudes del Portal de cliente
  (incluido el cliente de ejemplo "Juan Pérez" si sigue ahí).
- Vuelve a dejar el inventario en su catálogo inicial de 55 items "de
  fábrica", todos en "Almacén 1" — si has creado más de un almacén o
  items propios que no estaban en el catálogo original, se pierden con
  este paso.
- **No toca** las cuentas de personal/encargado ni las cuentas de cliente
  ya registradas en Supabase Auth (solo se borran sus solicitudes, no la
  cuenta en sí).

A diferencia de [`reset_database.sql`](./supabase/reset_database.sql) (que
borra y recrea las tablas desde cero, y siempre vuelve a insertar el
cliente de ejemplo), este script solo borra filas — no hace falta
ejecutar nada más después.

**Fotos, firmas y PDFs de prueba ya subidos**: borrar filas de la base de
datos no borra los archivos ya subidos a Storage. Para vaciarlos también,
ve al panel **Storage** de tu proyecto Supabase, entra en cada uno de los
3 buckets (`fotos-vehiculos`, `firmas`, `documentos-pdf`), selecciona
todos los archivos y bórralos desde ahí.

## 24. Coche de sustitución (flota propia)

Pestaña **"Flota"**, visible solo para el encargado, para gestionar los
coches propios del taller que se prestan a un cliente mientras dura el
servicio del suyo. Es un catálogo propio (como los almacenes de
Inventario), independiente de clientes/vehículos: se puede dar de alta un
coche (matrícula, marca, modelo, un **precio por hora** opcional y notas),
editarlo, y **dar de baja** uno que deje de estar disponible (por ejemplo,
se vendió) sin borrarlo — así no se pierde el histórico de préstamos que lo
referencian; un coche dado de baja se puede reactivar en cualquier momento.
El precio por hora (`coches_repuesto.precio_hora`, null = no se cobra) es
solo informativo por ahora — de cara al futuro, para poder facturar el
préstamo si el taller decide cobrarlo.

La disponibilidad de cada coche (**Libre** o **Prestado**, con la
matrícula del cliente y la fecha desde la que lo tiene) no se guarda a
mano en ningún sitio: se calcula sola comprobando si alguna orden de
trabajo lo tiene asignado sin devolver todavía. Asignar o devolver un coche concreto a un cliente no se
hace desde "Flota", sino desde la propia tarjeta de la orden en el Panel
de gestión (visible mientras el vehículo del cliente está físicamente en
el taller: Recepcionado, En proceso o Listo): un botón **"Coche de
sustitución"** abre un modal con los coches libres de la flota para
elegir uno, y una vez asignado la tarjeta muestra su matrícula con un
botón **"Devuelto"** para cerrar el préstamo cuando el cliente lo trae de
vuelta.

## 25. Presupuesto / factura interna

Documento de **gestión interna** por orden de trabajo — ⚠️ **no es una
factura fiscal válida ante Hacienda** (sin numeración correlativa oficial
ni desglose de IVA), a propósito: es un resumen de mano de obra + piezas
usadas, pensado para que el taller y el cliente sepan a qué atenerse, no
para sustituir la contabilidad fiscal real del negocio.

Solo el **encargado** puede crear/editar un presupuesto — botón
**"Presupuesto"** en cada tarjeta del Panel de gestión (nunca visible para
un mecánico, ni la propia pantalla ni ningún precio en ella). Desde el
modal:

- Se indica un **concepto y precio de mano de obra** libres.
- **"Recalcular desde piezas usadas"** vuelca el detalle de
  `piezas_usadas` de esa orden con el precio guardado en
  **Inventario** (ver más abajo) — es un cálculo bajo demanda, no algo que
  se mantenga sincronizado solo: hay que pulsarlo de nuevo si se añaden o
  quitan piezas después.
- Si la orden viene de una **solicitud del Portal de cliente**, se puede
  **"Enviar al cliente"**: el cliente lo ve en su Portal y puede
  **aprobarlo o rechazarlo** (con una nota opcional) desde su propia
  cuenta.
- Si la orden es de un check-in directo (sin solicitud de por medio, así
  que el cliente no tiene cuenta), el encargado marca **aprobado/rechazado
  a mano** tras acordarlo por teléfono o WhatsApp.

Al **entregar el vehículo** (Entrega), si la orden tiene un presupuesto,
se genera automáticamente un PDF de factura final (mano de obra + piezas +
total) y se sube junto al resto de documentos — sin bloquear la entrega si
falla. El PDF queda enlazado también en el Portal del cliente, junto al
presupuesto.

Los precios de los items de Inventario se guardan en una pantalla nueva
dentro de **Inventario** (icono de € bajo cada item, solo visible porque
esa pestaña ya es exclusiva del encargado) — es una tabla `inventario_
precios` **totalmente aparte** de `inventario_items` y de `piezas_usadas`,
para que un mecánico nunca pueda ver ningún coste ni inspeccionando las
peticiones de red (ver sección 12).

## 26. Agenda (citas de recogida y de check-in)

Pestaña **"Agenda"**, visible para cualquier personal, con una lista
cronológica (agrupada por día) de:

- Las citas de **recogida** ya concertadas por el taller al marcar una
  orden como "Listo" (lo que antes solo se veía en la propia tarjeta del
  Panel de gestión).
- Las citas de **check-in** que el cliente propone al pedir un servicio
  desde el Portal — un nuevo campo opcional de fecha/hora en el formulario
  de solicitud (`solicitudes.fecha_cita_checkin`), con la misma sencillez
  que la cita de recogida: una propuesta, sin gestión de franjas horarias
  ni de aforo. El personal la ve también en **Solicitud de cita** (sección
  30), y puede confirmarla o proponer otra por teléfono si no encaja.

No sustituye ningún calendario externo — es una vista de solo lectura
pensada para ver de un vistazo qué se espera cada día.

## 27. Panel de estadísticas

Pestaña **"Estadísticas"**, solo para el encargado (incluye datos de
ingresos). Cuatro indicadores, calculados en el cliente a partir de las
tablas existentes (sin ninguna vista SQL nueva):

- **Tiempo medio de reparación**: entre `fecha_entrada` y `fecha_entrega`
  de las órdenes ya entregadas.
- **Piezas más solicitadas**: agregado de `piezas_usadas` por nombre.
- **Ingresos**: suma de presupuestos en estado **aprobado** (mano de obra
  + piezas), con desglose por mes.
- **Volumen de órdenes**: por estado, y por mes.

Los gráficos son barras simples con CSS (sin ninguna librería de
gráficos nueva, para no depender de una instalación npm extra).

## 28. Buscador global

Campo de búsqueda en la barra de navegación (visible para cualquier
personal) que busca a la vez por **matrícula**, **nombre de cliente** o
**DNI**, y lleva directamente al **Historial de vehículo** del resultado
elegido, ya con la búsqueda hecha — para no tener que ir primero a
Historial y teclear la matrícula a mano.

## 29. Aplicación instalable (PWA)

TallerGo se puede **instalar** como aplicación (icono en el escritorio o
en la pantalla de inicio del móvil, sin barra de navegador) gracias a un
`manifest.json` y un Service Worker mínimos (hechos a mano, sin depender
de ninguna librería nueva). El Service Worker **no cachea agresivamente a
propósito**: esta app vive de datos siempre frescos de Supabase (stock,
órdenes, solicitudes en tiempo real...), así que solo sirve del caché como
último recurso si la red falla (por ejemplo, sin conexión) — nunca
antepone una versión guardada a una petición que sí puede completarse.

## 30. Solicitud de cita (paso 1 del check-in)

El check-in se divide en dos pasos, para poder anotar una cita antes de que
el vehículo esté físicamente en el taller:

1. **Solicitud de cita** (pestaña propia, con icono de calendario): datos
   del dueño y del vehículo (nombre, teléfono, email opcional, matrícula,
   marca, modelo, tipo de servicio y, si se conoce, fecha propuesta para
   traerlo) — SIN daños, kilometraje ni firma. Se rellena tanto desde el
   Portal de cliente (sección 14) como, con el formulario "+ Nueva
   solicitud" de esta misma pestaña, por el propio personal (una llamada
   telefónica, o un cliente sin cuenta del Portal). Ambos orígenes caen en
   la misma tabla `solicitudes` y en el mismo listado de abajo
   ("Pendientes de revisar" / "Ya revisadas"), con una etiqueta "Del
   taller" en las que registró el propio personal para distinguirlas.
2. **Check-in** (sección 6): cuando el vehículo llega de verdad, se pulsa
   "Recibir vehículo" sobre la solicitud aceptada (desde el Panel de
   gestión) para completar el check-in real — daños, kilometraje y
   firma — sin volver a teclear los datos del dueño ni del vehículo. Un
   check-in también se puede seguir haciendo de un tirón, sin pasar antes
   por una solicitud, exactamente igual que siempre.

La pestaña de navegación muestra un aviso numérico con las solicitudes
pendientes de revisar (cualquiera que sea su origen), en tiempo real vía
Supabase Realtime.

## 31. Próximos pasos sugeridos (fuera de este MVP)

- Panel de gestión con calendario visual completo (`@fullcalendar/react`)
  en vez de la lista cronológica sencilla de la Agenda (sección 26).
- Numeración fiscal real y desglose de IVA, si en algún momento hiciera
  falta emitir facturas válidas ante Hacienda (hoy el Presupuesto/factura
  interna, sección 25, es deliberadamente un documento de gestión, no
  fiscal).
- Historial de kilometraje real por vehículo (por ejemplo, pidiéndolo en
  cada visita) para que "Próximas revisiones" deje de depender de una
  estimación.
- Agenda en vista mensual tipo calendario con un color por día (verde =
  libre, naranja = algunas horas libres, rojo = día ocupado), en vez de la
  lista cronológica actual (sección 26).
- Al aceptar una "Solicitud de cita" (sección 30), un botón para añadirla a
  la Agenda automáticamente con el horario propuesto — con la última
  palabra siempre del mecánico/encargado antes de confirmarlo.
- Préstamo de coche de sustitución: mostrar en la propia asignación el día
  y hora previstos de devolución y el nombre del cliente (hoy solo se ve la
  matrícula y desde cuándo), restringir quién puede prestar uno a
  dueño/encargado, y un botón para "enlazar" el coche de sustitución
  directamente a la orden de reparación del vehículo que lo pide desde la
  propia Flota (sección 24).
- Aviso automático anual (opcional, con un botón de aceptar junto a la
  firma de salida) para que el cliente reciba un recordatorio de revisión
  un año después de pasar por el taller.
- Datalist con fabricantes y modelos de vehículo reales (dependiente del
  fabricante elegido), tipo de combustible, año del modelo y prestaciones
  del motor — manteniendo marca/modelo como campos obligatorios y dejando
  siempre la opción de escribir un valor que no esté en la lista.
- Selector de medida de neumático por datalist (ancho/perfil/llanta/índice
  de carga/índice de velocidad/estación), además de la foto actual, al
  estilo de buscadores de neumáticos como el de Vulco.
- De cara a más adelante: modelo de suscripción por mensualidad, y qué
  implicaría dar servicio a varios talleres distintos desde la misma app
  (aislar la base de datos de cada uno).
