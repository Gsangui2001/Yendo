import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Pedido from '../../components/Comercio/Pedido';
import { apiFetch, readApiError } from '../../lib/api';
import { useToast, useConfirm } from '../../components/ui/feedback';
import { Icon } from '../../components/ui/Icon';
import { TrackingMap } from '../../features/tracking/TrackingMapLazy';

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
  const toast = useToast();
  const confirm = useConfirm();
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

  // Teléfono/GPS del cadete asignado al pedido en seguimiento (vía backend,
  // que valida que tengamos un pedido activo con él).
  const [contactoCadete, setContactoCadete] = useState(null);
  const ordenConCadete = ordenes.find(o => ['asignada', 'en_camino'].includes(o.estado)) ?? null;
  const cadeteAsignadoId = ordenConCadete?.cadete_id ?? ordenConCadete?.asignado_a_id ?? null;
  useEffect(() => {
    if (!cadeteAsignadoId) { setContactoCadete(null); return; }
    let vivo = true;
    apiFetch(`/api/cadetes/${cadeteAsignadoId}/contacto`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (vivo) setContactoCadete(data); })
      .catch(() => { if (vivo) setContactoCadete(null); });
    return () => { vivo = false; };
  }, [cadeteAsignadoId]);

  async function cargarDatos() {
    setLoadingData(true);
    const { data: com } = await supabase.from('comercios').select('*').eq('owner_id', perfil.id).single();
    setComercio(com);
    if (com) await Promise.all([cargarOrdenes(com.id), cargarClientes(com.id)]);
    // Lista operativa vía backend: columnas seguras, sin ganancias ni teléfono.
    // El teléfono del cadete asignado sale de /contacto (validado por pedido).
    try {
      const res = await apiFetch('/api/cadetes/activos');
      setCadetes(res.ok ? await res.json() : []);
    } catch {
      setCadetes([]);
    }
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
    try {
      const res = await apiFetch('/api/clientes', {
        method: 'POST',
        body: JSON.stringify({ comercio_id: comercio.id, nombre: newCliente.nombre.trim(), telefono: newCliente.telefono.trim(), direccion: newCliente.direccion.trim(), zona: newCliente.zona }),
      });
      if (!res.ok) { toast.error(await readApiError(res)); return; }
      await cargarClientes();
      setNewCliente({ nombre: '', telefono: '', direccion: '', zona: '' });
      setShowModal(false);
      toast.success('Cliente guardado');
    } catch {
      toast.error('No se pudo guardar el cliente. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setSavingCliente(false);
    }
  }
  async function eliminarCliente(id) {
    const ok = await confirm({ title: 'Eliminar cliente', message: 'Se va a quitar de tu lista de clientes. Esta acción no se puede deshacer.', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/clientes/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readApiError(res)); return; }
      cargarClientes();
      toast.success('Cliente eliminado');
    } catch {
      toast.error('No se pudo eliminar el cliente. Revisá tu conexión e intentá de nuevo.');
    }
  }

  if (loadingData) return <Spinner />;

  const hoyStr     = new Date().toISOString().slice(0, 10);
  const hoy        = ordenes.filter(o => o.creado_en?.startsWith(hoyStr));
  const activas    = ordenes.filter(o => ['pendiente','asignada','en_camino'].includes(o.estado));
  const entregadasHoy = hoy.filter(o => o.estado === 'entregada');
  const facturacionHoy = entregadasHoy.reduce((s, o) => s + (Number(o.precio) || 0), 0);
  const nombre = comercio?.nombre ?? perfil?.nombre ?? 'Comercio';
  const cadetesDisponibles = cadetes.filter(c => c.estado === 'disponible');
  const pedidoEnSeguimiento = activas.find(o => ['asignada', 'en_camino'].includes(o.estado)) ?? activas[0] ?? null;
  const cadeteBase = pedidoEnSeguimiento
    ? cadetes.find(c => c.id === pedidoEnSeguimiento.cadete_id || c.id === pedidoEnSeguimiento.asignado_a_id) ?? null
    : null;
  // Merge: la lista /activos trae nombre/zona/GPS; /contacto suma el teléfono.
  const cadeteAsignado = (cadeteBase || contactoCadete)
    ? { ...(cadeteBase ?? {}), ...(contactoCadete ?? {}) }
    : null;
  const ordenMapa = pedidoEnSeguimiento ?? {
    estado: 'pendiente',
    zona: comercio?.zona ?? 'ciudad_colon',
    zona_label: comercio?.zona_label ?? 'Zona del comercio',
    comercio_nombre: nombre,
    direccion: comercio?.direccion ?? 'Destino del pedido',
  };

  // ── NUEVO PEDIDO ──────────────────────────────────────────────────────────
  if (page === 'pedido') return (
    <div className="animate-fade-in">
      <PageHeader titulo="Nuevo pedido" sub="Creá un pedido para tu comercio" onBack={() => setPage('inicio')} />
      <Pedido comercioId={comercio?.id} comercio={comercio} onSuccess={() => { setPage('inicio'); cargarOrdenes(); }} />
    </div>
  );

  // ── SALDO Y PLAN ──────────────────────────────────────────────────────────
  if (page === 'saldo') return (
    <div className="animate-fade-in space-y-5">
      <PageHeader titulo="Saldo y plan" sub="Estado de cuenta de tu comercio" onBack={() => setPage('inicio')} />
      <SaldoView comercio={comercio} ordenes={ordenes} nombre={nombre} />
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
        <Btn onClick={() => setShowModal(true)} icon="+">Nuevo cliente</Btn>
      </div>
      {clientes.length === 0
        ? <Empty texto="No tenés clientes guardados aún" icon="users" />
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            Hola, {nombre}
          </h1>
          <p className="text-sm text-gray-400 capitalize mt-0.5">
            {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {cadetesDisponibles.length > 0 && (
            <div className="inline-flex items-center gap-2 mt-3 bg-green-50 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full border border-green-100">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              {cadetesDisponibles.length} cadetes disponibles cerca tuyo
            </div>
          )}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <button
            onClick={() => setPage('pedido')}
            className="group flex min-h-[72px] w-full items-center justify-between gap-4 rounded-2xl bg-green-600 px-5 py-4 text-left text-white shadow-lift transition-all hover:-translate-y-0.5 hover:bg-green-700 active:translate-y-0 active:scale-[0.99] sm:min-w-[260px]"
          >
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wide text-green-100">Acción principal</span>
              <span className="block text-xl font-extrabold leading-tight">Nuevo pedido</span>
              <span className="mt-0.5 block text-xs font-medium text-green-100">Pedir cadete ahora</span>
            </span>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-green-700 transition-transform group-hover:scale-105">
              <Icon name="plus" className="h-6 w-6" />
            </span>
          </button>
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
        <StatCard icon="box"    tint="green"  label="Pedidos hoy"     value={hoy.length}                  delta={`+${hoy.length} hoy`}    up  idx={0} />
        <StatCard icon="wallet" tint="green"  label="Facturación hoy" value={`$${fmt(facturacionHoy)}`}   delta="entregados"               up  idx={1} />
        <StatCard icon="clock"  tint="purple" label="Pedidos activos" value={activas.length}              delta="en curso"                      idx={2} />
        <StatCard icon="users"  tint="violet" label="Clientes"        value={clientes.length}             delta="guardados"                up  idx={3} />
      </div>

      {/* Seguimiento + pedidos activos */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-5">
        <div className="animate-slide-up" style={{ animationDelay: '150ms' }}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Mapa del envío</h3>
              <p className="text-xs text-gray-400">
                {pedidoEnSeguimiento ? 'Seguimiento del pedido activo' : 'Vista estimada hasta crear un pedido'}
              </p>
            </div>
            <button onClick={() => setPage('pedido')} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-green-700 active:scale-95">
              <Icon name="plus" className="h-4 w-4" />
              Pedir cadete
            </button>
          </div>
          <TrackingMap
            order={ordenMapa}
            cadete={cadeteAsignado}
            cadetes={cadetesDisponibles}
            height={420}
            compact
          />
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm animate-slide-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">Pedido principal</h3>
                <p className="text-xs text-gray-400">{activas.length} pedidos activos</p>
              </div>
              <button onClick={() => setPage('historial')} className="text-sm text-green-600 font-bold hover:text-green-700">Ver todos</button>
            </div>
            {pedidoEnSeguimiento
              ? <PedidoActivo orden={pedidoEnSeguimiento} cadete={cadeteAsignado} />
              : (
                <div className="rounded-2xl border border-dashed border-green-200 bg-green-50 p-5 text-center">
                  <p className="text-3xl mb-2">+</p>
                  <p className="font-bold text-gray-900">No hay pedidos activos</p>
                  <p className="text-sm text-gray-500 mt-1">Creá uno y vas a ver el seguimiento acá.</p>
                  <button onClick={() => setPage('pedido')} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-green-700">
                    <Icon name="plus" className="h-4 w-4" />
                    Nuevo pedido
                  </button>
                </div>
              )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm animate-slide-up" style={{ animationDelay: '240ms' }}>
            <h3 className="font-bold text-gray-900 mb-4">Cadetes disponibles</h3>
            {cadetesDisponibles.length === 0
              ? <p className="text-sm text-gray-400 py-4 text-center">Sin cadetes disponibles</p>
              : <div className="space-y-3">
                  {cadetesDisponibles.slice(0, 5).map((c, i) => (
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
                        <p className={`text-xs font-bold ${c.ubicacion_lat ? 'text-green-600' : 'text-gray-400'}`}>
                          {c.ubicacion_lat ? 'GPS activo' : 'Sin GPS'}
                        </p>
                        {c.zona && <p className="text-xs text-gray-400 capitalize">{String(c.zona).replace(/_/g, ' ')}</p>}
                      </div>
                    </div>
                  ))}
                </div>}
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 p-3">
              <Icon name="bike" className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-xs text-gray-500">Asignación automática</p>
                <p className="text-sm font-bold text-green-700">Tomamos el cadete más cercano</p>
              </div>
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
            ? <Empty texto="Sin clientes aún" icon="users" />
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
            <MiniStat label="Total" value={ordenes.length} icon="chart" />
            <MiniStat label="Entregados" value={ordenes.filter(o=>o.estado==='entregada').length} icon="check" />
            <MiniStat label="Activos" value={activas.length} icon="clock" />
          </div>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="animate-slide-up" style={{ animationDelay: '350ms' }}>
        <h3 className="font-bold text-gray-900 mb-3">Acciones rápidas</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
          <QuickAction icon="plus"   titulo="Nuevo pedido"  sub="Pedir cadete ahora" tint="green"  onClick={() => setPage('pedido')}    idx={0} primary />
          <QuickAction icon="users"  titulo="Clientes"      sub="Gestioná clientes"  tint="violet" onClick={() => setPage('clientes')}  idx={1} />
          <QuickAction icon="list"   titulo="Pedidos"       sub="Ver historial"      tint="blue"   onClick={() => setPage('historial')} idx={2} />
          <QuickAction icon="wallet" titulo="Saldo y plan"   sub="Estado de cuenta"   tint="amber"  onClick={() => setPage('saldo')}     idx={3} />
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
  violet: { bg: 'bg-violet-50', icon: 'bg-violet-100', text: 'text-violet-700',stroke: '#7C3AED' },
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
        <div className={`w-11 h-11 rounded-xl ${t.icon} ${t.text} flex items-center justify-center transition-transform duration-200 hover:scale-110`}>
          <Icon name={icon} className="w-5 h-5" />
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

function PedidoActivo({ orden, cadete }) {
  const cfg = ESTADO_CONFIG[orden.estado] ?? ESTADO_CONFIG.pendiente;
  const pasos = [
    { key: 'pendiente', label: 'Pedido creado' },
    { key: 'asignada', label: 'Cadete asignado' },
    { key: 'en_camino', label: 'En camino' },
    { key: 'entregada', label: 'Entregado' },
  ];
  const avance = { pendiente: 1, asignada: 2, en_camino: 3, entregada: 4 }[orden.estado] ?? 1;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-400">#{orden.id?.slice(0, 6)?.toUpperCase() ?? 'NUEVO'}</p>
            <p className="truncate text-lg font-extrabold text-gray-900">{orden.cliente_nombre ?? orden.descripcion ?? 'Pedido activo'}</p>
            <p className="mt-1 text-sm text-gray-500">{orden.direccion ?? orden.destino ?? orden.zona_label ?? 'Dirección pendiente'}</p>
          </div>
          <span className={`badge ${cfg.chip} shrink-0`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-3">
            <p className="text-xs text-gray-400">Monto</p>
            <p className="text-lg font-extrabold text-gray-900">${fmt(orden.precio)}</p>
          </div>
          <div className="rounded-xl bg-white p-3">
            <p className="text-xs text-gray-400">Cadete</p>
            <p className="truncate text-sm font-bold text-gray-900">{cadete?.nombre ?? 'Buscando disponible'}</p>
            {cadete?.telefono
              ? <a href={`tel:${cadete.telefono}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700">
                  <Icon name="phone" className="w-3.5 h-3.5" /> Llamar
                </a>
              : <p className="text-xs text-gray-400">Sin asignar</p>}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {pasos.map((paso, index) => {
          const done = index + 1 <= avance;
          return (
            <div key={paso.key} className="flex items-center gap-3 text-sm">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {done ? '✓' : index + 1}
              </span>
              <span className={done ? 'font-semibold text-gray-800' : 'text-gray-400'}>{paso.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center hover:bg-gray-100 transition-colors cursor-default">
      {icon && <span className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm"><Icon name={icon} className="w-4 h-4" /></span>}
      <p className="text-xl font-extrabold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

function QuickAction({ icon, titulo, sub, tint, onClick, idx = 0, primary = false }) {
  const t = TINT_MAP[tint] ?? TINT_MAP.green;
  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${idx * 60}ms` }}
      className={[
        'rounded-2xl p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lift active:scale-95 group animate-slide-up',
        primary ? 'bg-green-600 text-white border border-green-600 sm:col-span-2' : 'bg-white border border-gray-100 hover:border-gray-200',
      ].join(' ')}
    >
      <div className={`w-11 h-11 rounded-xl ${primary ? 'bg-white/15 text-white' : `${t.icon} ${t.text}`} flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-110`}>
        <Icon name={icon} className="w-5 h-5" />
      </div>
      <p className={`font-bold text-sm ${primary ? 'text-white' : 'text-gray-800'}`}>{titulo}</p>
      <p className={`text-xs mt-0.5 ${primary ? 'text-green-100' : 'text-gray-400'}`}>{sub}</p>
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
  if (!ordenes.length) return <Empty texto="Sin pedidos" icon="box" />;
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
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400">
      {icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 text-gray-300">
          <Icon name={icon} className="w-6 h-6" />
        </span>
      )}
      <p className="text-sm">{texto}</p>
    </div>
  );
}

const PLAN_INFO = {
  sin_plan: { label: 'Sin plan',     precio: 0,       periodo: '',     desc: 'Todavía no tenés un plan activo' },
  diario:   { label: 'Plan Diario',  precio: 4000,    periodo: '/día', desc: 'Ideal para probar el servicio' },
  mensual:  { label: 'Plan Mensual', precio: 90000,   periodo: '/mes', desc: 'El más elegido por comercios' },
  anual:    { label: 'Plan Anual',   precio: 1300000, periodo: '/año', desc: 'El mejor precio por envío' },
};

function SaldoView({ comercio, ordenes, nombre }) {
  const plan   = PLAN_INFO[comercio?.plan ?? 'sin_plan'] ?? PLAN_INFO.sin_plan;
  const activo = comercio?.activo ?? false;
  const mesStr = new Date().toISOString().slice(0, 7);
  const entregadas    = ordenes.filter(o => o.estado === 'entregada');
  const entregadasMes = entregadas.filter(o => (o.entregada_en ?? o.creado_en ?? '').startsWith(mesStr));
  const gastoMes   = entregadasMes.reduce((s, o) => s + (Number(o.precio) || 0), 0);
  const gastoTotal = entregadas.reduce((s, o) => s + (Number(o.precio) || 0), 0);

  return (
    <div className="space-y-5">
      {/* Plan actual */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-green-600 to-emerald-600 p-6 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-green-100">Plan actual</p>
            <p className="mt-0.5 text-2xl font-extrabold">{plan.label}</p>
            <p className="mt-1 text-sm text-green-100">{plan.desc}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${activo ? 'bg-white/20' : 'bg-red-500/80'}`}>
            {activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>
        {plan.precio > 0 && (
          <p className="mt-4 text-3xl font-extrabold">
            ${plan.precio.toLocaleString('es-AR')}<span className="text-base font-semibold text-green-100">{plan.periodo}</span>
          </p>
        )}
      </div>

      {/* Métricas reales */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50 text-green-600"><Icon name="box" className="w-5 h-5" /></span>
          <p className="mt-3 text-2xl font-extrabold text-gray-900">{entregadasMes.length}</p>
          <p className="text-xs text-gray-400">Envíos este mes</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Icon name="wallet" className="w-5 h-5" /></span>
          <p className="mt-3 text-2xl font-extrabold text-gray-900">${gastoMes.toLocaleString('es-AR')}</p>
          <p className="text-xs text-gray-400">Gastado este mes</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon name="chart" className="w-5 h-5" /></span>
          <p className="mt-3 text-2xl font-extrabold text-gray-900">${gastoTotal.toLocaleString('es-AR')}</p>
          <p className="text-xs text-gray-400">Gastado histórico</p>
        </div>
      </div>

      {/* Detalle del abono */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 font-bold text-gray-900">Detalle del abono</h3>
        <dl className="divide-y divide-gray-50 text-sm">
          <SaldoRow k="Plan"     v={plan.label} />
          <SaldoRow k="Abono"    v={plan.precio > 0 ? `$${plan.precio.toLocaleString('es-AR')} ${plan.periodo}` : 'Sin abono'} />
          <SaldoRow k="Estado"   v={activo ? 'Al día' : 'Suspendido'} highlight={activo ? 'green' : 'red'} />
          <SaldoRow k="Comercio" v={nombre} />
        </dl>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3">
          <Icon name="clock" className="w-5 h-5 shrink-0 text-amber-500" />
          <p className="text-xs text-amber-700">El cobro del abono se coordina con Yendo. Para cambiar de plan o consultar pagos, escribinos.</p>
        </div>
      </div>
    </div>
  );
}

function SaldoRow({ k, v, highlight }) {
  const c = highlight === 'green' ? 'text-green-600' : highlight === 'red' ? 'text-red-500' : 'text-gray-900';
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-gray-400">{k}</dt>
      <dd className={`font-semibold ${c}`}>{v}</dd>
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
