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

const fmt = n => (n ?? 0).toLocaleString('es-AR');

export default function ComercioApp({ perfil, page, setPage }) {
  const [comercio,    setComercio]    = useState(null);
  const [ordenes,     setOrdenes]     = useState([]);
  const [clientes,    setClientes]    = useState([]);
  const [cadetes,     setCadetes]     = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [showModal,     setShowModal]     = useState(false);
  const [newCliente,    setNewCliente]    = useState({ nombre: '', telefono: '', direccion: '', zona: '' });
  const [savingCliente, setSavingCliente] = useState(false);

  useEffect(() => { cargarDatos(); }, [perfil]);

  useEffect(() => {
    if (!comercio) return;
    const ch = supabase.channel('ordenes-comercio')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes', filter: `comercio_id=eq.${comercio.id}` }, () => cargarOrdenes())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [comercio]);

  async function cargarDatos() {
    setLoadingData(true);
    const { data: com } = await supabase.from('comercios').select('*').eq('owner_id', perfil.id).single();
    setComercio(com);
    if (com) await Promise.all([cargarOrdenes(com.id), cargarClientes(com.id)]);
    const { data: cad } = await supabase.from('cadetes').select('*').eq('estado', 'disponible').limit(3);
    setCadetes(cad ?? []);
    setLoadingData(false);
  }
  async function cargarOrdenes(cid) {
    const id = cid ?? comercio?.id; if (!id) return;
    const { data } = await supabase.from('ordenes').select('*').eq('comercio_id', id).order('creado_en', { ascending: false }).limit(50);
    setOrdenes(data ?? []);
  }
  async function cargarClientes(cid) {
    const id = cid ?? comercio?.id; if (!id) return;
    const { data } = await supabase.from('clientes').select('*').eq('comercio_id', id).order('veces_usado', { ascending: false });
    setClientes(data ?? []);
  }
  async function guardarCliente(e) {
    e.preventDefault();
    if (!newCliente.nombre.trim()) return;
    setSavingCliente(true);
    await supabase.from('clientes').insert({ comercio_id: comercio.id, nombre: newCliente.nombre.trim(), telefono: newCliente.telefono.trim(), direccion: newCliente.direccion.trim(), zona: newCliente.zona });
    await cargarClientes();
    setNewCliente({ nombre: '', telefono: '', direccion: '', zona: '' });
    setShowModal(false); setSavingCliente(false);
  }
  async function eliminarCliente(id) {
    if (!confirm('¿Eliminar cliente?')) return;
    await supabase.from('clientes').delete().eq('id', id);
    cargarClientes();
  }

  if (loadingData) return <Spinner />;

  const hoyStr     = new Date().toISOString().slice(0, 10);
  const hoy        = ordenes.filter(o => o.creado_en?.startsWith(hoyStr));
  const activas    = ordenes.filter(o => ['pendiente','asignada','en_camino'].includes(o.estado));
  const entregadasHoy = hoy.filter(o => o.estado === 'entregada');
  const facturacionHoy = entregadasHoy.reduce((s, o) => s + (Number(o.precio) || 0), 0);
  const nombreCorto = comercio?.nombre?.split(' ')[0] ?? 'Comercio';

  // ── NUEVO PEDIDO ──
  if (page === 'pedido') return (
    <>
      <Header perfil={perfil} comercio={comercio} cadetes={cadetes} setPage={setPage} />
      <Pedido comercioId={comercio?.id} onSuccess={() => { setPage('inicio'); cargarOrdenes(); }} />
    </>
  );

  // ── HISTORIAL ──
  if (page === 'historial') return (
    <>
      <Header perfil={perfil} comercio={comercio} cadetes={cadetes} setPage={setPage} />
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-lg font-bold mb-1">Pedidos</h2>
        <p className="text-sm text-gray-400 mb-5">Gestioná todos los pedidos de tu comercio</p>
        <TablaOrdenes ordenes={ordenes} />
      </div>
    </>
  );

  // ── CLIENTES ──
  if (page === 'clientes') return (
    <>
      <Header perfil={perfil} comercio={comercio} cadetes={cadetes} setPage={setPage} />
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <div><h2 className="text-lg font-bold">Clientes</h2><p className="text-sm text-gray-400">Gestioná tus clientes y su historial</p></div>
          <button onClick={() => setShowModal(true)} className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700">+ Nuevo cliente</button>
        </div>
        {clientes.length === 0 ? <Empty texto="No tenés clientes guardados aún" />
          : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clientes.map(c => (
                <div key={c.id} className="border border-gray-100 rounded-2xl p-4 flex justify-between items-start hover:shadow-sm transition-shadow">
                  <div className="flex gap-3">
                    <Avatar nombre={c.nombre} />
                    <div>
                      <p className="font-semibold text-gray-900">{c.nombre}</p>
                      {c.telefono && <p className="text-xs text-gray-500">{c.telefono}</p>}
                      {c.direccion && <p className="text-xs text-gray-400">{c.direccion}</p>}
                      <p className="text-xs text-green-600 font-semibold mt-1">{c.veces_usado ?? 0} pedidos</p>
                    </div>
                  </div>
                  <button onClick={() => eliminarCliente(c.id)} className="text-gray-300 hover:text-red-400 text-lg">×</button>
                </div>
              ))}
            </div>}
      </div>
      {showModal && (
        <Modal titulo="Nuevo cliente" onClose={() => setShowModal(false)}>
          <form onSubmit={guardarCliente} className="space-y-4">
            <Campo label="Nombre *" value={newCliente.nombre} onChange={v => setNewCliente(p => ({...p, nombre: v}))} placeholder="Ej: Hospital Central" />
            <Campo label="Teléfono" value={newCliente.telefono} onChange={v => setNewCliente(p => ({...p, telefono: v}))} placeholder="+54 11 ..." />
            <Campo label="Dirección" value={newCliente.direccion} onChange={v => setNewCliente(p => ({...p, direccion: v}))} placeholder="Calle y número" />
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Zona habitual</label>
              <select value={newCliente.zona} onChange={e => setNewCliente(p => ({...p, zona: e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="">Sin zona</option>{ZONAS.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </div>
            <button type="submit" disabled={savingCliente} className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60">{savingCliente ? 'Guardando...' : 'Guardar cliente'}</button>
          </form>
        </Modal>
      )}
    </>
  );

  // ── INICIO ──
  return (
    <div className="space-y-6">
      <Header perfil={perfil} comercio={comercio} cadetes={cadetes} setPage={setPage} saludo />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon="📦" tint="green"  label="Pedidos hoy"     value={hoy.length}             delta={`+${hoy.length} hoy`} up />
        <StatCard icon="💵" tint="green"  label="Facturación hoy" value={`$${fmt(facturacionHoy)}`} delta="entregados" up />
        <StatCard icon="⏱️" tint="purple" label="Pedidos activos" value={activas.length}         delta="en curso" />
        <StatCard icon="⭐" tint="amber"  label="Clientes"        value={clientes.length}        delta="guardados" up />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Pedidos activos */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Pedidos activos</h3>
            <button onClick={() => setPage('pedido')} className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-700">+ Nuevo pedido</button>
          </div>
          {activas.length === 0
            ? <p className="text-sm text-gray-400 py-8 text-center">No hay pedidos activos</p>
            : <div className="space-y-2">
                {activas.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="text-xs font-bold text-gray-400 w-12">#{o.id.slice(0,4)}</div>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{o.cliente_nombre ?? '—'}</p>
                        <p className="text-xs text-gray-400">{o.direccion ?? o.zona_label ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ESTADO_CHIP[o.estado]}`}>{ESTADO_LABEL[o.estado]}</span>
                      <span className="text-sm font-bold text-gray-900 w-16 text-right">${fmt(o.precio)}</span>
                    </div>
                  </div>
                ))}
              </div>}
          <button onClick={() => setPage('historial')} className="w-full text-center text-sm text-green-600 font-semibold mt-4 pt-3 border-t border-gray-50">Ver todos los pedidos →</button>
        </div>

        {/* Cadetes disponibles */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold text-gray-900 mb-4">Cadetes disponibles</h3>
          {cadetes.length === 0
            ? <p className="text-sm text-gray-400 py-4 text-center">Sin cadetes disponibles</p>
            : <div className="space-y-3">
                {cadetes.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar nombre={c.nombre} />
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{c.nombre}</p>
                        <p className="text-xs text-green-600 font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"/>Disponible</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-amber-500">★ {(4.7 + i*0.1).toFixed(1)}</p>
                      <p className="text-xs text-gray-400">{(1.2 + i).toFixed(1)} km</p>
                    </div>
                  </div>
                ))}
              </div>}
          <div className="mt-4 bg-green-50 rounded-xl p-3 flex items-center gap-3">
            <span className="text-xl">🚲</span>
            <div><p className="text-xs text-gray-500">Tiempo estimado de envío</p><p className="text-sm font-bold text-green-700">7 - 10 minutos</p></div>
          </div>
        </div>
      </div>

      {/* Fila inferior: clientes frecuentes + ventas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Clientes frecuentes</h3>
            <button onClick={() => setPage('clientes')} className="text-sm text-green-600 font-semibold">Ver todos →</button>
          </div>
          {clientes.slice(0,3).length === 0
            ? <p className="text-sm text-gray-400 py-4 text-center">Sin clientes aún</p>
            : <div className="space-y-3">
                {clientes.slice(0,3).map(c => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3"><Avatar nombre={c.nombre} />
                      <div><p className="font-semibold text-sm text-gray-800">{c.nombre}</p><p className="text-xs text-gray-400">{c.veces_usado ?? 0} pedidos</p></div>
                    </div>
                  </div>
                ))}
              </div>}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-gray-900">Resumen</h3>
          </div>
          <p className="text-3xl font-extrabold text-gray-900 mt-2">${fmt(ordenes.filter(o=>o.estado==='entregada').reduce((s,o)=>s+(Number(o.precio)||0),0))}</p>
          <p className="text-sm text-gray-400">Facturación total entregada</p>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <MiniStat label="Total pedidos" value={ordenes.length} />
            <MiniStat label="Entregados" value={ordenes.filter(o=>o.estado==='entregada').length} />
            <MiniStat label="Activos" value={activas.length} />
          </div>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div>
        <h3 className="font-bold text-gray-900 mb-3">Acciones rápidas</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction icon="➕" titulo="Nuevo pedido" sub="Hacé un pedido" tint="green"  onClick={() => setPage('pedido')} />
          <QuickAction icon="👥" titulo="Clientes"     sub="Gestioná clientes" tint="blue" onClick={() => setPage('clientes')} />
          <QuickAction icon="📋" titulo="Pedidos"      sub="Ver historial" tint="purple" onClick={() => setPage('historial')} />
          <QuickAction icon="➕" titulo="Crear pedido" sub="Para tu cliente" tint="amber" onClick={() => setPage('pedido')} />
        </div>
      </div>
    </div>
  );
}

// ── Header superior ──────────────────────────────────────────────────────────
function Header({ perfil, comercio, cadetes, setPage, saludo }) {
  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora  = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const nombre = comercio?.nombre ?? perfil?.nombre ?? 'Comercio';
  return (
    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-2">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 flex items-center gap-2">
          {saludo ? `Hola ${nombre}` : nombre} {saludo && <span>👋</span>}
        </h1>
        <p className="text-sm text-gray-400 capitalize">{fecha} · {hora}</p>
        {saludo && cadetes.length > 0 && (
          <div className="inline-flex items-center gap-2 mt-3 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>{cadetes.length} cadetes disponibles cerca tuyo
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:block bg-white border border-gray-100 rounded-xl px-4 py-2">
          <p className="text-xs text-gray-400">Presupuesto</p>
          <p className="text-sm font-bold text-green-600">${(Number(comercio?.saldo) || 0).toLocaleString('es-AR')}</p>
        </div>
        <button onClick={() => setPage('pedido')} className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-green-700 transition-colors flex items-center gap-2">
          <span className="text-lg leading-none">+</span> Nuevo pedido
        </button>
        <div className="hidden sm:flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2">
          <Avatar nombre={nombre} />
          <div className="pr-1"><p className="text-sm font-bold text-gray-800 leading-tight">{nombre}</p><p className="text-xs text-green-600">Comercio</p></div>
        </div>
      </div>
    </div>
  );
}

// ── Componentes ──────────────────────────────────────────────────────────────
const SPARK = "M2 18 L10 14 L18 16 L26 9 L34 11 L42 4";
function StatCard({ icon, tint, label, value, delta, up }) {
  const tints = { green: 'bg-green-100', blue: 'bg-blue-100', purple: 'bg-purple-100', amber: 'bg-amber-100' };
  const stroke = up ? '#22C55E' : '#9CA3AF';
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl ${tints[tint]} flex items-center justify-center text-xl`}>{icon}</div>
        <svg viewBox="0 0 44 22" className="w-16 h-8"><path d={SPARK} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <p className="text-sm text-gray-400 mt-3">{label}</p>
      <p className="text-2xl font-extrabold text-gray-900">{value}</p>
      <p className={`text-xs font-semibold mt-0.5 ${up ? 'text-green-600' : 'text-gray-400'}`}>{up && '↗ '}{delta}</p>
    </div>
  );
}
function MiniStat({ label, value }) {
  return <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-xl font-bold text-gray-900">{value}</p><p className="text-xs text-gray-400">{label}</p></div>;
}
function QuickAction({ icon, titulo, sub, tint, onClick }) {
  const tints = { green: 'bg-green-100', blue: 'bg-blue-100', purple: 'bg-purple-100', amber: 'bg-amber-100' };
  return (
    <button onClick={onClick} className="bg-white border border-gray-100 rounded-2xl p-4 text-left hover:shadow-md transition-shadow">
      <div className={`w-10 h-10 rounded-xl ${tints[tint]} flex items-center justify-center text-lg mb-3`}>{icon}</div>
      <p className="font-bold text-sm text-gray-800">{titulo}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </button>
  );
}
function Avatar({ nombre }) {
  const initials = (nombre ?? 'U').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  return <div className="w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">{initials}</div>;
}
function TablaOrdenes({ ordenes }) {
  if (!ordenes.length) return <Empty texto="Sin pedidos" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
          <th className="text-left pb-3 pr-4">Pedido</th><th className="text-left pb-3 pr-4">Cliente</th>
          <th className="text-left pb-3 pr-4 hidden sm:table-cell">Zona</th><th className="text-left pb-3 pr-4">Monto</th><th className="text-left pb-3">Estado</th>
        </tr></thead>
        <tbody>
          {ordenes.map(o => (
            <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
              <td className="py-3 pr-4 font-bold text-gray-400">#{o.id.slice(0,4)}</td>
              <td className="py-3 pr-4 font-semibold text-gray-800">{o.cliente_nombre ?? '—'}</td>
              <td className="py-3 pr-4 text-gray-500 hidden sm:table-cell">{o.zona_label ?? '—'}</td>
              <td className="py-3 pr-4 font-bold text-gray-900">${fmt(o.precio)}</td>
              <td className="py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ESTADO_CHIP[o.estado]}`}>{ESTADO_LABEL[o.estado]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Empty({ texto }) { return <p className="text-sm text-gray-400 text-center py-8">{texto}</p>; }
function Spinner() { return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"/></div>; }
function Modal({ titulo, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-lg">{titulo}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button></div>
        {children}
      </div>
    </div>
  );
}
function Campo({ label, value, onChange, placeholder }) {
  return (
    <div><label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" /></div>
  );
}
