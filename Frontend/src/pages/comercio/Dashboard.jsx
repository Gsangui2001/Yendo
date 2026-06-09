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

const ESTADO_CONFIG = {
  pendiente: { chip: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',  label: 'Buscando cadete', dot: 'bg-amber-400 animate-pulse' },
  asignada:  { chip: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',    label: 'Cadete asignado', dot: 'bg-blue-400' },
  en_camino: { chip: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',    label: 'En camino',       dot: 'bg-blue-500 animate-pulse' },
  entregada: { chip: 'bg-green-100 text-green-700 ring-1 ring-green-200', label: 'Entregado',       dot: 'bg-green-500' },
  cancelada: { chip: 'bg-red-100 text-red-600 ring-1 ring-red-200',       label: 'Cancelado',       dot: 'bg-red-400' },
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
  const nombre = comercio?.nombre ?? perfil?.nombre ?? 'Comercio';

  // ── NUEVO PEDIDO ──────────────────────────────────────────────────────────
  if (page === 'pedido') return (
    <div className="animate-fade-in">
      <PageHeader titulo="Nuevo pedido" sub="Creá un pedido para tu comercio" onBack={() => setPage('inicio')} />
      <Pedido comercioId={comercio?.id} onSuccess={() => { setPage('inicio'); cargarOrdenes(); }} />
    </div>
  );

  // ── HISTORIAL ─────────────────────────────────────────────────────────────
  if (page === 'historial') return (
    <div className="animate-fade-in space-y-5">
      <PageHeader titulo="Pedidos" sub="Historial completo de pedidos" onBack={() => setPage('inicio')} />
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <TablaOrdenes ordenes={ordenes} />
      </div>
    </div>
  );

  // ── CLIENTES ──────────────────────────────────────────────────────────────
  if (page === 'clientes') return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-start justify-between">
        <PageHeader titulo="Clientes" sub="Gestioná tus clientes y su historial" onBack={() => setPage('inicio')} />
        <Btn onClick={() => setShowModal(true)} icon="➕">Nuevo cliente</Btn>
      </div>
      {clientes.length === 0
        ? <Empty texto="No tenés clientes guardados aún" icon="👥" />
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">
            {clientes.map((c, i) => (
              <div
                key={c.id}
                style={{ animationDelay: `${i * 50}ms` }}
                className="bg-white border border-gray-100 rounded-2xl p-4 flex justify-between items-start shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lift hover:border-gray-200 animate-slide-up group"
              >
                <div className="flex gap-3">
                  <Avatar nombre={c.nombre} />
                  <div>
                    <p className="font-semibold text-gray-900">{c.nombre}</p>
                    {c.telefono && <p className="text-xs text-gray-500 mt-0.5">{c.telefono}</p>}
                    {c.direccion && <p className="text-xs text-gray-400">{c.direccion}</p>}
                    <p className="text-xs text-green-600 font-bold mt-1.5">{c.veces_usado ?? 0} pedidos</p>
                  </div>
                </div>
                <button
                  onClick={() => eliminarCliente(c.id)}
                  className="text-gray-300 hover:text-red-400 text-lg leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-all duration-200 opacity-0 group-hover:opacity-100"
                >×</button>
              </div>
            ))}
          </div>}
      {showModal && (
        <Modal titulo="Nuevo cliente" onClose={() => setShowModal(false)}>
          <form onSubmit={guardarCliente} className="space-y-4">
            <Campo label="Nombre *"    value={newCliente.nombre}    onChange={v => setNewCliente(p => ({...p, nombre: v}))}    placeholder="Ej: Hospital Central" />
            <Campo label="Teléfono"    value={newCliente.telefono}  onChange={v => setNewCliente(p => ({...p, telefono: v}))}  placeholder="+54 345 ..." />
            <Campo label="Dirección"   value={newCliente.direccion} onChange={v => setNewCliente(p => ({...p, direccion: v}))} placeholder="Calle y número" />
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Zona habitual</label>
              <select value={newCliente.zona} onChange={e => setNewCliente(p => ({...p, zona: e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">Sin zona</option>{ZONAS.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </div>
            <Btn type="submit" disabled={savingCliente} full>
              {savingCliente ? 'Guardando...' : 'Guardar cliente'}
            </Btn>
          </form>
        </Modal>
      )}
    </div>
  );

  // ── INICIO ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header saludo */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="animate-slide-up">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 flex items-center gap-2">
            Hola, {nombre} <span className="animate-float inline-block">👋</span>
          </h1>
          <p className="text-sm text-gray-400 capitalize mt-0.5">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {cadetes.length > 0 && (
            <div className="inline-flex items-center gap-2 mt-3 bg-green-50 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full border border-green-100">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              {cadetes.length} cadetes disponibles cerca tuyo
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Btn onClick={() => setPage('pedido')} icon="+" size="lg">Nuevo pedido</Btn>
          <div className="hidden sm:flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
            <Avatar nombre={nombre} />
            <div className="pr-1">
              <p className="text-sm font-bold text-gray-800 leading-tight">{nombre}</p>
              <p className="text-xs text-green-600 font-medium">Comercio</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 stagger">
        <StatCard icon="📦" tint="green"  label="Pedidos hoy"     value={hoy.length}                  delta={`+${hoy.length} hoy`}    up  idx={0} />
        <StatCard icon="💵" tint="green"  label="Facturación hoy" value={`$${fmt(facturacionHoy)}`}   delta="entregados"               up  idx={1} />
        <StatCard icon="⏱️" tint="blue"   label="Pedidos activos" value={activas.length}              delta="en curso"                      idx={2} />
        <StatCard icon="⭐" tint="amber"  label="Clientes"        value={clientes.length}             delta="guardados"                up  idx={3} />
      </div>

      {/* Pedidos activos + Cadetes */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm transition-all duration-200 hover:shadow-md animate-slide-up" style={{ animationDelay: '150ms' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-900">Pedidos activos</h3>
              {activas.length > 0 && <p className="text-xs text-gray-400 mt-0.5">{activas.length} en curso ahora</p>}
            </div>
            <Btn onClick={() => setPage('pedido')} size="sm" icon="+">Nuevo pedido</Btn>
          </div>
          {activas.length === 0
            ? <Empty texto="No hay pedidos activos" icon="📭" />
            : <div className="space-y-1">
                {activas.map((o, i) => {
                  const cfg = ESTADO_CONFIG[o.estado] ?? {};
                  return (
                    <div key={o.id} style={{ animationDelay: `${i * 60}ms` }}
                      className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-gray-50 transition-all duration-150 group animate-fade-in cursor-default">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-300 w-12">#{o.id.slice(0,4).toUpperCase()}</span>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{o.cliente_nombre ?? '—'}</p>
                          <p className="text-xs text-gray-400">{o.direccion ?? o.zona_label ?? '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`badge ${cfg.chip}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        <span className="text-sm font-extrabold text-gray-900 w-16 text-right">${fmt(o.precio)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>}
          <button
            onClick={() => setPage('historial')}
            className="w-full text-center text-sm text-green-600 font-bold mt-4 pt-3 border-t border-gray-50 hover:text-green-700 transition-colors"
          >
            Ver todos los pedidos →
          </button>
        </div>

        {/* Cadetes disponibles */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm animate-slide-up" style={{ animationDelay: '200ms' }}>
          <h3 className="font-bold text-gray-900 mb-4">Cadetes disponibles</h3>
          {cadetes.length === 0
            ? <p className="text-sm text-gray-400 py-4 text-center">Sin cadetes disponibles</p>
            : <div className="space-y-3">
                {cadetes.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Avatar nombre={c.nombre} />
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{c.nombre}</p>
                        <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                          </span>
                          Disponible
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-amber-500">★ {(4.7 + i*0.1).toFixed(1)}</p>
                      <p className="text-xs text-gray-400">{(1.2 + i).toFixed(1)} km</p>
                    </div>
                  </div>
                ))}
              </div>}
          <div className="mt-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 flex items-center gap-3 border border-green-100">
            <span className="text-2xl animate-float inline-block">🚲</span>
            <div>
              <p className="text-xs text-gray-500">Tiempo estimado de envío</p>
              <p className="text-sm font-bold text-green-700">7 - 10 minutos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Fila inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Clientes frecuentes */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm animate-slide-up" style={{ animationDelay: '250ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Clientes frecuentes</h3>
            <button onClick={() => setPage('clientes')} className="text-sm text-green-600 font-bold hover:text-green-700 transition-colors">
              Ver todos →
            </button>
          </div>
          {clientes.slice(0,3).length === 0
            ? <Empty texto="Sin clientes aún" icon="👥" />
            : <div className="space-y-3">
                {clientes.slice(0,3).map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Avatar nombre={c.nombre} />
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{c.nombre}</p>
                        <p className="text-xs text-gray-400">{c.veces_usado ?? 0} pedidos</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>}
        </div>

        {/* Resumen facturación */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm animate-slide-up" style={{ animationDelay: '300ms' }}>
          <h3 className="font-bold text-gray-900 mb-2">Resumen de facturación</h3>
          <p className="text-3xl font-extrabold text-gray-900 mt-2">
            ${fmt(ordenes.filter(o=>o.estado==='entregada').reduce((s,o)=>s+(Number(o.precio)||0),0))}
          </p>
          <p className="text-sm text-gray-400">Total entregado</p>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <MiniStat label="Total" value={ordenes.length} icon="📊" />
            <MiniStat label="Entregados" value={ordenes.filter(o=>o.estado==='entregada').length} icon="✅" />
            <MiniStat label="Activos" value={activas.length} icon="⏱️" />
          </div>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="animate-slide-up" style={{ animationDelay: '350ms' }}>
        <h3 className="font-bold text-gray-900 mb-3">Acciones rápidas</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
          <QuickAction icon="➕" titulo="Nuevo pedido"  sub="Hacé un pedido"     tint="green"  onClick={() => setPage('pedido')}    idx={0} />
          <QuickAction icon="👥" titulo="Clientes"      sub="Gestioná clientes"  tint="blue"   onClick={() => setPage('clientes')}  idx={1} />
          <QuickAction icon="📋" titulo="Pedidos"       sub="Ver historial"      tint="purple" onClick={() => setPage('historial')} idx={2} />
          <QuickAction icon="📦" titulo="Saldo"         sub="Tu presupuesto"     tint="amber"  onClick={() => {}}                   idx={3} />
        </div>
      </div>
    </div>
  );
}

// ── Componentes ──────────────────────────────────────────────────────────────

function PageHeader({ titulo, sub, onBack }) {
  return (
    <div className="mb-5 animate-slide-up">
      {onBack && (
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1 mb-3 transition-all hover:-translate-x-0.5">
          ← Volver al inicio
        </button>
      )}
      <h1 className="text-2xl font-extrabold text-gray-900">{titulo}</h1>
      {sub && <p className="text-sm text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Btn({ children, onClick, icon, size = 'md', full = false, type = 'button', disabled = false }) {
  const sizes = {
    sm:  'px-3 py-1.5 text-xs',
    md:  'px-4 py-2 text-sm',
    lg:  'px-5 py-2.5 text-sm',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        ${full ? 'w-full' : ''}
        ${sizes[size]}
        btn-primary ripple font-bold
        disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0
      `}
    >
      {icon && <span className="text-base leading-none">{icon}</span>}
      {children}
    </button>
  );
}

const SPARK = "M2 18 L10 14 L18 16 L26 9 L34 11 L42 4";
const TINT_MAP = {
  green:  { bg: 'bg-green-50',  icon: 'bg-green-100',  text: 'text-green-700', stroke: '#22C55E' },
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100',   text: 'text-blue-700',  stroke: '#3B82F6' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-100', text: 'text-purple-700',stroke: '#A855F7' },
  amber:  { bg: 'bg-amber-50',  icon: 'bg-amber-100',  text: 'text-amber-700', stroke: '#F59E0B' },
};

function StatCard({ icon, tint, label, value, delta, up, idx = 0 }) {
  const t = TINT_MAP[tint] ?? TINT_MAP.green;
  return (
    <div
      style={{ animationDelay: `${idx * 60}ms` }}
      className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lift hover:border-gray-200 animate-slide-up cursor-default"
    >
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl ${t.icon} flex items-center justify-center text-xl transition-transform duration-200 hover:scale-110`}>
          {icon}
        </div>
        <svg viewBox="0 0 44 22" className="w-16 h-8 opacity-70">
          <path d={SPARK} fill="none" stroke={up ? t.stroke : '#9CA3AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <p className="text-xs text-gray-400 mt-3 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-2xl font-extrabold text-gray-900 mt-0.5 animate-count-up">{value}</p>
      <p className={`text-xs font-semibold mt-1 flex items-center gap-1 ${up ? t.text : 'text-gray-400'}`}>
        {up && '↗'} {delta}
      </p>
    </div>
  );
}

function MiniStat({ label, value, icon }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center hover:bg-gray-100 transition-colors cursor-default">
      {icon && <p className="text-lg mb-1">{icon}</p>}
      <p className="text-xl font-extrabold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

function QuickAction({ icon, titulo, sub, tint, onClick, idx = 0 }) {
  const t = TINT_MAP[tint] ?? TINT_MAP.green;
  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${idx * 60}ms` }}
      className="bg-white border border-gray-100 rounded-2xl p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lift hover:border-gray-200 active:scale-95 group animate-slide-up"
    >
      <div className={`w-11 h-11 rounded-xl ${t.icon} flex items-center justify-center text-xl mb-3 transition-transform duration-200 group-hover:scale-110`}>
        {icon}
      </div>
      <p className="font-bold text-sm text-gray-800">{titulo}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </button>
  );
}

function Avatar({ nombre }) {
  const initials = (nombre ?? 'U').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
      {initials}
    </div>
  );
}

function TablaOrdenes({ ordenes }) {
  if (!ordenes.length) return <Empty texto="Sin pedidos" icon="📭" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
            <th className="text-left pb-3 pr-4">Pedido</th>
            <th className="text-left pb-3 pr-4">Cliente</th>
            <th className="text-left pb-3 pr-4 hidden sm:table-cell">Zona</th>
            <th className="text-left pb-3 pr-4">Monto</th>
            <th className="text-left pb-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          {ordenes.map((o, i) => {
            const cfg = ESTADO_CONFIG[o.estado] ?? {};
            return (
              <tr key={o.id} style={{ animationDelay: `${i * 30}ms` }} className="border-b border-gray-50 last:border-0 table-row-hover animate-fade-in">
                <td className="py-3 pr-4 font-bold text-gray-300">#{o.id.slice(0,4).toUpperCase()}</td>
                <td className="py-3 pr-4 font-semibold text-gray-800">{o.cliente_nombre ?? '—'}</td>
                <td className="py-3 pr-4 text-gray-500 hidden sm:table-cell">{o.zona_label ?? '—'}</td>
                <td className="py-3 pr-4 font-extrabold text-gray-900">${fmt(o.precio)}</td>
                <td className="py-3">
                  <span className={`badge ${cfg.chip}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ texto, icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
      {icon && <span className="text-3xl opacity-40">{icon}</span>}
      <p className="text-sm">{texto}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-green-100" />
        <div className="absolute inset-0 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-sm text-gray-400 font-medium">Cargando...</p>
    </div>
  );
}

function Modal({ titulo, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lift-lg animate-bounce-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg text-gray-900">{titulo}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all text-xl leading-none active:scale-90"
          >×</button>
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
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all hover:border-gray-300 placeholder:text-gray-400"
      />
    </div>
  );
}
