import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CalendarClock,
  Car,
  ClipboardCheck,
  History,
  KanbanSquare,
  Menu,
  Package,
  ShieldAlert,
  Truck,
  Users,
  Wrench,
  X as CerrarMenuIcon,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import LoginScreen from './components/LoginScreen';
import ClientAuthScreen from './components/ClientAuthScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import CuentaMenu from './components/CuentaMenu';
import BuscadorGlobal from './components/BuscadorGlobal';
import InspectionForm from './pages/InspectionForm';
import ManagementPanel from './pages/ManagementPanel';
import CheckoutForm from './pages/CheckoutForm';
import InventoryPanel from './pages/InventoryPanel';
import PersonnelPanel from './pages/PersonnelPanel';
import HistorialVehiculo from './pages/HistorialVehiculo';
import ProximasRevisiones from './pages/ProximasRevisiones';
import ClientPortal from './pages/ClientPortal';
import FlotaRepuestoPanel from './pages/FlotaRepuestoPanel';
import AgendaPanel from './pages/AgendaPanel';
import EstadisticasPanel from './pages/EstadisticasPanel';
import SolicitudCitaPanel from './pages/SolicitudCitaPanel';
import { useSolicitudesPendientes } from './lib/useSolicitudesPendientes';
import type { OrdenPendienteRecepcion, Perfil } from './lib/types';

type Vista =
  | 'solicitud_cita'
  | 'checkin'
  | 'panel'
  | 'checkout'
  | 'inventario'
  | 'gestion_personal'
  | 'historial'
  | 'proximas'
  | 'flota_repuesto'
  | 'agenda'
  | 'estadisticas';
