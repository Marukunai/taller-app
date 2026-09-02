// =============================================================
// Taller App · Edge Function: crear cuenta de personal
//
// Sustituye a la antigua "crear-cuenta-mecanico" (batch 8) desde el batch 19:
// ahora crea CUALQUIER cuenta de personal (dueño, encargado, mecánico o
// recepcionista), no solo mecánico — el rol se elige en el propio
// formulario de "Gestión de personal" (solo visible para admin/dueño desde
// este batch, ver App.tsx/PersonnelPanel.tsx).
//
// Se invoca así: supabase.functions.invoke('crear-cuenta-personal', {body:
// {nombre, email, password, rol}}). Crea una cuenta de Supabase Auth nueva y
// le asigna el rol pedido en la tabla `perfiles`.
//
// Por qué hace falta una Edge Function y no basta con el cliente normal:
// crear una cuenta de Auth EN NOMBRE de otra persona (sin que esa persona
// se registre ella misma) requiere la API de administración de Supabase
// Auth (auth.admin.createUser), que solo funciona con la clave
// service_role — una clave que NUNCA debe llegar al navegador, así que
// esta lógica tiene que vivir en el servidor (aquí).
//
// Seguridad: antes de crear nada, esta función comprueba que quien la llama
// es realmente 'admin' o 'dueno' (con su propio token de sesión, sin
// privilegios de admin) — un 'encargado' YA NO puede crear cuentas desde el
// batch 19 (antes sí podía). El rol 'admin' nunca es asignable desde aquí
// (se crea solo por SQL directo, ver README) — si se pide, se rechaza.
//
// DESPLIEGUE (desde tu propio ordenador, con la Supabase CLI instalada):
//   supabase functions deploy crear-cuenta-personal
// No hace falta configurar ningún secreto extra: SUPABASE_URL,
// SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase
// automáticamente en toda Edge Function.
//
// Nota: la función antigua "crear-cuenta-mecanico" ya no la usa la app —
// puedes borrarla de tu proyecto de Supabase si quieres (Edge Functions →
// eliminar), no es obligatorio, simplemente queda sin uso.
//
// Si esta función no está desplegada, el botón "Crear cuenta" de Gestión de
// personal falla con un aviso claro — el resto de la app funciona igual,
// esto no es un requisito para nada más.
// =============================================================

// @ts-nocheck — este archivo se ejecuta en el runtime Deno de Supabase Edge
// Functions, no con el tsc/eslint de Node del resto del proyecto (por eso
// usa `Deno.serve`/`Deno.env` y URLs de import remotas, que ni tsc ni
// eslint del proyecto principal entienden).
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonError(mensaje, status) {
  return new Response(JSON.stringify({ error: mensaje }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// 'admin' nunca es asignable desde aquí — solo por SQL directo (ver
// README). 'cliente' tampoco — esa cuenta se auto-asigna al registrarse en
// el Portal.
const ROLES_ASIGNABLES = ['dueno', 'encargado', 'mecanico', 'recepcionista'];

interface Body {
  nombre: string;
  email: string;
  password: string;
  rol: 'dueno' | 'encargado' | 'mecanico' | 'recepcionista';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError('Faltan variables de entorno de Supabase en la función.', 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonError('Falta la cabecera Authorization.', 401);
  }

  try {
    // Cliente "de quien llama": usa la clave anon + el token de sesión de
    // quien invoca la función (NO tiene privilegios de admin) — sirve solo
    // para averiguar quién es y comprobar su rol.
    const clienteLlamada = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: llamante },
      error: errorUsuario,
    } = await clienteLlamada.auth.getUser();

    if (errorUsuario || !llamante) {
      return jsonError('Sesión no válida.', 401);
    }

    const { data: perfilLlamante, error: errorPerfil } = await clienteLlamada
      .from('perfiles')
      .select('rol, activo')
      .eq('id', llamante.id)
      .single();

    if (
      errorPerfil ||
      !['admin', 'dueno'].includes(perfilLlamante?.rol) ||
      perfilLlamante?.activo === false
    ) {
      return jsonError('Solo un dueño o administrador puede crear cuentas de personal.', 403);
    }

    const { nombre, email, password, rol } = (await req.json()) as Body;
    if (!nombre?.trim() || !email?.trim() || !password) {
      return jsonError('Faltan datos (nombre, email, password).', 400);
    }
    if (password.length < 6) {
      return jsonError('La contraseña debe tener al menos 6 caracteres.', 400);
    }
    if (!ROLES_ASIGNABLES.includes(rol)) {
      return jsonError('Rol no válido.', 400);
    }

    // Cliente admin: SOLO a partir de aquí, y solo porque ya se comprobó
    // arriba que quien llama es admin o dueño.
    const clienteAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: nuevoUsuario, error: errorCrear } = await clienteAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true, // no hace falta que la cuenta nueva confirme el email
      user_metadata: { full_name: nombre.trim() },
    });

    if (errorCrear || !nuevoUsuario?.user) {
      return jsonError(errorCrear?.message ?? 'No se pudo crear la cuenta.', 400);
    }

    // El trigger handle_new_user ya habrá creado la fila en `perfiles` con
    // rol por defecto 'cliente' — se corrige aquí al rol pedido. El cliente
    // admin (service_role) bypasea RLS, así que esto funciona siempre.
    const { error: errorActualizarPerfil } = await clienteAdmin
      .from('perfiles')
      .update({ rol, nombre: nombre.trim(), email: email.trim() })
      .eq('id', nuevoUsuario.user.id);

    if (errorActualizarPerfil) {
      return jsonError(`Cuenta creada, pero no se pudo asignar el rol: ${errorActualizarPerfil.message}`, 500);
    }

    return new Response(JSON.stringify({ ok: true, id: nuevoUsuario.user.id }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Error desconocido', 500);
  }
});
