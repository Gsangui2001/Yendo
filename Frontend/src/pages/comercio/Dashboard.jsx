import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Pedido from '../../components/Comercio/Pedido';

const ZONAS = [
  { value: 'ciudad_colon',      label: 'Ciudad de Colón',   precio: 3000 },
  { value: 'barrio_ombu',       label: 'Barrio Ombú',       precio: 3500 },
  { value: 'barrio_artalaz',    label: 'Barrio Artalaz',    precio: 5000 },
  { value: 'barrio_los_bretes', label: 'Barrio Los Bretes', precio: 6000 },
  { value: 'san_jose',          label: 'San José',          precio: 8500 },
  { value: 'el_brillante',      label: 'El Brillante',      precio: 8500 },
  { value: 'pueblo_liebig',     label: 'Pueblo Liebig',     precio: 8500 },
];

const ESTADO_CHIP = {
  pendiente: 'bg-amber-100 text-amber-700',
  asignada:  'bg-blue-100 text-blue-700',
  en_camino: 'bg-blue-100 text-blue-700',
  entregada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-500',
};
const ESTADO_LABEL = {
  pendiente: 'Buscando cadete',
  asignada:  'Cadete asignado',
  en_camino: 'En camino',
  entregada: 'Entregado',
  cancelada: 'Cancelado',
};