type VistaPublica = 'personal' | 'cliente';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [vistaPublica, setVistaPublica] = useState<VistaPublica>('personal');
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [vista, setVista] = useState<Vista>('checkin');
  const [ordenCheckoutId, setOrdenCheckoutId] = useState<string | null>(null);
  // Prellenado del Check-in al pulsar "Recibir vehículo" en el Panel de
  // gestión, sobre una orden 'solicitado' nacida de aceptar una solicitud
  // del Portal de cliente — ver ManagementPanel/InspectionForm.
  const [ordenRecepcionPendiente, setOrdenRecepcionPendiente] =
    useState<OrdenPendienteRecepcion | null>(null);
  // Matrícula prellenada al ir a Historial desde el Buscador global de la
  // barra de navegación (ver BuscadorGlobal.tsx) — se limpia al cambiar de
  // pestaña para no re-disparar la búsqueda si se vuelve a Historial luego
  // a mano.
  const [matriculaBuscada, setMatriculaBuscada] = useState<string | null>(null);
  // Menú de pestañas en móvil: con 10 pestañas posibles no caben en una
  // barra horizontal sin ocupar media pantalla envueltas en varias líneas
  // (lo que se veía "raro" en el móvil) — a partir de `md` se muestran en
  // línea como siempre; por debajo de `md` se ocultan detrás de este
  // desplegable tipo hamburguesa.
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  // Se activa cuando Supabase Auth dispara 'PASSWORD_RECOVERY' (enlace del
  // email de restablecimiento) — independiente del rol/perfil, se muestra
  // ANTES de intentar cargar el perfil, tanto si el enlace lo pidió la
  // propia persona como si se lo mandó un encargado desde Gestión de
  // personal.
  const [recuperandoContrasena, setRecuperandoContrasena] = useState(false);
  // Badge de "Solicitud de cita" en la barra de navegación — cuántas están
  // pendientes de revisar, tanto si las creó un cliente desde el Portal
  // como el propio personal (ver SolicitudCitaPanel.tsx). Desactivado antes
  // de haber sesión o para una cuenta de cliente del Portal (ni siquiera ve
  // esta pestaña) — ver el propio hook para el motivo de pasar `enabled`.
  const solicitudesPendientes = useSolicitudesPendientes(!!session && perfil?.rol !== 'cliente');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargandoSesion(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      setSession(nuevaSesion);
      if (evento === 'PASSWORD_RECOVERY') {
        setRecuperandoContrasena(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Averigua el rol de la cuenta (personal del taller, o cliente del
  // Portal de cliente) en cuanto hay sesión — ver tabla `perfiles`. Si la
  // consulta falla (por ejemplo, alguna migración de roles todavía no se
  // ha ejecutado en este proyecto) o no encuentra fila, se trata como
  // 'dueno' por compatibilidad (el rol operativo con más permisos, sin
  // llegar a 'admin') — así ningún acceso existente se rompe por no haber
  // aplicado la migración todavía.
  //
  // OJO: la dependencia es `session?.user.id`, NO el objeto `session`
  // completo. Supabase dispara `onAuthStateChange` (y por tanto
  // `setSession` con un objeto nuevo) también en eventos que no cambian de
  // usuario — por ejemplo `TOKEN_REFRESHED` (automático, cada ~1h mientras
  // la pestaña esté abierta) o `USER_UPDATED` (al cambiar la propia
  // contraseña desde el menú de la cuenta). Si dependiera de `session`
  // entero, cada uno de esos eventos volvería a poner `cargandoPerfil` a
  // `true` y por tanto a mostrar la pantalla completa de "Cargando…" en
  // vez de la app — lo que de paso desmonta y resetea cualquier estado
  // local en pantalla (por ejemplo, cerraría el menú desplegable de la
  // cuenta justo después de guardar la contraseña nueva). Con `user.id`
  // como dependencia, el perfil solo se vuelve a pedir cuando de verdad
  // cambia la cuenta (inicio/cierre de sesión).
  useEffect(() => {
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPerfil(null);
      return;
    }
    const sesionActual = session;
    let cancelado = false;
    setCargandoPerfil(true);
    supabase
      .from('perfiles')
      .select('id, rol, nombre, email, activo')
      .eq('id', sesionActual.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error || !data) {
          setPerfil({
            id: sesionActual.user.id,
            rol: 'dueno',
            nombre: null,
            email: sesionActual.user.email ?? null,
            activo: true,
          });
        } else {
          setPerfil(data as Perfil);
        }
        setCargandoPerfil(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  useEffect(() => {
    if (!menuMovilAbierto) return;
    const handleClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenuMovilAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuMovilAbierto]);

  const irACheckout = (ordenId: string) => {
    setOrdenCheckoutId(ordenId);
    setVista('checkout');
  };

  const irARecibirVehiculo = (pendiente: OrdenPendienteRecepcion) => {
    setOrdenRecepcionPendiente(pendiente);
    setVista('checkin');
  };

  const irAHistorialDesdeBusqueda = (matricula: string) => {
    setMatriculaBuscada(matricula);
    setVista('historial');
  };

  if (cargandoSesion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50">
        <p className="text-sm text-gray-400">Cargando…</p>
      </div>
    );
  }

  if (recuperandoContrasena) {
    return <ResetPasswordScreen onListo={() => setRecuperandoContrasena(false)} />;
  }

  if (!session) {
    return vistaPublica === 'cliente' ? (
      <ClientAuthScreen onVolverPersonal={() => setVistaPublica('personal')} />
    ) : (
      <LoginScreen onIrPortalCliente={() => setVistaPublica('cliente')} />
    );
  }

  if (cargandoPerfil || !perfil) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50">
        <p className="text-sm text-gray-400">Cargando…</p>
      </div>
    );
  }

  if (perfil.rol === 'cliente') {
    return (
      <ClientPortal
        nombreUsuario={perfil.nombre ?? ''}
        emailUsuario={perfil.email ?? session.user.email ?? ''}
      />
    );
  }

  // 'admin' es una cuenta de arranque (creada a mano por SQL, ver README) que
  // solo sirve para crear al primer 'dueno' del taller — no ve check-in, el
  // panel de gestión, ni ningún dato de clientes: solo Gestión de personal,
  // para no tener acceso a nada más de lo estrictamente necesario para su
  // única función.
  if (perfil.rol === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50">
        <nav className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 shadow-md">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
              <Wrench className="h-4 w-4" />
            </span>
            <span className="font-bold text-white">TallerGo · Administración</span>
          </div>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10"
          >
            Cerrar sesión
          </button>
        </nav>
        <PersonnelPanel miId={session.user.id} />
      </div>
    );
  }

  // Cuenta de personal desactivada desde "Gestión de personal" (ver
  // PersonnelPanel.tsx) — se comprueba aquí, antes de mostrar nada del
  // resto de la app, aunque la sesión siga siendo técnicamente válida (el
  // bloqueo real de acceso a los datos ya lo hace es_personal()/
  // es_encargado() en el backend; esto es solo para dar un mensaje claro en
  // vez de que todo falle en silencio con errores de RLS).
  if (!perfil.activo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-100 px-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 text-center shadow-xl">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-bold text-gray-900">Cuenta desactivada</h1>
          <p className="text-sm text-gray-500">
            Un dueño o administrador ha desactivado tu acceso a TallerGo. Si crees que es un
            error, habla con tu encargado o dueño.
          </p>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="w-full rounded-lg bg-gray-800 py-2.5 text-sm font-semibold text-white hover:bg-gray-900"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  // A partir de aquí `perfil.rol` ya nunca es 'cliente' ni 'admin' (ambos
  // casos ya han hecho `return` más arriba) — solo dueno/encargado/
  // mecanico/recepcionista.
  //
  // Nivel "encargado": encargado Y dueño heredan todo lo que podía hacer un
  // encargado (inventario, precios, presupuestos, flota, estadísticas) —
  // ver InventoryPanel.tsx/ManagementPanel.tsx. Gestión de personal es un
  // nivel aparte, más estrecho, desde el batch 19: ver `esGestionCuentas`
  // justo debajo.
  const esEncargado = perfil.rol === 'dueno' || perfil.rol === 'encargado';
  // Nivel "gestión de cuentas": desde el batch 19, SOLO dueño (o admin,
  // gestionado en su propia pantalla más arriba) puede crear, editar,
  // desactivar o eliminar cuentas de personal — un encargado ya no puede
  // (antes sí). Ver PersonnelPanel.tsx.
  const esGestionCuentas = perfil.rol === 'dueno';
  // Recepcionista: de cara al cliente (solicitud de cita, agenda, ver
  // pendientes en el panel), pero sin Inventario ni Próximas revisiones —
  // ver la lista de pestañas debajo.
  const esRecepcionista = perfil.rol === 'recepcionista';

  // Lista de pestañas en un solo sitio, en vez de repetir cada TabButton
  // en dos partes del JSX: se recorre dos veces al pintar (fila horizontal
  // a partir de `md`, desplegable apilado por debajo de eso).
  const tabs: { key: Vista; label: string; icon: ReactNode; onClick: () => void; badge?: number }[] = [
    {
      key: 'solicitud_cita',
      label: 'Solicitud de cita',
      icon: <CalendarClock className="h-4 w-4" />,
      onClick: () => setVista('solicitud_cita'),
      badge: solicitudesPendientes,
    },
    {
      key: 'checkin',
      label: 'Check-in',
      icon: <ClipboardCheck className="h-4 w-4" />,
      onClick: () => {
        setOrdenRecepcionPendiente(null);
        setVista('checkin');
      },
    },
    {
      key: 'panel',
      label: 'Panel de gestión',
      icon: <KanbanSquare className="h-4 w-4" />,
      onClick: () => setVista('panel'),
    },
    {
      key: 'checkout',
      label: 'Entrega',
      icon: <Truck className="h-4 w-4" />,
      onClick: () => {
        setOrdenCheckoutId(null);
        setVista('checkout');
      },
    },
    {
      key: 'historial',
      label: 'Historial',
      icon: <History className="h-4 w-4" />,
      onClick: () => setVista('historial'),
    },
    // Próximas revisiones: desde el batch 19, ya no la ve un mecánico "de a
    // pie" ni un recepcionista — solo encargado/dueño/admin (petición
    // explícita del usuario).
    ...(esEncargado
      ? [
          {
            key: 'proximas' as Vista,
            label: 'Próximas revisiones',
            icon: <AlertTriangle className="h-4 w-4" />,
            onClick: () => setVista('proximas'),
          },
        ]
      : []),
    {
      key: 'agenda',
      label: 'Agenda',
      icon: <Calendar className="h-4 w-4" />,
      onClick: () => setVista('agenda'),
    },
    // Inventario: oculto entero para recepcionista (a diferencia del
    // mecánico, que sí lo ve en modo solo lectura desde el batch 18) — un
    // recepcionista no necesita consultar stock de piezas.
    ...(esRecepcionista
      ? []
      : [
          {
            key: 'inventario' as Vista,
            label: 'Inventario',
            icon: <Package className="h-4 w-4" />,
            onClick: () => setVista('inventario'),
          },
        ]),
    ...(esEncargado
      ? [
          {
            key: 'estadisticas' as Vista,
            label: 'Estadísticas',
            icon: <BarChart3 className="h-4 w-4" />,
            onClick: () => setVista('estadisticas'),
          },
          {
            key: 'flota_repuesto' as Vista,
            label: 'Flota',
            icon: <Car className="h-4 w-4" />,
            onClick: () => setVista('flota_repuesto'),
          },
        ]
      : []),
    // Gestión de personal: desde el batch 19, solo admin/dueño (ya no
    // encargado) — ver `esGestionCuentas` arriba.
    ...(esGestionCuentas
      ? [
          {
            key: 'gestion_personal' as Vista,
            label: 'Personal',
            icon: <Users className="h-4 w-4" />,
            onClick: () => setVista('gestion_personal'),
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50">
      <nav ref={navRef} className="bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 shadow-md">
        {/* Con hasta 10 pestañas posibles (encargado), mostrarlas todas en
         *  línea en un móvil las envolvía en 3-4 filas y dejaba la barra
         *  ocupando media pantalla — de ahí el "raro" en la vista móvil. A
         *  partir de `md` se muestran en línea como siempre; por debajo de
         *  eso quedan ocultas detrás del botón de hamburguesa y aparecen
         *  como un desplegable apilado. */}
        <div className="flex w-full flex-wrap items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
              <Wrench className="h-4 w-4" />
            </span>
            <span className="hidden font-bold text-white sm:inline">TallerGo</span>
          </div>

          <div className="hidden flex-1 flex-wrap items-center gap-2 md:flex">
            {tabs.map((tab) => (
              <TabButton
                key={tab.key}
                activo={vista === tab.key}
                onClick={tab.onClick}
                icon={tab.icon}
                badge={tab.badge}
              >
                {tab.label}
              </TabButton>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-3 border-l border-white/25 pl-4">
            <BuscadorGlobal onSeleccionar={irAHistorialDesdeBusqueda} />
            <CuentaMenu
              miId={session.user.id}
              nombre={perfil.nombre || nombreUsuario(session)}
              email={perfil.email ?? session.user.email ?? ''}
              rol={perfil.rol}
              onCerrarSesion={() => supabase.auth.signOut()}
              onPerfilActualizado={(cambios) =>
                setPerfil((prev) => (prev ? { ...prev, ...cambios } : prev))
              }
            />
            <button
              type="button"
              onClick={() => setMenuMovilAbierto((v) => !v)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/10 md:hidden"
              aria-label={menuMovilAbierto ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuMovilAbierto}
            >
              {menuMovilAbierto ? <CerrarMenuIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuMovilAbierto && (
          <div className="mt-3 flex flex-col gap-1 border-t border-white/20 pt-3 md:hidden">
            {tabs.map((tab) => (
              <TabButton
                key={tab.key}
                activo={vista === tab.key}
                onClick={() => {
                  tab.onClick();
                  setMenuMovilAbierto(false);
                }}
                icon={tab.icon}
                badge={tab.badge}
                className="w-full justify-start"
              >
                {tab.label}
              </TabButton>
            ))}
          </div>
        )}
      </nav>

      {vista === 'solicitud_cita' && <SolicitudCitaPanel />}
      {vista === 'checkin' && (
        <InspectionForm
          ordenPendiente={ordenRecepcionPendiente}
          onOrdenPendienteCompletada={() => setOrdenRecepcionPendiente(null)}
        />
      )}
      {vista === 'panel' && (
        <ManagementPanel
          onEntregar={irACheckout}
          onRecibirDesdeSolicitud={irARecibirVehiculo}
          esEncargado={esEncargado}
        />
      )}
      {vista === 'checkout' && (
        <CheckoutForm ordenIdInicial={ordenCheckoutId} onEntregado={() => setVista('panel')} />
      )}
      {vista === 'historial' && <HistorialVehiculo matriculaInicial={matriculaBuscada} />}
      {vista === 'proximas' && <ProximasRevisiones />}
      {vista === 'inventario' && !esRecepcionista && <InventoryPanel esEncargado={esEncargado} />}
      {vista === 'gestion_personal' && esGestionCuentas && <PersonnelPanel miId={session.user.id} />}
      {vista === 'flota_repuesto' && esEncargado && <FlotaRepuestoPanel />}
      {vista === 'agenda' && <AgendaPanel />}
      {vista === 'estadisticas' && esEncargado && <EstadisticasPanel />}
    </div>
  );
}

/** Nombre a mostrar en la barra de navegación: usa el "full_name" que se
 *  haya guardado en los metadatos del usuario en Supabase Auth (se edita
 *  desde el SQL Editor o el dashboard), y si no hay ninguno, cae al email. */
function nombreUsuario(session: Session): string {
  const meta = session.user.user_metadata as Record<string, unknown> | null | undefined;
  const nombre = meta?.full_name;
  return typeof nombre === 'string' && nombre.trim() ? nombre : session.user.email ?? '';
}

interface TabButtonProps {
  activo: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  /** Clases extra — usada por el desplegable móvil para que cada pestaña
   *  ocupe todo el ancho y quede alineada a la izquierda en vez de con el
   *  tamaño ajustado al texto, como en la fila horizontal de escritorio. */
  className?: string;
  /** Aviso numérico junto a la etiqueta (ej. solicitudes de cita pendientes
   *  de revisar) — no se muestra si es 0 o no se pasa. */
  badge?: number;
}

function TabButton({ activo, onClick, icon, children, className = '', badge }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        activo ? 'bg-white text-indigo-700 shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'
      } ${className}`}
    >
      {icon}
      {children}
      {!!badge && (
        <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950">
          {badge}
        </span>
      )}
    </button>
  );
}

export default App;
