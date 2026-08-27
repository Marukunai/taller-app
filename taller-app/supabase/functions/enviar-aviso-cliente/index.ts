// =============================================================
// Taller App · Edge Function: aviso por email de "vehículo listo"
//
// Se invoca desde la app (supabase.functions.invoke('enviar-aviso-cliente',
// {body: {...}})) al concertar la cita de recogida en el Panel de gestión.
// Envía el email con la API HTTP de Resend (https://resend.com) — hace
// falta una cuenta gratuita y una API key propias, ver README.
//
// DESPLIEGUE (desde tu propio ordenador, con la Supabase CLI instalada):
//   supabase functions deploy enviar-aviso-cliente
//   supabase secrets set RESEND_API_KEY=tu_clave_de_resend
//   supabase secrets set RESEND_FROM="Taller App <onboarding@resend.dev>"
//
// Si no se despliega, el botón de email en la app simplemente falla con un
// aviso ("puede que la función no esté desplegada") y el WhatsApp sigue
// funcionando igual — no es un requisito para el resto de la app.
// =============================================================

// @ts-nocheck — este archivo se ejecuta en el runtime Deno de Supabase Edge
// Functions, no con el tsc/eslint de Node del resto del proyecto (por eso
// usa `Deno.serve` y una URL de import remota, que ni tsc ni eslint del
// proyecto principal entienden).
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Taller App <onboarding@resend.dev>';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  email: string;
  nombreCliente: string;
  matricula: string;
  citaIso: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY no configurada (supabase secrets set).' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { email, nombreCliente, matricula, citaIso } = (await req.json()) as Body;
    if (!email || !nombreCliente || !matricula || !citaIso) {
      return new Response(JSON.stringify({ error: 'Faltan datos (email, nombreCliente, matricula, citaIso).' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const fecha = new Date(citaIso);
    const fechaTexto = fecha.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const horaTexto = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject: `Tu vehículo ${matricula} ya está listo`,
        html:
          `<p>Hola ${nombreCliente},</p>` +
          `<p>Tu vehículo con matrícula <strong>${matricula}</strong> ya está listo para recoger.</p>` +
          `<p>Te esperamos el <strong>${fechaTexto}</strong> a las <strong>${horaTexto}</strong>.</p>` +
          `<p>¡Gracias!</p>`,
      }),
    });

    if (!resendResponse.ok) {
      const detalle = await resendResponse.text();
      return new Response(JSON.stringify({ error: `Resend respondió con error: ${detalle}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