export default function ComercioApp({ perfil, page, setPage }) {
  const [comercio,   setComercio]   = useState(null);
  const [ordenes,    setOrdenes]    = useState([]);
  const [clientes,   setClientes]   = useState([]);
  const [loadingData,setLoadingData]= useState(true);

  // Modal nuevo cliente
  const [showModal, setShowModal] = useState(false);
  const [newCliente, setNewCliente] = useState({ nombre: '', telefono: '', direccion: '', zona: '' });
  const [savingCliente, setSavingCliente] = useState(false);

  useEffect(() => { cargarDatos(); }, [perfil]);

  // Realtime ordenes
  useEffect(() => {
    if (!comercio) return;
    const ch = supabase.channel('ordenes-comercio')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes',
        filter: `comercio_id=eq.${comercio.id}` }, () => cargarOrdenes())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [comercio]);

  async function cargarDatos() {
    setLoadingData(true);
    const { data: com } = await supabase
      .from('comercios').select('*').eq('owner_id', perfil.id).single();
    setComercio(com);
    if (com) {
      await Promise.all([cargarOrdenes(com.id), cargarClientes(com.id)]);
    }
    setLoadingData(false);
  }

  async function cargarOrdenes(cid) {
    const id = cid ?? comercio?.id;
    if (!id) return;
    const { data } = await supabase.from('ordenes').select('*')
      .eq('comercio_id', id).order('creado_en', { ascending: false }).limit(50);
    setOrdenes(data ?? []);
  }

  async function cargarClientes(cid) {
    const id = cid ?? comercio?.id;
    if (!id) return;
    const { data } = await supabase.from('clientes').select('*')
      .eq('comercio_id', id).order('nombre');
    setClientes(data ?? []);
  }

  async function guardarCliente(e) {
    e.preventDefault();
    if (!newCliente.nombre.trim()) return;
    setSavingCliente(true);
    await supabase.from('clientes').insert({
      comercio_id: comercio.id,
      nombre: newCliente.nombre.trim(),
      telefono: newCliente.telefono.trim(),
      direccion: newCliente.direccion.trim(),
      zona: newCliente.zona,
    });
    await cargarClientes();
    setNewCliente({ nombre: '', telefono: '', direccion: '', zona: '' });
    setShowModal(false);
    setSavingCliente(false);
  }

  async function eliminarCliente(id) {
    if (!confirm('¿Eliminar cliente?')) return;
    await supabase.from('clientes').delete().eq('id', id);
    cargarClientes();
  }

  if (loadingData) return <Spinner />;

  const hoy = ordenes.filter(o => o.creado_en?.startsWith(new Date().toISOString().slice(0, 10)));
  const activas = ordenes.filter(o => ['pendiente','asignada','en_camino'].includes(o.estado));

  // ── PÁGINAS ──
  if (page === 'pedido') return (
    <Pedido comercioId={comercio?.id} onSuccess={() => { setPage('inicio'); cargarOrdenes(); }} />
  );

  if (page === 'historial') return (
    <div>
      <h2 className="text-xl font-bold mb-4">Historial de pedidos</h2>
      <TablaOrdenes ordenes={ordenes} />
    </div>
  );

  if (page === 'clientes') return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Clientes guardados</h2>
        <button onClick={() => setShowModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700">
          + Nuevo cliente
        </button>
      </div>

      {clientes.length === 0
        ? <Empty texto="No tenés clientes guardados aún" />
        : <div className="grid gap-3 sm:grid-cols-2">
            {clientes.map(c => (
              <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-900">{c.nombre}</p>
                  {c.telefono && <p className="text-sm text-gray-500">📞 {c.telefono}</p>}
                  {c.direccion && <p className="text-sm text-gray-500">📍 {c.direccion}</p>}
                  {c.zona && <p className="text-xs text-green-600 font-semibold mt-1">
                    {ZONAS.find(z => z.value === c.zona)?.label}
                  </p>}
                </div>
                <button onClick={() => eliminarCliente(c.id)} className="text-gray-300 hover:text-red-400 text-lg">×</button>
              </div>
            ))}
          </div>
      }

      {showModal && (
        <Modal titulo="Nuevo cliente" onClose={() => setShowModal(false)}>
          <form onSubmit={guardarCliente} className="space-y-4">
            <Campo label="Nombre *" value={newCliente.nombre} onChange={v => setNewCliente(p => ({...p, nombre: v}))} placeholder="Ej: Hospital Central" />
            <Campo label="Teléfono" value={newCliente.telefono} onChange={v => setNewCliente(p => ({...p, telefono: v}))} placeholder="+54 11 ..." />
            <Campo label="Dirección" value={newCliente.direccion} onChange={v => setNewCliente(p => ({...p, direccion: v}))} placeholder="Calle y número" />
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Zona habitual</label>
              <select value={newCliente.zona} onChange={e => setNewCliente(p => ({...p, zona: e.target.value}))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="">Sin zona</option>
                {ZONAS.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </div>
            <button type="submit" disabled={savingCliente}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60">
              {savingCliente ? 'Guardando...' : 'Guardar cliente'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );

  // ── INICIO ──
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Pedidos hoy"   value={hoy.length}   color="green" />
        <Stat label="Activos ahora" value={activas.length} color="blue" />
        <Stat label="Entregados hoy" value={hoy.filter(o => o.estado === 'entregada').length} color="green" />
        <Stat label="Clientes" value={clientes.length} color="gray" />
      </div>

      {/* Pedidos activos */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Pedidos activos</h3>
          <button onClick={() => setPage('pedido')}
            className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-700">
            + Nuevo pedido
          </button>
        </div>
        {activas.length === 0
          ? <p className="text-sm text-gray-400 py-4 text-center">No hay pedidos activos</p>
          : <TablaOrdenes ordenes={activas} />
        }
      </div>

      {/* Últimos pedidos */}
      {ordenes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Últimos pedidos</h3>
            <button onClick={() => setPage('historial')} className="text-sm text-green-600 font-semibold">Ver todos →</button>
          </div>
          <TablaOrdenes ordenes={ordenes.slice(0, 5)} />
        </div>
      )}
    </div>
  );
}

function TablaOrdenes({ ordenes }) {
  if (!ordenes.length) return <Empty texto="Sin pedidos" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
            <th className="text-left pb-2 pr-4">Cliente</th>
            <th className="text-left pb-2 pr-4 hidden sm:table-cell">Zona</th>
            <th className="text-left pb-2 pr-4">Precio</th>
            <th className="text-left pb-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {ordenes.map(o => (
            <tr key={o.id} className="border-b border-gray-50 last:border-0">
              <td className="py-3 pr-4 font-semibold text-gray-800">{o.cliente_nombre ?? '—'}</td>
              <td className="py-3 pr-4 text-gray-500 hidden sm:table-cell">{o.zona_label ?? '—'}</td>
              <td className="py-3 pr-4 font-bold text-gray-900">${(o.precio ?? 0).toLocaleString('es-AR')}</td>
              <td className="py-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_CHIP[o.estado]}`}>
                  {ESTADO_LABEL[o.estado]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Helpers ──
function Stat({ label, value, color }) {
  const colors = { green: 'text-green-600', blue: 'text-blue-600', gray: 'text-gray-700' };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}
function Empty({ texto }) {
  return <p className="text-sm text-gray-400 text-center py-8">{texto}</p>;
}
function Spinner() {
  return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"/></div>;
}
function Modal({ titulo, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Campo({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
    </div>
  );
}
