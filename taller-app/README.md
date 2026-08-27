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
   `solicitudes`), las políticas de RLS, la publicación de Realtime y unos
   datos de prueba.
2. Ve a **Storage** y crea estos 3 buckets, marcados como **Public**:
   - `fotos-vehiculos`
   - `firmas`
   - `documentos-pdf`
   El cuarto bucket (`inventario-imagenes`, para las fotos del inventario)
   no hace falta crearlo a mano: lo crea el propio `schema.sql` por SQL.
3. Ve a **Authentication → Users → Add user** y crea el usuario (email +
   contraseña) con el que el **encargado** iniciará sesión en la app por
   primera vez — el resto de cuentas del taller (mecánicos) se crean después
   desde dentro de la propia app, no hace falta darlas de alta a mano aquí
   (ver sección 13). La app no tiene pantalla de registro público para el
   personal. (El Portal de cliente, en cambio, sí tiene registro propio —
   ver sección 14.)
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
  components/
    CarDamagePicker.tsx    # esquema del coche interactivo para marcar daños
    SignatureModal.tsx     # modal de firma digital + cláusulas legales + RGPD
    LoginScreen.tsx         # pantalla de acceso del personal (email + contraseña)
    ClientAuthScreen.tsx    # registro/login propio del Portal de cliente
    ResetPasswordScreen.tsx # pantalla de "elige tu nueva contraseña" (enlace del email)
    CuentaMenu.tsx           # menú de la cuenta en la barra: cambiar contraseña, cerrar sesión
    PiezasUsadasModal.tsx   # registrar/quitar piezas de inventario usadas en una orden
    CitaRecogidaModal.tsx   # concierta cita de recogida y avisa al cliente ("Listo")
    CancelarOrdenModal.tsx  # cancela una orden de trabajo (pasa a "Cancelado")
    SolicitudesPanel.tsx    # revisión de solicitudes creadas por clientes (en tiempo real)
    ExitReportPdf.tsx        # plantilla del informe PDF de entrega/salida
  pages/
    InspectionForm.tsx    # formulario completo de check-in de entrada
    ManagementPanel.tsx     # tablero de órdenes de trabajo por estado + solicitudes
    CheckoutForm.tsx         # entrega del vehículo (segunda firma + informe de salida)
    InventoryPanel.tsx       # inventario/almacén de repuestos del taller (solo encargado)
    PersonnelPanel.tsx        # alta, edición, desactivación y borrado de cuentas (solo encargado)
    HistorialVehiculo.tsx      # historial de un vehículo por matrícula
    ProximasRevisiones.tsx      # lista de vehículos a los que probablemente toca revisión
    ClientPortal.tsx              # portal del cliente (pedir servicio, ver solicitudes)
supabase/
  schema.sql                     # DDL, políticas RLS, buckets, Realtime y seed data (todo al día)
  portal_taller_migration.sql    # migración incremental: almacenes, Portal de cliente, etc.
  roles_finos_migration.sql       # migración incremental: roles finos, historial, Realtime, etc.
  gestion_personal_migration.sql   # migración incremental: activo (des/reactivar cuentas)
  functions/
    enviar-aviso-cliente/         # Edge Function: email real de "vehículo listo"
    crear-cuenta-mecanico/         # Edge Function: alta de cuentas de mecánico desde la app
    administrar-cuenta-personal/   # Edge Function: editar/desactivar/reactivar/eliminar cuentas
