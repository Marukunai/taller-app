import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Car,
  ClipboardCheck,
  History,
  KanbanSquare,
  Package,
  ShieldAlert,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import LoginScreen from './components/LoginScreen';
import ClientAuthScreen from './components/ClientAuthScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import CuentaMenu from './components/CuentaMenu';
import InspectionForm from './pages/InspectionForm';
import ManagementPanel from './pages/ManagementPanel';
import CheckoutForm from './pages/CheckoutForm';
import InventoryPanel from './pages/InventoryPanel';
import PersonnelPanel from './pages/PersonnelPanel';
import HistorialVehiculo from './pages/HistorialVehiculo';
import ProximasRevisiones from './pages/ProximasRevisiones';
import ClientPortal from './pages/ClientPortal';
import FlotaRepuestoPanel from './pages/FlotaRepuestoPanel';
import type { OrdenPendienteRecepcion, Perfil } from './lib/types';

type Vista =
  | 'checkin'
  | 'panel'
  | 'checkout'
  | 'inventario'
  | 'gestion_personal'
  | 'historial'
  | 'proximas'
  | 'flota_repuesto';
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
  // Se activa cuando Supabase Auth dispara 'PASSWORD_RECOVERY' (enlace del
  // email de restablecimiento) — independiente del rol/perfil, se muestra
  // ANTES de intentar cargar el perfil, tanto si el enlace lo pidió la
  // propia persona como si se lo mandó un encargado desde Gestión de
  // personal.
  const [recuperandoContrasena, setRecuperandoContrasena] = useState(false);

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

  // Averigua el rol de la cuenta (encargado / mecánico del taller, o
  // cliente del Portal de cliente) en cuanto hay sesión — ver tabla
  // `perfiles`. Si la consulta falla (por ejemplo, la migración de roles
  // finos todavía no se ha ejecutado en este proyecto) o no encuentra
  // fila, se trata como 'encargado' por compatibilidad (el rol con más
  // permisos) — así ningún acceso existente se rompe por no haber aplicado
  // la migración todavía.
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
            rol: 'encargado',
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

  const irACheckout = (ordenId: string) => {
    setOrdenCheckoutId(ordenId);
    setVista('checkout');
  };

  const irARecibirVehiculo = (pendiente: OrdenPendienteRecepcion) => {
    setOrdenRecepcionPendiente(pendiente);
    setVista('checkin');
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
            Un encargado ha desactivado tu acceso a TallerGo. Si crees que es un error, habla con
            tu encargado.
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

  // El mecánico no ve Inventario ni Gestión de personal (ni verá ningún
  // precio/coste que se añada en el futuro) — solo el encargado, ver
  // AskUserQuestion de la batch de roles finos.
  const esEncargado = perfil.rol === 'encargado';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50">
      <nav className="bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 shadow-md">
        {/* Dos grupos separados a los extremos de TODO el ancho de la barra
         *  (sin el `max-w-6xl` de antes, que centraba el contenido y dejaba
         *  la cuenta/cerrar sesión pegada a los tabs en pantallas anchas):
         *  a la izquierda el logo + los tabs (que sí pueden envolver en
         *  varias líneas en pantallas estrechas), a la derecha, separados
         *  por un divisor vertical, el nombre de la cuenta y "Cerrar
         *  sesión" — así quedan claramente diferenciados del resto de la
         *  navegación en vez de aparecer justo a continuación del último
         *  tab. */}
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 flex items-center gap-2 pr-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
                <Wrench className="h-4 w-4" />
              </span>
              <span className="hidden font-bold text-white sm:inline">TallerGo</span>
            </div>

            <TabButton
              activo={vista === 'checkin'}
              onClick={() => {
                setOrdenRecepcionPendiente(null);
                setVista('checkin');
              }}
              icon={<ClipboardCheck className="h-4 w-4" />}
            >
              Check-in
            </TabButton>
            <TabButton
              activo={vista === 'panel'}
              onClick={() => setVista('panel')}
              icon={<KanbanSquare className="h-4 w-4" />}
            >
              Panel de gestión
            </TabButton>
            <TabButton
              activo={vista === 'checkout'}
              onClick={() => {
                setOrdenCheckoutId(null);
                setVista('checkout');
              }}
              icon={<Truck className="h-4 w-4" />}
            >
              Entrega
            </TabButton>
            <TabButton
              activo={vista === 'historial'}
              onClick={() => setVista('historial')}
              icon={<History className="h-4 w-4" />}
            >
              Historial
            </TabButton>
            <TabButton
              activo={vista === 'proximas'}
              onClick={() => setVista('proximas')}
              icon={<AlertTriangle className="h-4 w-4" />}
            >
              Próximas revisiones
            </TabButton>
            {esEncargado && (
              <TabButton
                activo={vista === 'inventario'}
                onClick={() => setVista('inventario')}
                icon={<Package className="h-4 w-4" />}
              >
                Inventario
              </TabButton>
            )}
            {esEncargado && (
              <TabButton
                activo={vista === 'gestion_personal'}
                onClick={() => setVista('gestion_personal')}
                icon={<Users className="h-4 w-4" />}
              >
                Personal
              </TabButton>
            )}
            {esEncargado && (
              <TabButton
                activo={vista === 'flota_repuesto'}
                onClick={() => setVista('flota_repuesto')}
                icon={<Car className="h-4 w-4" />}
              >
                Flota
              </TabButton>
            )}
          </div>

          <div className="ml-auto shrink-0 border-l border-white/25 pl-4">
            <CuentaMenu
              nombre={perfil.nombre || nombreUsuario(session)}
              email={perfil.email ?? session.user.email ?? ''}
              rol={perfil.rol}
              onCerrarSesion={() => supabase.auth.signOut()}
            />
          </div>
        </div>
      </nav>

      {vista === 'checkin' && (
        <InspectionForm
          ordenPendiente={ordenRecepcionPendiente}
          onOrdenPendienteCompletada={() => setOrdenRecepcionPendiente(null)}
        />
      )}
      {vista === 'panel' && (
        <ManagementPanel onEntregar={irACheckout} onRecibirDesdeSolicitud={irARecibirVehiculo} />
      )}
      {vista === 'checkout' && (
        <CheckoutForm ordenIdInicial={ordenCheckoutId} onEntregado={() => setVista('panel')} />
      )}
      {vista === 'historial' && <HistorialVehiculo />}
      {vista === 'proximas' && <ProximasRevisiones />}
      {vista === 'inventario' && esEncargado && <InventoryPanel />}
      {vista === 'gestion_personal' && esEncargado && <PersonnelPanel miId={session.user.id} />}
      {vista === 'flota_repuesto' && esEncargado && <FlotaRepuestoPanel />}
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
}

function TabButton({ activo, onClick, icon, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        activo ? 'bg-white text-indigo-700 shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export default App;
