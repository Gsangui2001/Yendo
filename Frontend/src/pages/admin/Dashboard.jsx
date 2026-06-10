import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase, supabaseConfig } from '../../lib/supabaseClient';
const AdminMap = lazy(() => import('../../features/tracking/AdminMap').then(m => ({ default: m.AdminMap })));
import { createClient } from '@supabase/supabase-js';
import { apiFetch, readApiError } from '../../lib/api';
import { useToast, useConfirm } from '../../components/ui/feedback';
import { Icon } from '../../components/ui/Icon';

// Cliente secundario para crear usuarios sin afectar la sesión del admin
const sbAdmin = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

export default function AdminApp({ perfil, page, setPage }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [ordenes,   setOrdenes]   = useState([]);
  const [cadetes,   setCadetes]   = useState([]);
  const [comercios, setComercios] = useState([]);
  const [zonas,     setZonas]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [planTarget, setPlanTarget] = useState(null);

  useEffect(() => { cargarTodo(); }, []);

  useEffect(() => {
    const ch = supabase.channel('admin-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, cargarOrdenes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cadetes' }, cargarCadetes)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function cargarTodo() {
    setLoading(true);
    await Promise.all([cargarOrdenes(), cargarCadetes(), cargarComercios(), cargarZonas()]);
    setLoading(false);
  }
  async function cargarOrdenes()  { const { data } = await supabase.from('ordenes').select('*').order('creado_en', { ascending: false }).limit(100); setOrdenes(data ?? []); }
  async function cargarCadetes()  { const { data } = await supabase.from('cadetes').select('*').order('nombre'); setCadetes(data ?? []); }
  async function cargarComercios(){ const { data } = await supabase.from('comercios').select('*').order('nombre'); setComercios(data ?? []); }
  async function cargarZonas()    { const { data } = await supabase.from('zonas').select('*').order('orden'); setZonas(data ?? []); }

  async function cambiarEstadoOrden(id, estado) {
    try {
      const res = await apiFetch(`/api/admin/ordenes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) { toast.error(await readApiError(res)); return; }
    } catch {
      toast.error('No se pudo actualizar el pedido. Revisá tu conexión.');
    } finally {
      cargarOrdenes();
    }
  }
  async function cambiarEstadoCadete(id, estado) {
    try {
      const res = await apiFetch(`/api/admin/cadetes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) { toast.error(await readApiError(res)); return; }
    } catch {
      toast.error('No se pudo actualizar el cadete. Revisá tu conexión.');
    } finally {
      cargarCadetes();
    }
  }

  // Abre el modal de cambio de plan (reemplaza el prompt nativo)
  function cambiarPlan(comercio) {
    setPlanTarget(comercio);
  }
  async function guardarPlan(comercioId, plan) {
    try {
      const res = await apiFetch(`/api/admin/comercios/${comercioId}`, {
        method: 'PATCH',
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) { toast.error(await readApiError(res)); return; }
      setPlanTarget(null);
      await cargarComercios();
      toast.success('Plan actualizado');
    } catch {
      toast.error('No se pudo cambiar el plan. Revisá tu conexión.');
    }
  }

  if (loading) return <Spinner />;

  const hoy        = new Date().toISOString().slice(0, 10);
  const pedidosHoy = ordenes.filter(o => o.creado_en?.startsWith(hoy));
  const pendientes = ordenes.filter(o => o.estado === 'pendiente');
  const activos    = cadetes.filter(c => ['disponible','en_viaje'].includes(c.estado));
  const entregadas = ordenes.filter(o => o.estado === 'entregada');
  const facturadoTotal = entregadas.reduce((s, o) => s + (Number(o.precio) || 0), 0);
  const gananciaYendo = entregadas.reduce((s, o) => s + (Number(o.ganancia_yendo) || ((Number(o.precio) || 0) * 0.18)), 0);
  const gananciaCadetes = entregadas.reduce((s, o) => s + (Number(o.ganancia_cadete) || ((Number(o.precio) || 0) * 0.82)), 0);
  const ingresosPlanes = comercios.reduce((s, c) => {
    const plan = c.plan ?? 'sin_plan';
    if (plan === 'diario') return s + 4000;
    if (plan === 'mensual') return s + 90000;
    if (plan === 'anual') return s + 1300000;
    return s;
  }, 0);

  // ── CADETES ───────────────────────────────────────────────────────────────
  if (page === 'cadetes') {
    const disp   = cadetes.filter(c => c.estado === 'disponible');
    const ruta   = cadetes.filter(c => c.estado === 'en_viaje');
    const off    = cadetes.filter(c => c.estado === 'offline');
    const viajesHoy = cadetes.reduce((s, c) => s + (c.viajes_hoy ?? 0), 0);
    return (
      <div className="space-y-6 animate-fade-in">
        <AdminHeader perfil={perfil} titulo="Cadetes" sub="Gestioná y monitoreá a los cadetes en tiempo real"
          accion={<button onClick={() => setPage('nuevo-cadete')} className="btn-primary px-4 py-2.5 text-sm ripple">+ Agregar cadete</button>} />

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard2 icon="bike"     tint="green"  label="Activos"       value={disp.length + ruta.length} delta="cadetes" up />
          <StatCard2 icon="check"    tint="green"  label="Disponibles"   value={disp.length}               delta="online" up />
          <StatCard2 icon="navigate" tint="blue"   label="En ruta"       value={ruta.length}               delta="entregando" />
          <StatCard2 icon="power"    tint="gray"   label="Desconectados" value={off.length}                delta="offline" />
          <StatCard2 icon="box"      tint="violet" label="Viajes hoy"    value={viajesHoy}                 delta="entregas del día" up />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Tabla conectados */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">Cadetes conectados</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                  <th className="text-left pb-3 pr-4">Cadete</th><th className="text-left pb-3 pr-4">Estado</th>
                  <th className="text-left pb-3 pr-4">Zona</th><th className="text-left pb-3 pr-4">Ganancias</th>
                  <th className="text-left pb-3 pr-4 hidden sm:table-cell">Viajes</th><th className="text-left pb-3">Acción</th>
                </tr></thead>
                <tbody>
                  {cadetes.map((c, i) => (
                    <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="py-3 pr-4"><div className="flex items-center gap-3"><Avatar nombre={c.nombre} /><span className="font-semibold text-gray-800">{c.nombre}</span></div></td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${c.estado==='disponible'?'text-green-600':c.estado==='en_viaje'?'text-blue-600':'text-gray-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.estado==='disponible'?'bg-green-500':c.estado==='en_viaje'?'bg-blue-500':'bg-gray-300'}`}/>
                          {c.estado==='disponible'?'Disponible':c.estado==='en_viaje'?'En ruta':'Desconectado'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-500 capitalize">{c.zona ? String(c.zona).replace(/_/g, ' ') : '—'}</td>
                      <td className="py-3 pr-4 font-bold text-green-600">${(c.ganancias_hoy ?? 0).toLocaleString('es-AR')}</td>
                      <td className="py-3 pr-4 text-gray-500 hidden sm:table-cell">{c.viajes_hoy ?? 0}</td>
                      <td className="py-3">
                        {c.estado !== 'en_viaje' && (
                          <button onClick={() => cambiarEstadoCadete(c.id, c.estado==='disponible'?'offline':'disponible')}
                            className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${c.estado==='disponible'?'bg-gray-100 text-gray-600 hover:bg-gray-200':'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                            {c.estado==='disponible'?'Offline':'Activar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {cadetes.length === 0 && <tr><td colSpan={6}><Empty texto="Sin cadetes registrados" /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mapa en tiempo real */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">Mapa en tiempo real</h3>
            <Suspense fallback={<div className="h-64 flex items-center justify-center text-gray-400 text-sm">Cargando mapa...</div>}>
              <AdminMap cadetes={cadetes} ordenes={ordenes} />
            </Suspense>
          </div>
        </div>

        {/* Rendimiento + Top */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">Rendimiento del día</h3>
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Viajes" value={cadetes.reduce((s,c)=>s+(c.viajes_hoy??0),0)} />
              <MiniStat label="Ganancias" value={`$${cadetes.reduce((s,c)=>s+(Number(c.ganancias_hoy)||0),0).toLocaleString('es-AR')}`} />
              <MiniStat label="Activos" value={disp.length+ruta.length} />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">Top cadetes</h3>
            <div className="space-y-3">
              {[...cadetes].sort((a,b)=>(b.viajes_hoy??0)-(a.viajes_hoy??0)).slice(0,3).map((c,i) => (
                <div key={c.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i===0?'bg-amber-100 text-amber-600':i===1?'bg-gray-100 text-gray-500':'bg-orange-100 text-orange-600'}`}>{i+1}</span>
                    <span className="font-semibold text-sm text-gray-800">{c.nombre}</span>
                  </div>
                  <div className="text-right"><p className="text-sm font-bold text-green-600">${(c.ganancias_hoy??0).toLocaleString('es-AR')}</p><p className="text-xs text-gray-400">{c.viajes_hoy??0} viajes</p></div>
                </div>
              ))}
              {cadetes.length === 0 && <p className="text-sm text-gray-400">Sin datos</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── NUEVO CADETE ──────────────────────────────────────────────────────────
  if (page === 'nuevo-cadete') return (
    <NuevoCadete zonas={zonas} onSuccess={() => { cargarCadetes(); setPage('cadetes'); }} onCancel={() => setPage('cadetes')} />
  );

  // ── COMERCIOS ─────────────────────────────────────────────────────────────
  if (page === 'comercios') {
    const activosC = comercios.filter(c => c.activo);
    const conPlan = comercios.filter(c => c.plan && c.plan !== 'sin_plan').length;
    return (
    <div className="space-y-6">
      <AdminHeader perfil={perfil} titulo="Comercios" sub="Gestioná y monitoreá todos los comercios asociados a Yendo"
        accion={<button onClick={() => setPage('nuevo-comercio')} className="btn-primary px-4 py-2.5 text-sm ripple">+ Agregar comercio</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard2 icon="store"  tint="green"  label="Comercios activos" value={activosC.length} delta="activos" up />
        <StatCard2 icon="box"    tint="blue"   label="Pedidos totales"   value={ordenes.filter(o=>o.tipo==='comercio').length} delta="histórico" up />
        <StatCard2 icon="wallet" tint="violet" label="Con plan" value={conPlan} delta="suscriptos" up />
        <StatCard2 icon="clock"  tint="amber"  label="Inactivos"         value={comercios.filter(c=>!c.activo).length} delta="sin actividad" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {comercios.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center"><Icon name="store" className="w-5 h-5" /></div>
                <div>
                  <p className="font-semibold text-gray-900">{c.nombre}</p>
                  {c.categoria && <p className="text-xs text-gray-400">{c.categoria}</p>}
                  {c.direccion && <p className="text-xs text-gray-400">{c.direccion}</p>}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {c.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            {/* Plan de suscripción */}
            <div className="bg-gray-50 rounded-xl p-3 mb-3">
              <p className="text-xs text-gray-400">Plan de suscripción</p>
              <p className="text-lg font-bold text-green-600 capitalize">{(c.plan && c.plan !== 'sin_plan') ? c.plan : 'Sin plan'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => cambiarPlan(c)}
                className="flex-1 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-100">
                Cambiar plan
              </button>
              <button onClick={async () => {
                  try {
                    const res = await apiFetch(`/api/admin/comercios/${c.id}`, { method: 'PATCH', body: JSON.stringify({ activo: !c.activo }) });
                    if (!res.ok) { toast.error(await readApiError(res)); return; }
                    cargarComercios();
                    toast.success(c.activo ? 'Comercio desactivado' : 'Comercio activado');
                  } catch { toast.error('No se pudo actualizar el comercio. Revisá tu conexión.'); }
                }}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50">
                {c.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
        {comercios.length === 0 && <Empty texto="Sin comercios registrados" />}
      </div>

      {planTarget && <PlanModal comercio={planTarget} onClose={() => setPlanTarget(null)} onSave={guardarPlan} />}
    </div>
    );
  }

  // ── NUEVO COMERCIO ────────────────────────────────────────────────────────
  if (page === 'nuevo-comercio') return (
    <NuevoComercio onSuccess={() => { cargarComercios(); setPage('comercios'); }} onCancel={() => setPage('comercios')} />
  );

  // ── FINANZAS ──────────────────────────────────────────────────────────────
  if (page === 'finanzas') return (
    <Finanzas perfil={perfil} ordenes={ordenes} cadetes={cadetes} comercios={comercios} />
  );

  // ── PRECIOS ───────────────────────────────────────────────────────────────
  if (page === 'precios') return (
    <TablaPrecios perfil={perfil} zonas={zonas} onUpdate={cargarZonas} />
  );

  // ── PEDIDOS ───────────────────────────────────────────────────────────────
  if (page === 'pedidos') return (
    <div className="space-y-6">
      <AdminHeader perfil={perfil} titulo="Pedidos" sub="Todos los pedidos de la plataforma en tiempo real" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard2 icon="box"    tint="green"  label="Pedidos hoy" value={pedidosHoy.length} delta="hoy" up />
        <StatCard2 icon="clock"  tint="amber"  label="Pendientes"  value={pendientes.length} delta="sin cadete" />
        <StatCard2 icon="check"  tint="green"  label="Entregados"  value={ordenes.filter(o=>o.estado==='entregada').length} delta="histórico" up />
        <StatCard2 icon="wallet" tint="blue"   label="Facturado"   value={`$${ordenes.filter(o=>o.estado==='entregada').reduce((s,o)=>s+(Number(o.precio)||0),0).toLocaleString('es-AR')}`} delta="entregados" up />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase hidden sm:table-cell">Zona</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Precio</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.slice(0, 50).map(o => (
                <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-800">{o.cliente_nombre ?? 'Particular'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{o.zona_label ?? o.descripcion ?? '—'}</td>
                  <td className="px-4 py-3 font-bold">${(o.precio ?? 0).toLocaleString('es-AR')}</td>
                  <td className="px-4 py-3">
                    <select value={o.estado} onChange={e => cambiarEstadoOrden(o.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-full font-semibold border-0 cursor-pointer ${ESTADO_CHIP[o.estado]}`}>
                      {Object.entries(ESTADO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── INICIO ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <AdminHeader perfil={perfil} titulo="Panel de administración" sub={new Date().toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' })} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard2 icon="box"    tint="green"  label="Pedidos hoy"      value={pedidosHoy.length} delta={`${pedidosHoy.length} hoy`} up />
        <StatCard2 icon="clock"  tint="amber"  label="Pendientes"       value={pendientes.length} delta="sin cadete" />
        <StatCard2 icon="money"  tint="green"  label="Yendo 18%"        value={`$${Math.round(gananciaYendo).toLocaleString('es-AR')}`} delta="envíos entregados" up />
        <StatCard2 icon="store"  tint="violet" label="Planes comercios" value={`$${ingresosPlanes.toLocaleString('es-AR')}`}  delta="día/mes/año" up />
      </div>

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
                <p className="text-xs text-gray-400">{Math.floor((Date.now() - new Date(o.creado_en)) / 60000)} min</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-[1.3fr_0.7fr] gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Mapa operativo</h3>
              <p className="text-xs text-gray-400">Cadetes y pedidos activos en tiempo real</p>
            </div>
            <button onClick={() => setPage('cadetes')} className="text-xs text-green-600 font-semibold">Abrir cadetes</button>
          </div>
          <Suspense fallback={<div className="h-80 flex items-center justify-center text-gray-400 text-sm">Cargando mapa...</div>}>
            <AdminMap cadetes={cadetes} ordenes={ordenes} />
          </Suspense>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold mb-4">Finanzas de control</h3>
          <div className="space-y-3">
            <MiniStat label="Facturado en envíos" value={`$${Math.round(facturadoTotal).toLocaleString('es-AR')}`} />
            <MiniStat label="Yendo por envíos (18%)" value={`$${Math.round(gananciaYendo).toLocaleString('es-AR')}`} />
            <MiniStat label="Cadetes (82%)" value={`$${Math.round(gananciaCadetes).toLocaleString('es-AR')}`} />
            <MiniStat label="Planes comercios" value={`$${ingresosPlanes.toLocaleString('es-AR')}`} />
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">Cadetes</h3>
            <button onClick={() => setPage('cadetes')} className="text-xs text-green-600 font-semibold">Ver todos →</button>
          </div>
          <div className="space-y-2">
            {cadetes.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${c.estado === 'disponible' ? 'bg-green-500' : c.estado === 'en_viaje' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <span className="text-sm font-medium">{c.nombre}</span>
                </div>
                <span className="text-xs text-gray-400">{c.estado}</span>
              </div>
            ))}
            {cadetes.length === 0 && <p className="text-sm text-gray-400">Sin cadetes</p>}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">Últimos pedidos</h3>
            <button onClick={() => setPage('pedidos')} className="text-xs text-green-600 font-semibold">Ver todos →</button>
          </div>
          <div className="space-y-2">
            {ordenes.slice(0, 5).map(o => (
              <div key={o.id} className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold">{o.cliente_nombre ?? 'Particular'}</p>
                  <p className="text-xs text-gray-400">{o.zona_label ?? o.descripcion ?? '—'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ESTADO_CHIP[o.estado]}`}>{ESTADO_LABEL[o.estado]}</span>
              </div>
            ))}
            {ordenes.length === 0 && <p className="text-sm text-gray-400">Sin pedidos</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FORMULARIO NUEVO CADETE ───────────────────────────────────────────────────
function NuevoCadete({ zonas, onSuccess, onCancel }) {
  const [form, setForm]     = useState({ nombre: '', email: '', password: '', telefono: '', zona: 'ciudad_colon' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [exito, setExito]   = useState(null);

  function f(name) { return { value: form[name], onChange: e => { setForm(p => ({...p, [name]: e.target.value})); setError(''); } }; }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return setError('Ingresá el nombre');
    if (!form.email.trim())  return setError('Ingresá el email');
    if (form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
    setLoading(true);
    try {
      // Crear cuenta (sin afectar sesión del admin)
      const { data, error: authErr } = await sbAdmin.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { nombre: form.nombre.trim(), perfil: 'cadete' } }
      });
      if (authErr) throw new Error(authErr.message);

      // Actualizar datos extra del cadete
      if (data.user) {
        await apiFetch(`/api/admin/cadetes/${data.user.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ telefono: form.telefono.trim(), zona: form.zona }),
        });
      }
      setExito({ email: form.email, password: form.password });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (exito) return (
    <div className="max-w-md mx-auto">
      <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-600"><Icon name="check" className="w-7 h-7" /></div>
        <h3 className="font-bold text-lg text-green-800 mb-2">Cadete registrado</h3>
        <p className="text-sm text-green-700 mb-4">Compartí estas credenciales con el cadete:</p>
        <div className="bg-white rounded-xl p-4 text-left space-y-2 border border-green-200">
          <p className="text-sm"><span className="font-semibold">Email:</span> {exito.email}</p>
          <p className="text-sm"><span className="font-semibold">Contraseña:</span> {exito.password}</p>
          <p className="text-xs text-gray-400 mt-2">Pueden cambiar la contraseña desde su perfil.</p>
        </div>
        <button onClick={onSuccess} className="mt-4 w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700">
          Listo
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">←</button>
        <h2 className="text-xl font-bold">Agregar cadete</h2>
      </div>
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <Campo label="Nombre completo *" placeholder="Juan García"    {...f('nombre')} />
        <Campo label="Email *"           placeholder="juan@email.com" {...f('email')} type="email" />
        <Campo label="Contraseña *"      placeholder="Mínimo 6 caracteres" {...f('password')} type="password" />
        <Campo label="Teléfono"          placeholder="+54 9 11 ..."   {...f('telefono')} />
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Zona habitual</label>
          <select value={form.zona} onChange={e => setForm(p => ({...p, zona: e.target.value}))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            {zonas.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
          </select>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancel} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={loading} className="flex-[2] py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-60">
            {loading ? 'Creando...' : 'Crear cadete'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── FORMULARIO NUEVO COMERCIO ─────────────────────────────────────────────────
const CATEGORIAS = ['Comidas', 'Pizzería', 'Farmacia', 'Minimarket', 'Sushi', 'Cafetería', 'Otro'];

const PLANES = [
  { value: 'sin_plan', label: 'Sin plan' },
  { value: 'diario',   label: 'Diario' },
  { value: 'mensual',  label: 'Mensual' },
  { value: 'anual',    label: 'Anual' },
];

function NuevoComercio({ onSuccess, onCancel }) {
  const [form, setForm]     = useState({ nombre: '', email: '', password: '', telefono: '', direccion: '', categoria: 'Comidas', plan: 'sin_plan' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [exito, setExito]   = useState(null);

  function f(name) { return { value: form[name], onChange: e => { setForm(p => ({...p, [name]: e.target.value})); setError(''); } }; }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return setError('Ingresá el nombre del comercio');
    if (!form.email.trim())  return setError('Ingresá el email');
    if (form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
    setLoading(true);
    try {
      const { data, error: authErr } = await sbAdmin.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: { nombre: form.nombre.trim(), perfil: 'comercio' } }
      });
      if (authErr) throw new Error(authErr.message);

      if (data.user) {
        await apiFetch(`/api/admin/comercios/owner/${data.user.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            telefono:  form.telefono.trim(),
            direccion: form.direccion.trim(),
            categoria: form.categoria,
            plan:      form.plan,
          }),
        });
      }
      setExito({ email: form.email, password: form.password, plan: form.plan });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (exito) return (
    <div className="max-w-md mx-auto">
      <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-600"><Icon name="check" className="w-7 h-7" /></div>
        <h3 className="font-bold text-lg text-green-800 mb-2">Comercio registrado</h3>
        <p className="text-sm text-green-700 mb-4">Compartí estas credenciales con el comercio:</p>
        <div className="bg-white rounded-xl p-4 text-left space-y-2 border border-green-200">
          <p className="text-sm"><span className="font-semibold">Email:</span> {exito.email}</p>
          <p className="text-sm"><span className="font-semibold">Contraseña:</span> {exito.password}</p>
          <p className="text-sm"><span className="font-semibold">Plan:</span> {PLANES.find(p => p.value === exito.plan)?.label ?? 'Sin plan'}</p>
        </div>
        <button onClick={onSuccess} className="mt-4 w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700">Listo</button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">←</button>
        <h2 className="text-xl font-bold">Agregar comercio</h2>
      </div>
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <Campo label="Nombre del comercio *" placeholder="Burger Queen"     {...f('nombre')} />
        <Campo label="Email *"               placeholder="comercio@email.com" {...f('email')} type="email" />
        <Campo label="Contraseña *"          placeholder="Mínimo 6 caracteres" {...f('password')} type="password" />
        <Campo label="Teléfono"              placeholder="+54 9 11 ..."       {...f('telefono')} />
        <Campo label="Dirección"             placeholder="Av. San Martín 123" {...f('direccion')} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Categoría</label>
            <select value={form.categoria} onChange={e => setForm(p => ({...p, categoria: e.target.value}))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Plan de suscripción</label>
            <select value={form.plan} onChange={e => setForm(p => ({...p, plan: e.target.value}))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              {PLANES.map(pl => <option key={pl.value} value={pl.value}>{pl.label}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-400 -mt-2">El plan define cómo se le cobra al comercio (diario / mensual / anual).</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancel} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={loading} className="flex-[2] py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-60">
            {loading ? 'Creando...' : 'Crear comercio'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── PRECIOS Y TARIFAS ─────────────────────────────────────────────────────────
function TablaPrecios({ perfil, zonas, onUpdate }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab]          = useState('zona'); // zona | especiales | cargos
  const [editId, setEditId]    = useState(null);
  const [editData, setEditData]= useState({});
  const [saving, setSaving]    = useState(false);
  const [showNueva, setShowNueva] = useState(false);
  const [nueva, setNueva]      = useState({ label: '', precio: '', precio_km: '', tiempo: '15 - 25 min' });
  const [error, setError]      = useState('');

  // Calculadora
  const [calcZona, setCalcZona] = useState('');
  const [calcKm,   setCalcKm]   = useState(3.2);
  const zonaCalc = zonas.find(z => z.id === calcZona) ?? zonas[0];
  const precioBase  = Number(zonaCalc?.precio) || 0;
  const precioKm    = Number(zonaCalc?.precio_km) || 0;
  const extra       = Math.round(precioKm * calcKm);
  const totalCalc   = precioBase + extra;

  function empezarEdicion(z) { setEditId(z.id); setEditData({ precio: z.precio, precio_km: z.precio_km ?? 0, tiempo: z.tiempo ?? '' }); }
  async function guardarEdicion(z) {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/admin/zonas/${z.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ precio: parseFloat(editData.precio) || 0, precio_km: parseFloat(editData.precio_km) || 0, tiempo: editData.tiempo }),
      });
      if (!res.ok) { toast.error(await readApiError(res)); return; }
      setEditId(null); onUpdate();
      toast.success('Zona actualizada');
    } catch {
      toast.error('No se pudo guardar la zona. Revisá tu conexión.');
    } finally {
      setSaving(false);
    }
  }
  async function toggleActivo(z) {
    try {
      const res = await apiFetch(`/api/admin/zonas/${z.id}`, { method: 'PATCH', body: JSON.stringify({ activo: !z.activo }) });
      if (!res.ok) { toast.error(await readApiError(res)); return; }
      onUpdate();
    } catch { toast.error('No se pudo actualizar la zona. Revisá tu conexión.'); }
  }
  async function eliminarZona(id) {
    const ok = await confirm({ title: 'Eliminar zona', message: 'Se va a eliminar esta tarifa de zona.', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/admin/zonas/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readApiError(res)); return; }
      onUpdate();
      toast.success('Zona eliminada');
    } catch { toast.error('No se pudo eliminar la zona. Revisá tu conexión.'); }
  }
  async function agregarZona(e) {
    e.preventDefault(); setError('');
    if (!nueva.label.trim()) return setError('Ingresá el nombre de la zona');
    if (!nueva.precio || isNaN(nueva.precio)) return setError('Ingresá un precio base válido');
    const value = nueva.label.toLowerCase().replace(/\s+/g, '_').replace(/[áéíóú]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'})[c] ?? c);
    setSaving(true);
    const res = await apiFetch('/api/admin/zonas', {
      method: 'POST',
      body: JSON.stringify({ label: nueva.label.trim(), value, precio: parseFloat(nueva.precio), precio_km: parseFloat(nueva.precio_km) || 0, tiempo: nueva.tiempo, orden: zonas.length + 1 }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'No se pudo crear la zona');
    }
    else { setNueva({ label: '', precio: '', precio_km: '', tiempo: '15 - 25 min' }); setShowNueva(false); onUpdate(); }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <AdminHeader perfil={perfil} titulo="Precios y Tarifas" sub="Configurá las tarifas de envío y otros cargos de la plataforma"
        accion={<button onClick={() => setShowNueva(true)} className="btn-primary px-4 py-2.5 text-sm ripple">+ Nueva tarifa</button>} />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[['zona','Tarifas por zona'],['especiales','Tarifas especiales'],['cargos','Cargos adicionales']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab===k?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'zona' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Tabla */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100"><tr>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Zona</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Precio base</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase hidden sm:table-cell">Precio/km</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase hidden md:table-cell">Tiempo est.</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr></thead>
                <tbody>
                  {zonas.map(z => editId === z.id ? (
                    <tr key={z.id} className="border-b border-gray-50 bg-green-50/40">
                      <td className="px-4 py-3 font-semibold text-gray-800">{z.label}</td>
                      <td className="px-4 py-2"><input type="number" value={editData.precio} onChange={e=>setEditData(d=>({...d,precio:e.target.value}))} className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm"/></td>
                      <td className="px-4 py-2 hidden sm:table-cell"><input type="number" value={editData.precio_km} onChange={e=>setEditData(d=>({...d,precio_km:e.target.value}))} className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm"/></td>
                      <td className="px-4 py-2 hidden md:table-cell"><input value={editData.tiempo} onChange={e=>setEditData(d=>({...d,tiempo:e.target.value}))} className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm"/></td>
                      <td className="px-4 py-3" colSpan={2}>
                        <div className="flex gap-2">
                          <button onClick={()=>guardarEdicion(z)} disabled={saving} className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg font-semibold">{saving?'...':'Guardar'}</button>
                          <button onClick={()=>setEditId(null)} className="text-xs text-gray-400 px-2">Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={z.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-800">{z.label}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">${(Number(z.precio)||0).toLocaleString('es-AR')}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">${(Number(z.precio_km)||0).toLocaleString('es-AR')}/km</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{z.tiempo ?? '—'}</td>
                      <td className="px-4 py-3"><button onClick={()=>toggleActivo(z)} className={`text-xs px-2.5 py-1 rounded-full font-semibold ${z.activo?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>{z.activo?'Activo':'Inactivo'}</button></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-3 justify-end">
                        <button onClick={()=>empezarEdicion(z)} className="text-xs text-blue-500 hover:underline font-medium">Editar</button>
                        <button onClick={()=>eliminarZona(z.id)} className="text-xs text-red-400 hover:underline font-medium">×</button>
                      </div></td>
                    </tr>
                  ))}
                  {zonas.length === 0 && <tr><td colSpan={6}><Empty texto="Sin zonas configuradas" /></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="bg-blue-50 border-t border-blue-100 px-4 py-3 flex items-start gap-2">
              <span className="text-blue-500">ℹ️</span>
              <p className="text-xs text-blue-700">Las tarifas se actualizan automáticamente para los usuarios. Los cambios pueden tardar hasta 5 minutos en reflejarse.</p>
            </div>
          </div>

          {/* Calculadora */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 h-fit">
            <h3 className="font-bold text-gray-900 mb-4">Calculadora de tarifa</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Zona</label>
                <select value={calcZona} onChange={e=>setCalcZona(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  {zonas.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                </select>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1.5"><span className="font-semibold text-gray-700">Distancia (km)</span><span className="font-bold text-green-600">{calcKm} km</span></div>
                <input type="range" min="0" max="15" step="0.1" value={calcKm} onChange={e=>setCalcKm(parseFloat(e.target.value))} className="w-full accent-green-600"/>
              </div>
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Precio base</span><span className="font-semibold">${precioBase.toLocaleString('es-AR')}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Extra por distancia ({calcKm} km)</span><span className="font-semibold">${extra.toLocaleString('es-AR')}</span></div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-100"><span className="font-bold text-gray-900">Total</span><span className="text-2xl font-extrabold text-green-600">${totalCalc.toLocaleString('es-AR')}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'especiales' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-gray-400">Tarifas especiales (horarios pico, días festivos) — próximamente</p>
        </div>
      )}
      {tab === 'cargos' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-gray-400">Cargos adicionales (urgente, frágil, espera) — próximamente</p>
        </div>
      )}

      {showNueva && (
        <Modal titulo="Nueva tarifa por zona" onClose={() => setShowNueva(false)}>
          <form onSubmit={agregarZona} className="space-y-3">
            <Campo label="Nombre de la zona *" placeholder="Barrio Centro" value={nueva.label} onChange={e => setNueva(p => ({...p, label: e.target.value}))} />
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Precio base ($)" placeholder="5000" value={nueva.precio} onChange={e => setNueva(p => ({...p, precio: e.target.value}))} type="number" />
              <Campo label="Precio por km ($)" placeholder="400" value={nueva.precio_km} onChange={e => setNueva(p => ({...p, precio_km: e.target.value}))} type="number" />
            </div>
            <Campo label="Tiempo estimado" placeholder="15 - 25 min" value={nueva.tiempo} onChange={e => setNueva(p => ({...p, tiempo: e.target.value}))} />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowNueva(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-[2] py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-60">{saving ? 'Guardando...' : 'Agregar zona'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── FINANZAS ───────────────────────────────────────────────────────────────────
// Abonos de comercios por plan + comisión Yendo (18%) y pago a cadetes (82%)
// sobre envíos entregados. Todo calculado con datos reales de Supabase.
const PLAN_NOMINAL = { diario: 4000, mensual: 90000, anual: 1300000, sin_plan: 0 };
// Normalizado a mes para comparar planes entre sí (abono recurrente estimado).
const PLAN_MENSUAL = { diario: 4000 * 30, mensual: 90000, anual: Math.round(1300000 / 12), sin_plan: 0 };
const PLAN_NOMBRE  = { diario: 'Diario', mensual: 'Mensual', anual: 'Anual', sin_plan: 'Sin plan' };
const FEE_YENDO = 0.18;

const peso = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

function Finanzas({ perfil, ordenes, cadetes, comercios }) {
  const [periodo, setPeriodo] = useState('mes'); // hoy | mes | historico

  const hoyStr = new Date().toISOString().slice(0, 10);
  const mesStr = hoyStr.slice(0, 7);
  const fechaDe = o => o.entregada_en ?? o.creado_en ?? '';
  const enPeriodo = o => {
    if (periodo === 'hoy') return fechaDe(o).startsWith(hoyStr);
    if (periodo === 'mes') return fechaDe(o).startsWith(mesStr);
    return true;
  };

  const entregadas = ordenes.filter(o => o.estado === 'entregada' && enPeriodo(o));
  const gYendo  = o => Number(o.ganancia_yendo  ?? (Number(o.precio) || 0) * FEE_YENDO);
  const gCadete = o => Number(o.ganancia_cadete ?? (Number(o.precio) || 0) * (1 - FEE_YENDO));

  const facturacionEnvios = entregadas.reduce((s, o) => s + (Number(o.precio) || 0), 0);
  const comisionYendo     = entregadas.reduce((s, o) => s + gYendo(o), 0);
  const pagoCadetes       = entregadas.reduce((s, o) => s + gCadete(o), 0);

  // Abonos: base recurrente de comercios activos (no depende del período)
  const comerciosActivos = comercios.filter(c => c.activo);
  const planes = ['diario', 'mensual', 'anual', 'sin_plan'];
  const porPlan = planes.map(p => {
    const lista = comerciosActivos.filter(c => (c.plan ?? 'sin_plan') === p);
    return { plan: p, cantidad: lista.length, mensual: lista.length * (PLAN_MENSUAL[p] ?? 0) };
  });
  const abonoMensual = porPlan.reduce((s, p) => s + p.mensual, 0);
  const comerciosConPlan = comerciosActivos.filter(c => c.plan && c.plan !== 'sin_plan').length;

  // Ingreso total estimado de Yendo = comisión envíos (período) + abonos mensuales
  const ingresoYendo = comisionYendo + abonoMensual;

  // Pago acumulado por cadete (sobre entregadas del período)
  const porCadete = cadetes
    .map(c => {
      const suyas = entregadas.filter(o => o.cadete_id === c.id);
      return { id: c.id, nombre: c.nombre, pedidos: suyas.length, pago: suyas.reduce((s, o) => s + gCadete(o), 0) };
    })
    .filter(c => c.pedidos > 0)
    .sort((a, b) => b.pago - a.pago);

  // Facturación generada por comercio (período) + su abono mensual
  const porComercio = comercios
    .map(co => {
      const suyas = entregadas.filter(o => o.comercio_id === co.id);
      return {
        id: co.id,
        nombre: co.nombre,
        plan: co.plan ?? 'sin_plan',
        activo: co.activo,
        pedidos: suyas.length,
        facturado: suyas.reduce((s, o) => s + (Number(o.precio) || 0), 0),
      };
    })
    .sort((a, b) => b.facturado - a.facturado);

  const periodoLabel = { hoy: 'hoy', mes: 'este mes', historico: 'histórico' }[periodo];

  return (
    <div className="space-y-6 animate-fade-in">
      <AdminHeader
        perfil={perfil}
        titulo="Finanzas"
        sub="Abonos de comercios, comisión de Yendo y pagos a cadetes"
        accion={
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[['hoy', 'Hoy'], ['mes', 'Mes'], ['historico', 'Histórico']].map(([k, l]) => (
              <button key={k} onClick={() => setPeriodo(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${periodo === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {l}
              </button>
            ))}
          </div>
        }
      />

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard2 icon="money"  tint="green"  label={`Ingreso Yendo (${periodoLabel})`} value={peso(ingresoYendo)} delta="comisión + abonos" up idx={0} />
        <StatCard2 icon="wallet" tint="blue"   label="Abonos mensuales"   value={peso(abonoMensual)}     delta={`${comerciosConPlan} con plan`} up idx={1} />
        <StatCard2 icon="bike"   tint="amber"  label="Comisión envíos 18%" value={peso(comisionYendo)}   delta={`${entregadas.length} entregas`} up idx={2} />
        <StatCard2 icon="money"  tint="violet" label="A pagar a cadetes 82%" value={peso(pagoCadetes)}   delta={periodoLabel} idx={3} />
      </div>

      {/* Desglose de abonos por plan */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">Ingresos por abonos</h3>
            <p className="text-xs text-gray-400 mt-0.5">Comercios activos por plan. Normalizado a mes para comparar.</p>
          </div>
          <p className="text-2xl font-extrabold text-green-600">{peso(abonoMensual)}<span className="text-sm font-semibold text-gray-400">/mes</span></p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {porPlan.map(p => (
            <div key={p.plan} className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{PLAN_NOMBRE[p.plan]}</p>
              <p className="text-2xl font-extrabold text-gray-900 mt-1">{p.cantidad}</p>
              <p className="text-xs text-gray-400">comercios</p>
              <p className="text-sm font-bold text-green-600 mt-2">{peso(p.mensual)}<span className="text-xs text-gray-400 font-medium">/mes</span></p>
              {p.plan !== 'sin_plan' && <p className="text-[11px] text-gray-400 mt-0.5">abono {peso(PLAN_NOMINAL[p.plan])} {p.plan === 'diario' ? '/día' : p.plan === 'anual' ? '/año' : '/mes'}</p>}
            </div>
          ))}
        </div>
        <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2">
          <span className="text-blue-500">ℹ️</span>
          <p className="text-xs text-blue-700">Es el ingreso recurrente estimado por suscripciones de comercios activos. El cobro real de cada abono se gestiona aparte (todavía no hay registro de pagos cargado).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pago a cadetes */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">A pagar a cadetes</h3>
            <span className="text-sm font-extrabold text-gray-900">{peso(pagoCadetes)}</span>
          </div>
          {porCadete.length === 0
            ? <Empty texto={`Sin entregas ${periodoLabel}`} />
            : <div className="space-y-1">
                {porCadete.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between px-2 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-600' : i === 1 ? 'bg-gray-100 text-gray-500' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-400'}`}>{i + 1}</span>
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{c.nombre}</p>
                        <p className="text-xs text-gray-400">{c.pedidos} {c.pedidos === 1 ? 'entrega' : 'entregas'}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-green-600">{peso(c.pago)}</span>
                  </div>
                ))}
              </div>}
        </div>

        {/* Facturación por comercio */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Facturación por comercio</h3>
            <span className="text-sm font-extrabold text-gray-900">{peso(facturacionEnvios)}</span>
          </div>
          {porComercio.length === 0
            ? <Empty texto="Sin comercios" />
            : <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="text-left pb-2 px-2 font-semibold">Comercio</th>
                      <th className="text-left pb-2 px-2 font-semibold">Plan</th>
                      <th className="text-right pb-2 px-2 font-semibold">Envíos</th>
                      <th className="text-right pb-2 px-2 font-semibold">Facturado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porComercio.map(co => (
                      <tr key={co.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="py-2.5 px-2 font-semibold text-gray-800">{co.nombre}{!co.activo && <span className="ml-1 text-[10px] text-gray-400">(inactivo)</span>}</td>
                        <td className="py-2.5 px-2">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${co.plan !== 'sin_plan' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{PLAN_NOMBRE[co.plan]}</span>
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-500">{co.pedidos}</td>
                        <td className="py-2.5 px-2 text-right font-bold text-gray-900">{peso(co.facturado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </div>
      </div>

      {/* Resumen de reparto */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-1">Reparto de envíos ({periodoLabel})</h3>
        <p className="text-xs text-gray-400 mb-4">{entregadas.length} {entregadas.length === 1 ? 'entrega' : 'entregas'} · {peso(facturacionEnvios)} facturado</p>
        {facturacionEnvios > 0
          ? (
            <>
              <div className="flex h-7 rounded-full overflow-hidden">
                <div className="bg-green-600 flex items-center justify-center text-[11px] font-bold text-white" style={{ width: `${(pagoCadetes / facturacionEnvios) * 100}%` }}>82%</div>
                <div className="bg-gray-800 flex items-center justify-center text-[11px] font-bold text-white" style={{ width: `${(comisionYendo / facturacionEnvios) * 100}%` }}>18%</div>
              </div>
              <div className="flex justify-between mt-3 text-sm">
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-600" /> Cadetes <strong className="text-gray-900">{peso(pagoCadetes)}</strong></span>
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-800" /> Yendo <strong className="text-gray-900">{peso(comisionYendo)}</strong></span>
              </div>
            </>
          )
          : <Empty texto={`Sin envíos entregados ${periodoLabel}`} />}
      </div>
    </div>
  );
}

// Modal de cambio de plan (reemplaza el prompt() nativo)
function PlanModal({ comercio, onClose, onSave }) {
  const [sel, setSel] = useState(comercio.plan ?? 'sin_plan');
  const [saving, setSaving] = useState(false);
  const opciones = [
    { v: 'sin_plan', precio: null, sub: 'Sin suscripción' },
    { v: 'diario',   precio: PLAN_NOMINAL.diario,  sub: 'por día' },
    { v: 'mensual',  precio: PLAN_NOMINAL.mensual, sub: 'por mes' },
    { v: 'anual',    precio: PLAN_NOMINAL.anual,   sub: 'por año' },
  ];
  async function guardar() { setSaving(true); await onSave(comercio.id, sel); setSaving(false); }
  return (
    <Modal titulo={`Plan de ${comercio.nombre}`} onClose={onClose}>
      <div className="space-y-2">
        {opciones.map(o => (
          <button key={o.v} type="button" onClick={() => setSel(o.v)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${sel === o.v ? 'border-green-500 bg-green-50' : 'border-gray-100 hover:border-gray-200'}`}>
            <div className="text-left">
              <p className="font-bold text-gray-900">{PLAN_NOMBRE[o.v]}</p>
              <p className="text-xs text-gray-400">{o.sub}</p>
            </div>
            <div className="flex items-center gap-3">
              {o.precio != null && <span className="font-extrabold text-green-600">{peso(o.precio)}</span>}
              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${sel === o.v ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                {sel === o.v && <span className="w-2 h-2 rounded-full bg-white" />}
              </span>
            </div>
          </button>
        ))}
      </div>
      <div className="flex gap-3 mt-5">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
        <button type="button" disabled={saving} onClick={guardar} className="flex-[1.4] py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-60 transition-colors">{saving ? 'Guardando...' : 'Guardar plan'}</button>
      </div>
    </Modal>
  );
}

function Modal({ titulo, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lift-lg animate-bounce-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg text-gray-900">{titulo}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all text-xl leading-none active:scale-90">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  const colors = { green: 'text-green-600', blue: 'text-blue-600', red: 'text-red-500', gray: 'text-gray-700' };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <p className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-extrabold ${colors[color]}`}>{value}</p>
    </div>
  );
}

const SPARK_ADMIN = "M2 18 L10 14 L18 16 L26 9 L34 11 L42 4";
// Nombres de icono válidos (si `icon` no está acá, se asume emoji legacy).
const STATCARD_ICONS = new Set(['box','store','bike','user','users','pin','phone','wallet','money','chart','clock','star','zap','plus','check','list','power','navigate']);
function StatCard2({ icon, tint, label, value, delta, up, idx = 0 }) {
  const tints  = { green: 'bg-green-100 text-green-600', blue: 'bg-blue-100 text-blue-600', purple: 'bg-purple-100 text-purple-600', violet: 'bg-violet-100 text-violet-600', amber: 'bg-amber-100 text-amber-600', gray: 'bg-gray-100 text-gray-500' };
  const strokes = { green: '#22C55E', blue: '#3B82F6', purple: '#A855F7', violet: '#7C3AED', amber: '#F59E0B', gray: '#9CA3AF' };
  return (
    <div
      style={{ animationDelay: `${idx * 60}ms` }}
      className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lift hover:border-gray-200 animate-slide-up cursor-default"
    >
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl ${tints[tint] ?? tints.green} flex items-center justify-center text-xl transition-transform duration-200 hover:scale-110`}>
          {STATCARD_ICONS.has(icon) ? <Icon name={icon} className="w-5 h-5" /> : icon}
        </div>
        <svg viewBox="0 0 44 22" className="w-16 h-8 opacity-70">
          <path d={SPARK_ADMIN} fill="none" stroke={up ? (strokes[tint] ?? '#22C55E') : '#9CA3AF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <p className="text-xs text-gray-400 mt-3 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-2xl font-extrabold text-gray-900 mt-0.5">{value}</p>
      <p className={`text-xs font-semibold mt-1 ${up ? 'text-green-600' : 'text-gray-400'}`}>{up && '↗ '}{delta}</p>
    </div>
  );
}
function AdminHeader({ perfil, titulo, sub, accion }) {
  const initials = (perfil?.nombre ?? 'A').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 animate-slide-up">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">{titulo}</h1>
        {sub && <p className="text-sm text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-3">
        {accion}
        <div className="hidden sm:flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white flex items-center justify-center text-xs font-bold ring-2 ring-green-100">{initials}</div>
          <div className="pr-1">
            <p className="text-sm font-bold text-gray-800 leading-tight">{perfil?.nombre?.split(' ')[0]}</p>
            <p className="text-xs text-green-600 font-medium">Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}
function Avatar({ nombre }) {
  const initials = (nombre ?? 'U').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  return <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">{initials}</div>;
}
function MiniStat({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center hover:bg-gray-100 transition-colors cursor-default">
      <p className="text-xl font-extrabold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
function Empty({ texto }) {
  return <p className="text-sm text-gray-400 text-center py-10 col-span-full">{texto}</p>;
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
function Campo({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <input {...props} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all hover:border-gray-300 placeholder:text-gray-400" />
    </div>
  );
}