```

## 6. Flujo del formulario de check-in

1. Se rellenan los datos del cliente y del vehículo.
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
botones +/-, y añadir items nuevos (nombre, categoría, talla/medida
opcional, cantidad y una foto opcional para distinguir piezas parecidas).
Las tarjetas de cada item son lo bastante grandes como para que el nombre
nunca se corte con "..." — si es largo, ocupa dos líneas en vez de una.

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

Esta pestaña **solo la ve el encargado** — ver sección 12.

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

El desplegable para elegir el item muestra cuántas unidades quedan
disponibles y no deja seleccionar los que están a 0 ("Agotado"); si pides
más cantidad de la que queda, se avisa pero se permite continuar (por si el
conteo del inventario estuviera desactualizado). En la propia pestaña de
Inventario, además de la etiqueta "Pocas unidades" (≤ 3), los items a cero
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

## 10. Cancelar una orden de trabajo

Si un cliente cambia de idea o cancela un pedido, cada tarjeta del Panel de
gestión (en cualquier estado salvo "Entregado" o ya "Cancelado") tiene un
botón discreto **"Cancelar orden"**. Al confirmar, la orden pasa a un nuevo
estado **"Cancelado"** con un motivo opcional de texto libre — no se borra
nada, queda en el histórico junto al resto de columnas del tablero, y se
puede consultar el motivo directamente en la tarjeta.

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

## 12. Autenticación y roles (encargado / mecánico / cliente)

Toda cuenta con sesión iniciada en Supabase Auth tiene un **rol** guardado
en la tabla `perfiles`, uno de tres:

- **`encargado`** — acceso completo: Check-in, Panel de gestión, Entrega,
  Historial, Próximas revisiones, **Inventario** y **Gestión de personal**
  (sección 13). Es quien da de alta a los mecánicos y quien puede
  restablecer la contraseña de cualquier cuenta del taller.
- **`mecanico`** — mismo día a día del taller (Check-in, Panel de gestión,
  Entrega, Historial, Próximas revisiones), pero **sin** la pestaña de
  Inventario ni la de Gestión de personal, y sin ver ningún dato de
  precio/coste del taller — ni el inventario actual ni ningún campo de
  precio/coste que se añada en el futuro está pensado para que lo vea un
  mecánico; esa restricción se aplica ocultando la pestaña entera, no solo
  algunos campos sueltos dentro de ella.
- **`cliente`** — una cuenta que el propio cliente se crea desde el Portal
  de cliente (sección 14). Ve únicamente su propio Portal, nunca los datos
  de otros clientes ni nada del taller.

La primera cuenta de personal (la que se crea a mano en el dashboard,
sección 2 paso 3) es siempre `encargado`. A partir de ahí, el encargado da
de alta a los mecánicos desde dentro de la propia app (sección 13) — no
hace falta volver al dashboard de Supabase para eso.

Toda cuenta que ya existiera en el proyecto antes de aplicar los roles
finos se trata como `encargado` automáticamente (tanto por las migraciones
SQL como, por si acaso, por la propia app: si la tabla `perfiles` no
existe todavía o no encuentra una fila para la sesión activa, asume rol
`encargado` en vez de bloquear el acceso), así que ninguna cuenta pierde
acceso por no haber aplicado la migración todavía. El nombre de la cuenta,
en la esquina superior derecha de la barra de navegación, es un menú
desplegable — ver sección 13.1.

## 13. Gestión de personal

Pestaña **"Personal"**, visible solo para el encargado, con:

- Un formulario para dar de alta una cuenta de **mecánico** directamente
  (nombre, email y contraseña) — sin enlaces de invitación ni pasos
  intermedios: en cuanto se crea, esa persona ya puede iniciar sesión con
  esas credenciales. Por debajo llama a la Edge Function
  `crear-cuenta-mecanico`, que comprueba que quien la invoca es
  efectivamente un encargado antes de crear la cuenta (usa la clave
  `service_role` de Supabase, así que no puede hacerse directamente desde
  el frontend con la clave `anon`).
- Un listado de todas las cuentas del taller (encargados y mecánicos), cada
  una con:
  - **Editar**: cambiar el nombre, el email o el rol (ascender un mecánico
    a encargado, o degradar un encargado a mecánico) sin tocar el dashboard
    de Supabase.
  - **Restablecer contraseña**: manda el enlace de restablecimiento al
    email de esa cuenta — ver sección 20.
  - **Desactivar / Reactivar**: bloquea (o desbloquea) el acceso de una
    cuenta sin borrar nada — útil para un mecánico que ya no trabaja en el
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
    sin ningún encargado con acceso (si de verdad hace falta, pídeselo a
    otro encargado, o hazlo desde el dashboard de Supabase).

**Requiere desplegar dos Edge Functions una vez**, desde tu propio
ordenador (no se puede hacer desde este entorno):

```bash
supabase functions deploy crear-cuenta-mecanico
supabase functions deploy administrar-cuenta-personal
```

No hace falta configurar ningún secreto adicional para ninguna de las dos —
usan las claves de Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
que la plataforma inyecta automáticamente. Hasta que las despliegues, los
botones correspondientes mostrarán un error claro al usarlos; el resto de
la app funciona con normalidad.

### 13.1. Menú de la cuenta

El nombre de la cuenta en la barra de navegación (arriba a la derecha, ya
separado visualmente del resto de pestañas) es un menú desplegable con:

- Nombre, email y rol de la propia cuenta.
- **Cambiar mi contraseña**: la cambia directamente sin salir de la app ni
  pasar por el email (ya hay una sesión abierta) — distinto del
  "¿Olvidaste tu contraseña?" de la pantalla de login, pensado para cuando
  SÍ recuerdas la contraseña actual pero quieres cambiarla.
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

Una solicitud es un **aviso previo, no un check-in**: aceptarla no crea
ninguna orden de trabajo ni fila en `clientes`/`vehiculos` todavía — el
check-in real (fotos, daños marcados, firma) se sigue haciendo desde el
Check-in normal, exactamente igual que siempre, cuando el vehículo llega
físicamente al taller. El personal revisa las solicitudes desde una
pestaña **"Solicitudes de clientes"** dentro del Panel de gestión (con un
contador de pendientes), donde puede aceptar o rechazar cada una con una
nota corta opcional para el cliente (p. ej. "Te esperamos el jueves a las
9h"). Tanto el contador como el listado se actualizan solos, sin recargar
la página, en cuanto un cliente crea o cancela una solicitud — ver
sección 19.

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

La pestaña "Solicitudes de clientes" (dentro del Panel de gestión) y su
contador de pendientes usan Supabase Realtime: en cuanto un cliente crea,
cancela o el personal actualiza una solicitud, se refleja al momento en
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

## 23. Próximos pasos sugeridos (fuera de este MVP)

- Panel de gestión con calendario (`@fullcalendar/react`) para entradas/salidas.
- Que aceptar una solicitud del Portal de cliente pueda crear directamente
  un borrador de cliente/vehículo, para no volver a teclear los mismos
  datos en el Check-in cuando el coche llega físicamente.
- Sugerir automáticamente el precio/coste de las piezas usadas en la
  factura final (hoy `piezas_usadas` no guarda precio, solo cantidad) —
  recordando que, si se añade, el mecánico no debe verlo (sección 12).
- Historial de kilometraje real por vehículo (por ejemplo, pidiéndolo en
  cada visita) para que "Próximas revisiones" deje de depender de una
  estimación.
