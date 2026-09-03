# Desplegar TallerGo para un taller cliente nuevo

Checklist para cuando cierres tu primera venta (o la siguiente) y tengas
que dar de alta un taller distinto al tuyo. **No es multi-tenant**: cada
taller tiene su propio proyecto de Supabase (base de datos totalmente
aislada) y su propio proyecto de Vercel, ambos desplegados a partir del
mismo repositorio de GitHub — el código es idéntico para todos, solo
cambian las variables de entorno de cada proyecto. Es la opción más
simple y segura mientras tengas pocos clientes; si el número de talleres
crece lo suficiente como para que mantener un proyecto por cliente sea
una carga operativa, entonces sí merece la pena evaluar un modelo
multi-tenant de verdad (ver sección 31 del README) — no antes.

Cada paso enlaza a la sección del README con el detalle completo; aquí
solo está el orden y lo específico de repetir esto para un cliente nuevo.

## 1. Supabase — proyecto nuevo

- [ ] Crea un proyecto de Supabase nuevo (uno por cliente, nunca
      compartido) — [supabase.com](https://supabase.com).
- [ ] Ejecuta el contenido completo de `supabase/schema.sql` en su SQL
      Editor (README sección 2, paso 1). No hace falta ningún archivo de
      migración adicional (`batch18_migration.sql`, etc.) — esos son solo
      para poner al día un proyecto que ya existía antes; `schema.sql`
      ya trae todo lo publicado hasta la fecha en un único script.
- [ ] Crea los 3 buckets de Storage marcados como **Public**:
      `fotos-vehiculos`, `firmas`, `documentos-pdf` (README sección 2,
      paso 2 — los otros 2 buckets los crea el propio `schema.sql`).
- [ ] Crea la cuenta de Auth del dueño de ESE taller (README sección 2,
      paso 3).
- [ ] Si quieres que el Portal de cliente no pida confirmar el email,
      desactiva **Confirm email** (README sección 2, paso 4).
- [ ] Anota la URL del proyecto y la clave `anon`/`public` (**Project
      Settings → API**) — las necesitas en el paso 3.

## 2. Edge Functions

- [ ] Despliega las Edge Functions del proyecto (`crear-cuenta-personal`,
      `administrar-cuenta-personal`, y `aviso-anual-revision` si vas a
      usar el aviso por email — README sección 16) apuntando a ESTE
      proyecto de Supabase nuevo, no al tuyo.

## 3. Vercel — proyecto nuevo

- [ ] En Vercel, **Add New → Project** e importa `Marukunai/taller-app`
      OTRA VEZ — Vercel permite importar el mismo repositorio varias
      veces como proyectos independientes. **Root Directory: `taller-app`**
      (README sección 21, paso 2 — fácil de olvidar).
- [ ] Variables de entorno de ESTE proyecto (README sección 3):
      ```
      VITE_SUPABASE_URL=<la del proyecto Supabase de este cliente>
      VITE_SUPABASE_ANON_KEY=<la de este cliente>
      VITE_SITE_URL=<el dominio que Vercel te asigne a este proyecto, sin barra final>
      ```
      **No reutilices las de tu propio taller ni las de otro cliente.**
      `VITE_SITE_URL` es la que evita tener que tocar `index.html` a
      mano — solo hace falta rellenarla bien aquí (ver README sección 22).
- [ ] Despliega. Anota la URL que te da Vercel.

## 4. Últimos pasos con la URL ya asignada

- [ ] Añádela a **Authentication → URL Configuration → Redirect URLs**
      en el proyecto Supabase de este cliente (README sección 2, paso 5)
      — si no, la recuperación de contraseña no funcionará.
- [ ] Comprueba la vista previa de WhatsApp con el
      [Sharing Debugger de Facebook](https://developers.facebook.com/tools/debug/)
      (README sección 22) — confirma que `VITE_SITE_URL` se aplicó bien.
- [ ] Regenera los carteles con QR (`marketing/carteles/`) con la URL de
      ESTE cliente antes de dárselos — los actuales llevan grabada la
      URL de tu propio taller.

## 5. Datos de prueba

- [ ] `schema.sql` inserta un catálogo de inventario de ejemplo y algún
      dato de prueba — revisa/limpia lo que no aplique a este taller
      concreto antes de dárselo por bueno (README sección 23,
      `supabase/limpiar_datos_prueba.sql` si hace falta).

---

Mantenimiento futuro: cuando saques un batch nuevo de funcionalidad,
recuerda que hay que ejecutar su migración SQL (`batchNN_migration.sql`)
EN CADA proyecto de Supabase de cada cliente por separado — el `git push`
del código sí despliega solo (Vercel redespliega cada proyecto
automáticamente desde el mismo repo), pero el SQL de cada uno hay que
correrlo a mano, uno a uno.
