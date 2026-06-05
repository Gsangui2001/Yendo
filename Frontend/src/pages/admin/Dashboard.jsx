import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ESTADO_CHIP = {
  pendiente: 'bg-amber-100 text-amber-700',
  asignada:  'bg-blue-100 text-blue-700',
  en_camino: 'bg-blue-100 text-blue-700',
  entregada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-400',
};
const ESTADO_LABEL = {
  pendiente: 'Buscando cadete',
  asignada:  'Asignado',
  en_camino: 'En camino',
  entregada: 'Entregado',
  cancelada: 'Cancelado',
};

export default function AdminApp({ perfil, page }) {
  const [ordenes,   setOrdenes]   = useState([]);
  const [cadetes,   setCadetes]   = useState([]);
  const [comercios, setComercios] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => { cargarTodo(); }, []);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, () => cargarOrdenes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cadetes' }, () => cargarCadetes())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function cargarTodo() {
    setLoading(true);
    await Promise.all([cargarOrdenes(), cargarCadetes(), cargarComercios()]);
    setLoading(false);
  }

  async function cargarOrdenes() {
    const { data } = await supabase.from('ordenes').select('*')
      .order('creado_en', { ascending: false }).limit(100);
    setOrdenes(data ?? []);
  }
  async function cargarCadetes() {
    const { data } = await supabase.from('cadetes').select('*').order('nombre');
    setCadetes(data ?? []);
  }
  async function cargarComercios() {
    const { data } = await supabase.from('comercios').select('*').order('nombre');
    setComercios(data ?? []);
  }

  async function cambiarEstadoOrden(id, estado) {
    await fetch(`/api/admin/ordenes/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    cargarOrdenes();
  }

  async function cambiarEstadoCadete(id, estado) {
    await fetch(`/api/admin/cadetes/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    cargarCadetes();
  }

  if (loading) return <Spinner />;

  const hoy = new Date().toISOString().slice(0, 10);
  const pedidosHoy    = ordenes.filter(o => o.creado_en?.startsWith(hoy));
  const pendientes    = ordenes.filter(o => o.estado === 'pendiente');
  const disponibles   = cadetes.filter(c => c.estado === 'disponible');
  const enViaje       = cadetes.filter(c => c.estado === 'en_viaje');

  if (page === 'cadetes') return (
    <div>
      <h2 className="text-xl font-bold mb-4">Cadetes ({cadetes.length})</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cadetes.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-lg">
                  {c.nombre?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{c.nombre}</p>
                  <p className="text-xs text-gray-400">{c.telefono ?? 'Sin teléfono'}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold
                ${c.estado === 'disponible' ? 'bg-green-100 text-green-700' :
                  c.estado === 'en_viaje'   ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-500'}`}>
                {c.estado}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="font-bold text-green-600">{c.viajes_hoy}</p>
                <p className="text-gray-400">hoy</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="font-bold text-green-600">{c.viajes_mes}</p>
                <p className="text-gray-400">mes</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="font-bold text-green-600">${(c.ganancias_hoy ?? 0).toLocaleString('es-AR')}</p>
                <p className="text-gray-400">hoy</p>
              </div>
            </div>
            {c.estado !== 'en_viaje' && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => cambiarEstadoCadete(c.id, c.estado === 'disponible' ? 'offline' : 'disponible')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors
                    ${c.estado === 'disponible'
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                  {c.estado === 'disponible' ? 'Poner offline' : 'Activar'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  if (page === 'comercios') return (
    <div>
      <h2 className="text-xl font-bold mb-4">Comercios ({comercios.length})</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {comercios.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{c.nombre}</p>
              {c.direccion && <p className="text-sm text-gray-500">📍 {c.direccion}</p>}
              {c.telefono  && <p className="text-sm text-gray-500">📞 {c.telefono}</p>}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {c.activo ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        ))}
        {comercios.length === 0 && <Empty texto="Sin comercios registrados" />}
      </div>
    </div>
  );

  if (page === 'pedidos') return (
    <div>
      <h2 className="text-xl font-bold mb-4">Todos los pedidos</h2>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase hidden sm:table-cell">Zona/Descripción</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Precio</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Estado</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase hidden md:table-cell">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.slice(0, 50).map(o => (
                <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-800">{o.cliente_nombre ?? 'Particular'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{o.zona_label ?? o.descripcion ?? '—'}</td>
                  <td className="px-4 py-3 font-bold">${(o.precio ?? 0).toLocaleString('es-AR')}</td>
                  <td className="px-4 py-3">
                    <select
                      value={o.estado}
                      onChange={e => cambiarEstadoOrden(o.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${ESTADO_CHIP[o.estado]}`}>
                      {Object.entries(ESTADO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${o.tipo === 'comercio' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                      {o.tipo}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── INICIO ──
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Pedidos hoy"    value={pedidosHoy.length}   color="green" />
        <StatCard label="Pendientes"     value={pendientes.length}   color={pendientes.length > 0 ? 'red' : 'green'} />
        <StatCard label="Cadetes activos" value={disponibles.length + enViaje.length} color="blue" />
        <StatCard label="Comercios"      value={comercios.length}    color="gray" />
      </div>

      {/* Alertas pedidos sin cadete */}
      {pendientes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="font-bold text-red-700 mb-2">⚠️ {pendientes.length} pedido{pendientes.length > 1 ? 's' : ''} sin cadete</p>
          <div className="space-y-2">
            {pendientes.slice(0, 3).map(o => (
              <div key={o.id} className="bg-white rounded-xl p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold">{o.cliente_nombre ?? 'Particular'}</p>
                  <p className="text-xs text-gray-400">{o.zona_label ?? o.descripcion ?? '—'} · ${(o.precio ?? 0).toLocaleString('es-AR')}</p>
                </div>
                <p className="text-xs text-gray-400">
                  {Math.floor((Date.now() - new Date(o.creado_en)) / 60000)} min
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-5">
        {/* Cadetes */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold mb-3">Cadetes en vivo</h3>
          <div className="space-y-2">
            {cadetes.slice(0, 6).map(c => (
              <div key={c.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${c.estado === 'disponible' ? 'bg-green-500' : c.estado === 'en_viaje' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <span className="text-sm font-medium">{c.nombre}</span>
                </div>
                <span className="text-xs text-gray-400">{c.estado}</span>
              </div>
            ))}
            {cadetes.length === 0 && <p className="text-sm text-gray-400">Sin cadetes registrados</p>}
          </div>
        </div>

        {/* Últimos pedidos */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold mb-3">Últimos pedidos</h3>
          <div className="space-y-2">
            {ordenes.slice(0, 5).map(o => (
              <div key={o.id} className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold">{o.cliente_nombre ?? 'Particular'}</p>
                  <p className="text-xs text-gray-400">{o.zona_label ?? o.descripcion ?? '—'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ESTADO_CHIP[o.estado]}`}>
                  {ESTADO_LABEL[o.estado]}
                </span>
              </div>
            ))}
            {ordenes.length === 0 && <p className="text-sm text-gray-400">Sin pedidos</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colors = { green: 'text-green-600', blue: 'text-blue-600', red: 'text-red-500', gray: 'text-gray-700' };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}
function Empty({ texto }) {
  return <p className="text-sm text-gray-400 text-center py-8 col-span-full">{texto}</p>;
}
function Spinner() {
  return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"/></div>;
}
