import { useState } from 'react';
import Pedido from './components/Comercio/Pedido';
import SolicitarCadete from './components/Particular/SolicitarCadete';

const VISTAS = [
  { id: 'comercio',   label: '🏪 Comercio'   },
  { id: 'particular', label: '👤 Particular'  },
];

// IDs de prueba hasta que haya autenticación
const DEV_COMERCIO_ID  = 'comercio-test-1';
const DEV_USUARIO_ID   = 'usuario-test-1';

export default function App() {
  const [vista, setVista] = useState('comercio');

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-black text-green-600 tracking-tight">YENDO</h1>

          {/* Selector de vista */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {VISTAS.map(v => (
              <button
                key={v.id}
                onClick={() => setVista(v.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  vista === v.id
                    ? 'bg-white text-green-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main>
        {vista === 'comercio' && (
          <Pedido comercioId={DEV_COMERCIO_ID} />
        )}
        {vista === 'particular' && (
          <SolicitarCadete
            usuarioId={DEV_USUARIO_ID}
            onPedidoCreado={(id) => console.log('Pedido creado:', id)}
          />
        )}
      </main>

    </div>
  );
}
