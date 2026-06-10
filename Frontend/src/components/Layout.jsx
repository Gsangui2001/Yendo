import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const ROL_LABEL = { comercio: 'Comercio', cadete: 'Cadete', privado: 'Privado', admin: 'Admin' };

const Icon = ({ d, fill }) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const ICONS = {
  inicio:        'M3 9.5L12 3l9 6.5V21H3z M9 21v-6h6v6',
  pedidos:       ['M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.27 6.96L12 12l8.73-5.04 M12 22V12'],
  clientes:      ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75'],
  cadetes:       ['M5.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M18.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M15 17.5l-3-6-2 3h-3'],
  comercios:     ['M3 9l1-5h16l1 5 M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9', 'M3 9h18 M9 21v-6h6v6'],
  estadisticas:  ['M3 3v18h18', 'M7 16l4-4 3 3 5-6'],
  ganancias:     ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
  reportes:      ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6 M16 13H8 M16 17H8 M10 9H8'],
  facturacion:   'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  precios:       ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', 'M7 7h.01'],
  zonas:         ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  opiniones:     'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  configuracion: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  ayuda:         ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01'],
  jornada:       ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  solicitar:     ['M5.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M18.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M15 17.5l-3-6-2 3h-3'],
  direcciones:   ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
};

const YendoLogo = ({ size = 8 }) => (
  <svg viewBox="0 0 32 32" fill="none" className={`w-${size} h-${size} flex-shrink-0`}>
    <path d="M16 29C8 25 4 19 4 12.5 4 8.5 7 6 10.3 6c2.6 0 4.7 1.6 5.7 3.9C17 7.6 19.1 6 21.7 6 25 6 28 8.5 28 12.5 28 19 24 25 16 29Z" fill="#22C55E"/>
    <path d="M16 29C8 25 4 19 4 12.5 4 8.5 7 6 10.3 6c2.6 0 4.7 1.6 5.7 3.9V29Z" fill="#15803D"/>
  </svg>
);

export default function Layout({ perfil, page, setPage, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = navByRol(perfil?.rol);
  const initials = (perfil?.nombre ?? 'U').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();

  function handleNav(key) {
    setPage(key);
    setMobileOpen(false);
  }

  const sidebar = (
    <aside className="w-60 bg-white border-r border-gray-100 flex flex-col h-full select-none">
      {/* Logo */}
      <div className="px-6 py-5 flex items-center gap-2.5">
        <div className="animate-float">
          <YendoLogo size={8} />
        </div>
        <span className="text-xl font-extrabold text-gray-900 tracking-tight">Yendo</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-2">
        {navItems.map((item, idx) => {
          const active = page === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              style={{ animationDelay: `${idx * 40}ms` }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold
                transition-all duration-200 ease-out animate-slide-in-right
                group relative
                ${active
                  ? 'bg-green-50 text-green-700 shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 hover:translate-x-0.5'
                }
              `}
            >
              {/* Indicador activo */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-green-500 rounded-r-full" />
              )}

              {/* Icono con escala en hover */}
              <span className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                <Icon d={ICONS[item.icon] ?? ICONS.inicio} />
              </span>

              {item.label}

              {/* Flecha sutil en hover */}
              {!active && (
                <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-gray-300 text-xs">›</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Invitá y ganá */}
      <div className="px-3 pb-3">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎁</span>
            <p className="text-sm font-bold text-gray-800">Invitá y ganá</p>
          </div>
          <p className="text-xs text-gray-500 mb-3">Compartí tu link y ganá descuentos</p>
          <button className="
            w-full bg-green-600 text-white text-sm font-bold py-2 rounded-xl
            transition-all duration-200
            hover:bg-green-700 hover:-translate-y-0.5 hover:shadow-md
            active:translate-y-0 active:scale-95
            ripple
          ">
            Invitar ahora
          </button>
        </div>
      </div>

      {/* Usuario */}
      <div className="px-3 pb-4 border-t border-gray-100 pt-3">
        <div className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-gray-50 transition-colors cursor-default">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-sm ring-2 ring-green-100">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{perfil?.nombre}</p>
            <p className="text-xs text-gray-400 truncate">{ROL_LABEL[perfil?.rol]}</p>
          </div>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="
            w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl
            text-sm font-semibold text-gray-500
            transition-all duration-200
            hover:bg-red-50 hover:text-red-500 hover:translate-x-0.5
            active:scale-95
            group
          "
        >
          <span className="transition-transform duration-200 group-hover:scale-110">
            <Icon d={['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5 M21 12H9']} />
          </span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar desktop */}
      <div className="hidden lg:block flex-shrink-0">{sidebar}</div>

      {/* Sidebar mobile (drawer con backdrop animado) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in-fast"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 animate-slide-in-right shadow-lift-lg">
            {sidebar}
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header mobile */}
        <header className="lg:hidden bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 h-14 flex items-center justify-between sticky top-0 z-40">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-xl hover:bg-gray-100 active:scale-90 transition-all"
          >
            <Icon d={['M3 12h18 M3 6h18 M3 18h18']} />
          </button>
          <div className="flex items-center gap-2 font-extrabold text-lg">
            <YendoLogo size={7} />
            Yendo
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white flex items-center justify-center text-xs font-bold ring-2 ring-green-100">
            {initials}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}

function navByRol(rol) {
  if (rol === 'comercio') return [
    { key: 'inicio',    label: 'Inicio',       icon: 'inicio' },
    { key: 'pedido',    label: 'Nuevo pedido', icon: 'pedidos' },
    { key: 'historial', label: 'Pedidos',      icon: 'reportes' },
    { key: 'clientes',  label: 'Clientes',     icon: 'clientes' },
    { key: 'saldo',     label: 'Saldo y plan', icon: 'facturacion' },
  ];
  if (rol === 'cadete') return [
    { key: 'inicio',    label: 'Inicio',    icon: 'inicio' },
    { key: 'historial', label: 'Historial', icon: 'reportes' },
    { key: 'jornada',   label: 'Jornada',   icon: 'jornada' },
    { key: 'ganancias', label: 'Ganancias', icon: 'ganancias' },
  ];
  if (rol === 'privado') return [
    { key: 'inicio',      label: 'Inicio',       icon: 'inicio' },
    { key: 'solicitar',   label: 'Pedir cadete', icon: 'solicitar' },
    { key: 'historial',   label: 'Mis pedidos',  icon: 'reportes' },
    { key: 'direcciones', label: 'Direcciones',  icon: 'direcciones' },
  ];
  if (rol === 'admin') return [
    { key: 'inicio',    label: 'Inicio',    icon: 'inicio' },
    { key: 'pedidos',   label: 'Pedidos',   icon: 'pedidos' },
    { key: 'cadetes',   label: 'Cadetes',   icon: 'cadetes' },
    { key: 'comercios', label: 'Comercios', icon: 'comercios' },
    { key: 'finanzas',  label: 'Finanzas',  icon: 'facturacion' },
    { key: 'precios',   label: 'Precios',   icon: 'precios' },
  ];
  return [];
}
