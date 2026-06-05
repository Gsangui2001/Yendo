import { supabase } from '../lib/supabaseClient';

const ROL_LABEL = { comercio: 'Comercio', cadete: 'Cadete', privado: 'Privado', admin: 'Admin' };
const ROL_EMOJI = { comercio: '🏪', cadete: '🚴', privado: '👤', admin: '📊' };

export default function Layout({ perfil, page, setPage, children }) {
  const navItems = navByRol(perfil?.rol);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2 font-bold text-lg text-gray-900">
            <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
              <path d="M16 29C8 25 4 19 4 12.5 4 8.5 7 6 10.3 6c2.6 0 4.7 1.6 5.7 3.9C17 7.6 19.1 6 21.7 6 25 6 28 8.5 28 12.5 28 19 24 25 16 29Z" fill="#2ECC71"/>
              <path d="M16 29C8 25 4 19 4 12.5 4 8.5 7 6 10.3 6c2.6 0 4.7 1.6 5.7 3.9V29Z" fill="#1A7A3C"/>
            </svg>
            Yendo
          </div>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors
                  ${page === item.key
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Usuario */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-lg">{ROL_EMOJI[perfil?.rol]}</span>
              <span className="font-semibold text-gray-700">{perfil?.nombre?.split(' ')[0]}</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {ROL_LABEL[perfil?.rol]}
              </span>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors font-medium"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                ${page === item.key
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}

function navByRol(rol) {
  if (rol === 'comercio') return [
    { key: 'inicio',    label: '🏠 Inicio' },
    { key: 'pedido',    label: '➕ Nuevo pedido' },
    { key: 'historial', label: '📋 Historial' },
    { key: 'clientes',  label: '👥 Clientes' },
  ];
  if (rol === 'cadete') return [
    { key: 'inicio',   label: '🏠 Inicio' },
    { key: 'pedidos',  label: '📦 Pedidos' },
    { key: 'jornada',  label: '⏱ Jornada' },
    { key: 'ganancias',label: '💰 Ganancias' },
  ];
  if (rol === 'privado') return [
    { key: 'inicio',      label: '🏠 Inicio' },
    { key: 'solicitar',   label: '🚴 Pedir cadete' },
    { key: 'historial',   label: '📋 Mis pedidos' },
    { key: 'direcciones', label: '📍 Direcciones' },
  ];
  if (rol === 'admin') return [
    { key: 'inicio',   label: '🏠 Inicio' },
    { key: 'pedidos',  label: '📦 Pedidos' },
    { key: 'cadetes',  label: '🚴 Cadetes' },
    { key: 'comercios',label: '🏪 Comercios' },
  ];
  return [];
}
