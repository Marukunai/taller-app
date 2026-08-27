// =============================================================
// Taller App · Edge Function: administrar una cuenta de personal
// existente (encargado o mecánico) — editar, desactivar, reactivar o
// eliminar.
//
// Se invoca desde "Gestión de personal" (solo visible para un encargado) —
// supabase.functions.invoke('administrar-cuenta-personal', {body: {accion,
// cuenta_id, ...}}). Cuatro acciones posibles:
//   - 'editar':     cambia nombre, email y/o rol de una cuenta existente.
//   - 'desactivar': bloquea el acceso de la cuenta (no se borra nada).
//   - 'reactivar':  revierte una desactivación.
//   - 'eliminar':   borra la cuenta de Supabase Auth (y, en cascada, su
//                   fila en `perfiles`) — irreversible.
//
// Por qué hace falta una Edge Function (y no basta con el cliente normal):
// cambiar el email de otra persona, desactivarla (auth.admin.updateUserById
// con `ban_duration`) o eliminarla (auth.admin.deleteUser) son operaciones
// de administración de Supabase Auth que solo funcionan con la clave
// service_role — nunca puede llegar al navegador, así que esta lógica vive
// en el servidor (aquí). Cambiar el rol es solo una escritura normal en
// `perfiles`, pero se hace aquí también para mantener todo en un único sitio
// y una única comprobación de permisos.
//
// Seguridad:
// 1) Antes de nada, se comprueba que quien llama es un 'encargado' ACTIVO
//    (con su propio token de sesión, sin privilegios de admin) — igual que
//    en `crear-cuenta-mecanico`.
// 2) Protección contra "quedarte fuera sin querer": nadie puede
//    desactivarse, eliminarse o cambiarse el propio rol a sí mismo desde
//    aquí (si de verdad hace falta, hay que hacerlo desde el dashboard de
//    Supabase). Como quien actúa siempre sigue siendo encargado después de
//    la operación, esto garantiza que nunca se pueda llegar a un taller con
//    CERO encargados por esta vía, sin necesidad de contar cuántos quedan.
// 3) Solo se permite actuar sobre cuentas de personal (`rol` encargado o
//    mecánico) — nunca sobre una cuenta de cliente del Portal.
//
// DESPLIEGUE (desde tu propio ordenador, con la Supabase CLI instalada):
//   supabase functions deploy administrar-cuenta-personal
// No hace falta configurar ningún secreto extra (igual que
// crear-cuenta-mecanico): SUPABASE_URL, SUPABASE_ANON_KEY y
// SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.
// =============================================================

// @ts-nocheck — este archivo se ejecuta en el runtime Deno de Supabase Edge
// Functions, no con el tsc/eslint de Node del resto del proyecto.
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

const ACCIONES_VALIDAS = ['editar', 'desactivar', 'reactivar', 'eliminar'];
const ROLES_VALIDOS = ['encargado', 'mecanico'];
// "Para siempre" en la práctica (Supabase pide una duración, no acepta
// "indefinido"): 100 años. `ban_duration: 'none'` es como se revierte.
const BAN_PERMANENTE = '876000h';

interface Body {
  accion: 'editar' | 'desactivar' | 'reactivar' | 'eliminar';
  cuenta_id: string;
  nombre?: string;
  email?: string;
  rol?: 'encargado' | 'mecanico';
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

    if (errorPerfil || perfilLlamante?.rol !== 'encargado' || perfilLlamante?.activo === false) {
      return jsonError('Solo un encargado puede administrar cuentas de personal.', 403);
    }

    const { accion, cuenta_id: cuentaId, nombre, email, rol } = (await req.json()) as Body;

    if (!ACCIONES_VALIDAS.includes(accion)) {
      return jsonError('Acción no reconocida.', 400);
    }
    if (!cuentaId?.trim()) {
      return jsonError('Falta la cuenta sobre la que actuar.', 400);
    }

    // Protección contra auto-bloqueo: nadie puede desactivarse, eliminarse
    // o cambiarse el propio rol a sí mismo desde esta pantalla.
    if (cuentaId === llamante.id) {
      if (accion === 'desactivar' || accion === 'eliminar') {
        return jsonError('No puedes desactivar ni eliminar tu propia cuenta desde aquí.', 400);
      }
      if (accion === 'editar' && rol) {
        return jsonError('No puedes cambiar tu propio rol desde aquí.', 400);
      }
    }

    // Cliente admin: SOLO a partir de aquí, y solo porque ya se comprobó
    // arriba que quien llama es un encargado activo.
    const clienteAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Solo se puede actuar sobre cuentas de personal (nunca sobre un
    // cliente del Portal, aunque alguien manipulase la petición a mano).
    const { data: perfilObjetivo, error: errorObjetivo } = await clienteAdmin
      .from('perfiles')
      .select('id, rol')
      .eq('id', cuentaId)
      .maybeSingle();

    if (errorObjetivo || !perfilObjetivo || !ROLES_VALIDOS.includes(perfilObjetivo.rol)) {
      return jsonError('Cuenta no encontrada o no es una cuenta de personal.', 404);
    }

    if (accion === 'editar') {
      if (!nombre?.trim() && !email?.trim() && !rol) {
        return jsonError('No hay ningún cambio que aplicar.', 400);
      }
      if (rol && !ROLES_VALIDOS.includes(rol)) {
        return jsonError('Rol no válido.', 400);
      }

      const cambiosAuth: Record<string, unknown> = {};
      if (nombre?.trim()) cambiosAuth.user_metadata = { full_name: nombre.trim() };
      if (email?.trim()) {
        cambiosAuth.email = email.trim();
        cambiosAuth.email_confirm = true; // no hace falta reconfirmar el email
      }
      if (Object.keys(cambiosAuth).length > 0) {
        const { error: errorAuth } = await clienteAdmin.auth.admin.updateUserById(cuentaId, cambiosAuth);
        if (errorAuth) return jsonError(errorAuth.message, 400);
      }

      const cambiosPerfil: Record<string, unknown> = {};
      if (nombre?.trim()) cambiosPerfil.nombre = nombre.trim();
      if (email?.trim()) cambiosPerfil.email = email.trim();
      if (rol) cambiosPerfil.rol = rol;
      const { error: errorActualizar } = await clienteAdmin
        .from('perfiles')
        .update(cambiosPerfil)
        .eq('id', cuentaId);
      if (errorActualizar) return jsonError(errorActualizar.message, 500);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (accion === 'desactivar' || accion === 'reactivar') {
      const { error: errorAuth } = await clienteAdmin.auth.admin.updateUserById(cuentaId, {
        ban_duration: accion === 'desactivar' ? BAN_PERMANENTE : 'none',
      });
      if (errorAuth) return jsonError(errorAuth.message, 400);

      const { error: errorActualizar } = await clienteAdmin
        .from('perfiles')
        .update({ activo: accion === 'reactivar' })
        .eq('id', cuentaId);
      if (errorActualizar) return jsonError(errorActualizar.message, 500);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // accion === 'eliminar'
    const { error: errorEliminar } = await clienteAdmin.auth.admin.deleteUser(cuentaId);
    if (errorEliminar) return jsonError(errorEliminar.message, 400);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Error desconocido', 500);
  }
});
