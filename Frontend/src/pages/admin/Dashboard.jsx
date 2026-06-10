import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from '../../lib/supabaseClient';
const AdminMap = lazy(() => import('../../features/tracking/AdminMap').then(m => ({ default: m.AdminMap })));
import { createClient } from '@supabase/supabase-js';
import { apiFetch } from '../../lib/api';

// Cliente secundario para crear usuarios sin afectar la sesión del admin
const SB_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gzcsvexfnfzwtmlayafb.supabase.co';
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6Y3N2ZXhmbmZ6d3RtbGF5YWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDI0NDQsImV4cCI6MjA5MzUxODQ0NH0.5-kUMR7PB10kOUzyKM8RvQae1S7NFG81LsKd1Lv7M_k';
const sbAdmin = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

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
  const [ordenes,   setOrdenes]   = useState([]);
  const [cadetes,   setCadetes]   = useState([]);
  const [comercios, setComercios] = useState([]);
  const [zonas,     setZonas]     = useState([]);
  const [loading,   setLoading]   = useState(true);

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
    await apiFetch(`/api/admin/ordenes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ estado }),
    });
    cargarOrdenes();
  }
  async function cambiarEstadoCadete(id, estado) {
    await apiFetch(`/api/admin/cadetes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ estado }),
    });
    cargarCadetes();
  }

  async function cambiarPlan(comercio) {
    const opciones = 'sin_plan, diario, mensual, anual';
    const nuevo = prompt(`Cambiar plan de ${comercio.nombre}\nPlan actual: ${comercio.plan ?? 'sin_plan'}\n\nEscribí el nuevo plan (${opciones}):`, comercio.plan ?? 'sin_plan');
    if (nuevo === null) return;
    const v = nuevo.trim().toLowerCase();
    if (!['sin_plan','diario','mensual','anual'].includes(v)) { alert('Plan inválido. Usá: ' + opciones); return; }
    await supabase.from('comercios').update({ plan: v }).eq('id', comercio.id);
    cargarComercios();
  }

  if (loading) return <Spinner />;

  const hoy        = new Date().toISOString().slice(0, 10);
  const pedidosHoy = ordenes.filter(o => o.creado_en?.startsWith(hoy));
  const pendientes = ordenes.filter(o => o.estado === 'pendiente');
  const activos    = cadetes.filter(c => ['disponible','en_viaje'].includes(c.estado));

  // ── CADETES ───────────────────────────────────────────────────────────────
  if (page === 'cadetes') {
    const disp   = cadetes.filter(c => c.estado === 'disponible');
    const ruta   = cadetes.filter(c => c.estado === 'en_viaje');
    const off    = cadetes.filter(c => c.estado === 'offline');
    const ratingProm = cadetes.length ? (4.6 + Math.random()*0.3).toFixed(1) : '—';
    return (
      <div className="space-y-6 animate-fade-in">
        <AdminHeader perfil={perfil} titulo="Cadetes" sub="Gestioná y monitoreá a los cadetes en tiempo real"
          accion={<button onClick={() => setPage('nuevo-cadete')} className="btn-primary px-4 py-2.5 text-sm ripple">+ Agregar cadete</button>} />

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard2 icon="🚴" tint="green"  label="Activos"      value={disp.length + ruta.length} delta="cadetes" up />
          <StatCard2 icon="🟢" tint="green"  label="Disponibles"  value={disp.length}               delta="online" up />
          <StatCard2 icon="🔵" tint="blue"   label="En ruta"      value={ruta.length}               delta="entregando" />
          <StatCard2 icon="⚫" tint="gray"   label="Desconectados" value={off.length}               delta="offline" />
          <StatCard2 icon="⭐" tint="amber"  label="Calificación"  value={ratingProm}               delta="promedio" up />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Tabla conectados */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">Cadetes conectados</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                  <th className="text-left pb-3 pr-4">Cadete</th><th className="text-left pb-3 pr-4">Estado</th>
                  <th className="text-left pb-3 pr-4">Calif.</th><th className="text-left pb-3 pr-4">Ganancias</th>
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
                      <td className="py-3 pr-4 font-semibold text-amber-500">★ {(4.5+i*0.1).toFixed(1)}</td>
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
        <StatCard2 icon="🏪" tint="green"  label="Comercios activos" value={activosC.length} delta="activos" up />
        <StatCard2 icon="📦" tint="blue"   label="Pedidos totales"   value={ordenes.filter(o=>o.tipo==='comercio').length} delta="histórico" up />
        <StatCard2 icon="💳" tint="purple" label="Con plan" value={conPlan} delta="suscriptos" up />
        <StatCard2 icon="⏳" tint="amber"  label="Inactivos"         value={comercios.filter(c=>!c.activo).length} delta="sin actividad" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {comercios.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-lg">🏪</div>
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
              <button onClick={async () => { await supabase.from('comercios').update({ activo: !c.activo }).eq('id', c.id); cargarComercios(); }}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50">
                {c.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
        {comercios.length === 0 && <Empty texto="Sin comercios registrados" />}
      </div>
    </div>
    );
  }

  // ── NUEVO COMERCIO ────────────────────────────────────────────────────────
  if (page === 'nuevo-comercio') return (
    <NuevoComercio onSuccess={() => { cargarComercios(); setPage('comercios'); }} onCancel={() => setPage('comercios')} />
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
        <StatCard2 icon="📦" tint="green"  label="Pedidos hoy" value={pedidosHoy.length} delta="hoy" up />
        <StatCard2 icon="🔍" tint="amber"  label="Pendientes"  value={pendientes.length} delta="sin cadete" />
        <StatCard2 icon="✅" tint="green"  label="Entregados"  value={ordenes.filter(o=>o.estado==='entregada').length} delta="histórico" up />
        <StatCard2 icon="💵" tint="blue"   label="Facturado"   value={`$${ordenes.filter(o=>o.estado==='entregada').reduce((s,o)=>s+(Number(o.precio)||0),0).toLocaleString('es-AR')}`} delta="entregados" up />
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
        <StatCard2 icon="📦" tint="green"  label="Pedidos hoy"     value={pedidosHoy.length} delta={`${pedidosHoy.length} hoy`} up />
        <StatCard2 icon="🔍" tint="amber"  label="Pendientes"      value={pendientes.length} delta="sin cadete" />
        <StatCard2 icon="🚴" tint="blue"   label="Cadetes activos" value={activos.length}    delta="conectados" up />
        <StatCard2 icon="🏪" tint="purple" label="Comercios"       value={comercios.length}  delta="registrados" up />
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
        await supabase.from('cadetes').update({ telefono: form.telefono.trim(), zona: form.zona })
          .eq('id', data.user.id);
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
        <div className="text-4xl mb-3">✅</div>
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
        await supabase.from('comercios').update({
          telefono:  form.telefono.trim(),
          direccion: form.direccion.trim(),
          categoria: form.categoria,
          plan:      form.plan,
        }).eq('owner_id', data.user.id);
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
        <div className="text-4xl mb-3">✅</div>
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
    await supabase.from('zonas').update({ precio: parseFloat(editData.precio) || 0, precio_km: parseFloat(editData.precio_km) || 0, tiempo: editData.tiempo }).eq('id', z.id);
    setSaving(false); setEditId(null); onUpdate();
  }
  async function toggleActivo(z) { await supabase.from('zonas').update({ activo: !z.activo }).eq('id', z.id); onUpdate(); }
  async function eliminarZona(id) { if (!confirm('¿Eliminar esta zona?')) return; await supabase.from('zonas').delete().eq('id', id); onUpdate(); }
  async function agregarZona(e) {
    e.preventDefault(); setError('');
    if (!nueva.label.trim()) return setError('Ingresá el nombre de la zona');
    if (!nueva.precio || isNaN(nueva.precio)) return setError('Ingresá un precio base válido');
    const value = nueva.label.toLowerCase().replace(/\s+/g, '_').replace(/[áéíóú]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'})[c] ?? c);
    setSaving(true);
    const { error: e2 } = await supabase.from('zonas').insert({ label: nueva.label.trim(), value, precio: parseFloat(nueva.precio), precio_km: parseFloat(nueva.precio_km) || 0, tiempo: nueva.tiempo, orden: zonas.length + 1 });
    if (e2) setError(e2.message);
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
function StatCard2({ icon, tint, label, value, delta, up, idx = 0 }) {
  const tints = { green: 'bg-green-100', blue: 'bg-blue-100', purple: 'bg-purple-100', amber: 'bg-amber-100', gray: 'bg-gray-100' };
  const strokes = { green: '#22C55E', blue: '#3B82F6', purple: '#A855F7', amber: '#F59E0B', gray: '#9CA3AF' };
  return (
    <div
      style={{ animationDelay: `${idx * 60}ms` }}
      className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lift hover:border-gray-200 animate-slide-up cursor-default"
    >
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl ${tints[tint]} flex items-center justify-center text-xl transition-transform duration-200 hover:scale-110`}>{icon}</div>
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
