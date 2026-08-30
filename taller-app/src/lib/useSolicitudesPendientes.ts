import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Cuenta las solicitudes pendientes de revisar, para el badge de la
 *  pestaña "Solicitud de cita" en la barra de navegación (ver App.tsx) —
 *  consulta ligera, solo trae el id. Se refresca al montar Y en tiempo
 *  real (Supabase Realtime) cada vez que cambia algo en `solicitudes`, así
 *  el badge aparece/desaparece solo, sin recargar la página, en cuanto un
 *  cliente crea una solicitud desde el Portal, el propio personal registra
 *  una desde "Solicitud de cita", o alguien la acepta/rechaza. Requiere
 *  que `solicitudes` esté añadida a la publicación `supabase_realtime`
 *  (ver schema.sql) — si no lo está, el hook simplemente se queda con el
 *  recuento inicial hasta el próximo montaje.
 *
 *  Movido aquí desde ManagementPanel.tsx (donde alimentaba la antigua
 *  sub-pestaña "Solicitudes de clientes") para poder reusarlo también
 *  desde App.tsx, ahora que esa gestión vive en su propia pestaña de nivel
 *  superior — ver SolicitudCitaPanel.tsx.
 *
 *  `enabled` evita la consulta y la suscripción de Realtime cuando no hace
 *  falta (pantalla de login, o una cuenta de cliente del Portal, que ni
 *  siquiera ve esta pestaña) — App.tsx llama al hook siempre (las reglas de
 *  los hooks no permiten llamarlo solo a veces), pero con `enabled: false`
 *  en esos casos para no malgastar la consulta. */
export function useSolicitudesPendientes(enabled: boolean): number {
  const [contador, setContador] = useState(0);

  const cargarContador = useCallback(async () => {
    if (!enabled) return;
    const { count } = await supabase
      .from('solicitudes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente');
    setContador(count ?? 0);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarContador();

    const canal = supabase
      .channel('solicitudes-contador')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes' }, () => {
        cargarContador();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [enabled, cargarContador]);

  return contador;
}
