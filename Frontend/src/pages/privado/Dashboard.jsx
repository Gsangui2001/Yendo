import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import SolicitarCadete from '../../components/Particular/SolicitarCadete';

const ESTADO_CHIP = {
  pendiente: 'bg-amber-100 text-amber-700',
  asignada:  'bg-blue-100 text-blue-700',
  en_camino: 'bg-blue-100 text-blue-700',
  entregada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-400',
};
const ESTADO_LABEL = {
  pendiente: '🔍 Buscando cadete',
  asignada:  '✅ Cadete asignado',
  en_camino: '🚴 En camino',
  entregada: '📦 Entregado',
  cancelada: '❌ Cancelado',
};

export default function PrivadoApp({ perfil, page, setPage }) {
  const [ordenes,  setOrdenes]  = useState([]);
  const [tracking, setTracking] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => { cargarOrdenes(); }, [perfil]);

  // Realtime tracking
  useEffect(() => {
    if (!tracking) return;
    const ch = supabase.channel(`orden-${tracking.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ordenes',
        filter: `id=eq.${tracking.id}` }, ({ new: updated }) => {
        setTracking(updated);
        cargarOrdenes();
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tracking?.id]);

  async function cargarOrdenes() {
    const { data } = await supabase.from('ordenes').select('*')
      .eq('solicitante_id', perfil.id).order('creado_en', { ascending: false }).limit(20);
    setOrdenes(data ?? []);
    setLoading(false);
  }

  function onPedidoCreado(ordenId) {
    cargarOrdenes().then(() => {
      const orden = ordenes.find(o => o.id === ordenId);
      if (orden) setTracking(orden);
    });
    setPage('historial');
  }

  if (loading) return <Spinner />;

  const activas = ordenes.filter(o => ['pendiente','asignada','en_camino'].includes(o.estado));

  if (page === 'solicitar') return (
    <SolicitarCadete usuarioId={perfil.id} onPedidoCreado={onPedidoCreado} />
  );

  if (page === 'historial') return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Mis pedidos</h2>

      {activas.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-blue-700 mb-3">📡 Pedidos activos</p>
          {activas.map(o => <TrackingCard key={o.id} orden={o} />)}
        </div>
      )}

      {ordenes.length === 0
        ? <Empty texto="Todavía no hiciste ningún pedido" accion={() => setPage('solicitar')} />
        : <div className="space-y-2">
            {ordenes.map(o => (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="font-semibold text-gray-900 truncate">{o.descripcion ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {o.origen} → {o.destino}
                    </p>
                    <p className="text-xs text-gray-300 mt-0.5">
                      {new Date(o.creado_en).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ESTADO_CHIP[o.estado]}`}>
                      {ESTADO_LABEL[o.estado]}
                    </span>
                    {o.precio && <p className="text-sm font-bold text-gray-700 mt-1">${o.precio.toLocaleString('es-AR')}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );

  if (page === 'direcciones') return (
    <DireccionesGuardadas usuarioId={perfil.id} />
  );

  // ── INICIO ──
  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white">
        <p className="text-green-200 text-sm mb-1">Hola, {perfil.nombre?.split(' ')[0]} 👋</p>
        <h2 className="text-2xl font-bold mb-3">¿Necesitás un cadete?</h2>
        <p className="text-green-100 text-sm mb-5">Enviá un paquete, buscá algo o hacé un trámite. Rápido y sin complicaciones.</p>
        <button onClick={() => setPage('solicitar')}
          className="bg-white text-green-700 px-6 py-3 rounded-xl font-bold hover:bg-green-50 transition-colors">
          Pedir cadete ahora
        </button>
      </div>

      {activas.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold mb-3">📡 Pedidos en curso</h3>
          <div className="space-y-3">
            {activas.map(o => <TrackingCard key={o.id} orden={o} />)}
          </div>
        </div>
      )}

      {ordenes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold">Últimos pedidos</h3>
            <button onClick={() => setPage('historial')} className="text-sm text-green-600 font-semibold">Ver todos →</button>
          </div>
          {ordenes.slice(0, 3).map(o => (
            <div key={o.id} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-semibold truncate max-w-[180px]">{o.descripcion ?? '—'}</p>
                <p className="text-xs text-gray-400">{new Date(o.creado_en).toLocaleDateString('es-AR')}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ESTADO_CHIP[o.estado]}`}>
                {ESTADO_LABEL[o.estado]}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TipoCard emoji="📦" label="Enviar paquete" onClick={() => setPage('solicitar')} />
        <TipoCard emoji="🛒" label="Buscar algo"    onClick={() => setPage('solicitar')} />
        <TipoCard emoji="📋" label="Hacer trámite"  onClick={() => setPage('solicitar')} />
        <TipoCard emoji="📍" label="Mis direcciones" onClick={() => setPage('direcciones')} />
      </div>
    </div>
  );
}

// ── Gestión de direcciones guardadas ─────────────────────────────────────────
function DireccionesGuardadas({ usuarioId }) {
  const [direcciones,  setDirecciones]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [form,         setForm]         = useState({ nombre: '', direccion: '' });
  const [errors,       setErrors]       = useState({});

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setLoading(true);
    const { data } = await supabase
      .from('direcciones')
      .select('*')
      .eq('usuario_id', usuarioId)
      .order('nombre');
    setDirecciones(data ?? []);
    setLoading(false);
  }

  function validate() {
    const e = {};
    if (!form.nombre.trim())    e.nombre    = 'Poné un nombre (ej: Mi casa)';
    if (!form.direccion.trim()) e.direccion = 'Ingresá la dirección';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function guardar(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await supabase.from('direcciones').insert({
      usuario_id: usuarioId,
      nombre:     form.nombre.trim(),
      direccion:  form.direccion.trim(),
    });
    await cargar();
    setForm({ nombre: '', direccion: '' });
    setErrors({});
    setShowForm(false);
    setSaving(false);
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar esta dirección?')) return;
    await supabase.from('direcciones').delete().eq('id', id);
    cargar();
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Mis direcciones</h2>
        <button
          onClick={() => { setShowForm(true); setErrors({}); }}
          className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700"
        >
          + Nueva
        </button>
      </div>

      {direcciones.length === 0 && !showForm
        ? <div className="text-center py-12">
            <p className="text-gray-400 mb-4">Guardá tus direcciones frecuentes para pedir más rápido</p>
            <button onClick={() => setShowForm(true)}
              className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-green-700">
              Guardar primera dirección
            </button>
          </div>
        : <div className="grid gap-3 sm:grid-cols-2">
            {direcciones.map(d => (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{d.nombre}</p>
                  <p className="text-sm text-gray-500 mt-0.5">📍 {d.direccion}</p>
                </div>
                <button
                  onClick={() => eliminar(d.id)}
                  className="text-gray-300 hover:text-red-400 text-xl leading-none ml-2 flex-shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
      }

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Nueva dirección</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre *</label>
                <input
                  value={form.nombre}
                  onChange={e => { setForm(p => ({...p, nombre: e.target.value})); setErrors(p => ({...p, nombre: ''})); }}
                  placeholder="Ej: Mi casa, Trabajo, Mamá..."
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.nombre ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                />
                {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Dirección *</label>
                <input
                  value={form.direccion}
                  onChange={e => { setForm(p => ({...p, direccion: e.target.value})); setErrors(p => ({...p, direccion: ''})); }}
                  placeholder="Calle y número"
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.direccion ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                />
                {errors.direccion && <p className="text-red-500 text-xs mt-1">{errors.direccion}</p>}
              </div>
              <button type="submit" disabled={saving}
                className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60">
                {saving ? 'Guardando...' : 'Guardar dirección'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TrackingCard({ orden }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-semibold">{orden.descripcion ?? '—'}</p>
          <p className="text-xs text-gray-400">{orden.origen} → {orden.destino}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${ESTADO_CHIP[orden.estado]}`}>
          {ESTADO_LABEL[orden.estado]}
        </span>
      </div>
      {['pendiente','asignada'].includes(orden.estado) && (
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full bg-green-500 transition-all duration-1000
            ${orden.estado === 'pendiente' ? 'w-1/4 animate-pulse' : 'w-2/3'}`} />
        </div>
      )}
    </div>
  );
}
function TipoCard({ emoji, label, onClick }) {
  return (
    <button onClick={onClick}
      className="bg-white border border-gray-100 rounded-2xl p-4 text-left hover:border-green-300 hover:bg-green-50 transition-colors">
      <span className="text-2xl block mb-1">{emoji}</span>
      <span className="text-sm font-semibold text-gray-700">{label}</span>
    </button>
  );
}
function Empty({ texto, accion }) {
  return (
    <div className="text-center py-12">
      <p className="text-gray-400 mb-4">{texto}</p>
      {accion && <button onClick={accion} className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-green-700">Hacer mi primer pedido</button>}
    </div>
  );
}
function Spinner() {
  return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"/></div>;
}
