import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import SolicitarCadete from '../../components/Particular/SolicitarCadete';
import { apiFetch, readApiError } from '../../lib/api';
import { useToast, useConfirm } from '../../components/ui/feedback';
import { Icon } from '../../components/ui/Icon';
import { TrackingMap } from '../../features/tracking/TrackingMapLazy';

const ESTADO_CHIP = {
  pendiente: 'bg-amber-100 text-amber-700',
  asignada:  'bg-blue-100 text-blue-700',
  en_camino: 'bg-blue-100 text-blue-700',
  entregada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-400',
};
const ESTADO_LABEL = {
  pendiente: 'Buscando cadete',
  asignada:  'Cadete asignado',
  en_camino: 'En camino',
  entregada: 'Entregado',
  cancelada: 'Cancelado',
};

export default function PrivadoApp({ perfil, page, setPage }) {
  const [ordenes,  setOrdenes]  = useState([]);
  const [tracking, setTracking] = useState(null);
  const [cadeteTracking, setCadeteTracking] = useState(null);
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
    const activa = (data ?? []).find(o => ['pendiente','asignada','en_camino'].includes(o.estado));
    setTracking(prev => prev ? ((data ?? []).find(o => o.id === prev.id) ?? activa ?? null) : (activa ?? null));
    setLoading(false);
  }

  // Trae el cadete asignado al pedido en seguimiento (nombre, teléfono, GPS).
  // Va por backend: valida que tengamos un pedido activo con ese cadete.
  const cadeteId = tracking?.cadete_id ?? tracking?.asignado_a_id ?? null;
  useEffect(() => {
    if (!cadeteId) { setCadeteTracking(null); return; }
    let vivo = true;
    apiFetch(`/api/cadetes/${cadeteId}/contacto`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (vivo) setCadeteTracking(data ?? null); })
      .catch(() => { if (vivo) setCadeteTracking(null); });
    return () => { vivo = false; };
  }, [cadeteId]);

  function onPedidoCreado(ordenId) {
    cargarOrdenes().then(() => setTracking(prev => prev ?? ordenes.find(o => o.id === ordenId) ?? null));
    setPage('inicio');
  }

  if (loading) return <Spinner />;

  const activas = ordenes.filter(o => ['pendiente','asignada','en_camino'].includes(o.estado));
  const trackingOrden = tracking ?? activas[0] ?? null;

  if (page === 'solicitar') return (
    <SolicitarCadete usuarioId={perfil.id} onPedidoCreado={onPedidoCreado} />
  );

  if (page === 'historial') return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Mis pedidos</h2>

      {activas.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-900 mb-3">Seguimiento activo</p>
          <TrackingMap order={trackingOrden} cadete={cadeteTracking} height={320} compact />
          <div className="mt-3 space-y-2">
            {activas.map(o => <TrackingCard key={o.id} orden={o} cadete={trackingOrden?.id === o.id ? cadeteTracking : null} onClick={() => setTracking(o)} active={trackingOrden?.id === o.id} />)}
          </div>
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
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white">
        <p className="text-green-200 text-sm mb-1">Hola, {perfil.nombre?.split(' ')[0]}</p>
        <h2 className="text-2xl font-bold mb-3">¿Necesitás un cadete?</h2>
        <p className="text-green-100 text-sm mb-5">Enviá un paquete, buscá algo o hacé un trámite. Rápido y sin complicaciones.</p>
        <button onClick={() => setPage('solicitar')}
          className="bg-white text-green-700 px-6 py-3 rounded-xl font-bold hover:bg-green-50 transition-colors">
          Pedir cadete ahora
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Mapa del pedido</h3>
              <p className="text-xs text-gray-400">
                {trackingOrden ? 'Seguimiento en vivo del envío' : 'Cuando pidas un cadete, lo vas a ver acá'}
              </p>
            </div>
            <button onClick={() => setPage('solicitar')} className="rounded-xl bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700">
              Pedir
            </button>
          </div>
          <TrackingMap order={trackingOrden ?? { estado: 'pendiente', zona: 'ciudad_colon', destino: 'Destino del envío' }} cadete={cadeteTracking} height={360} compact />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-bold mb-3">Pedidos en curso</h3>
          {activas.length === 0
            ? <p className="text-sm text-gray-400">No tenés pedidos activos.</p>
            : <div className="space-y-3">{activas.map(o => <TrackingCard key={o.id} orden={o} cadete={trackingOrden?.id === o.id ? cadeteTracking : null} onClick={() => setTracking(o)} active={trackingOrden?.id === o.id} />)}</div>}
        </div>
      </div>

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
        <TipoCard icon="box"   label="Enviar paquete"  onClick={() => setPage('solicitar')} />
        <TipoCard icon="zap"   label="Buscar algo"     onClick={() => setPage('solicitar')} />
        <TipoCard icon="list"  label="Hacer trámite"   onClick={() => setPage('solicitar')} />
        <TipoCard icon="pin"   label="Mis direcciones" onClick={() => setPage('direcciones')} />
      </div>
    </div>
  );
}

// ── Gestión de direcciones guardadas ─────────────────────────────────────────
function DireccionesGuardadas({ usuarioId }) {
  const toast = useToast();
  const confirm = useConfirm();
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
    try {
      const res = await apiFetch('/api/direcciones', {
        method: 'POST',
        body: JSON.stringify({
          usuario_id: usuarioId,
          nombre:     form.nombre.trim(),
          direccion:  form.direccion.trim(),
        }),
      });
      if (!res.ok) { toast.error(await readApiError(res)); return; }
      await cargar();
      setForm({ nombre: '', direccion: '' });
      setErrors({});
      setShowForm(false);
      toast.success('Dirección guardada');
    } catch {
      toast.error('No se pudo guardar la dirección. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(id) {
    const ok = await confirm({ title: 'Eliminar dirección', message: 'Esta dirección guardada se va a borrar.', danger: true, confirmLabel: 'Eliminar' });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/direcciones/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readApiError(res)); return; }
      cargar();
      toast.success('Dirección eliminada');
    } catch {
      toast.error('No se pudo eliminar la dirección. Revisá tu conexión e intentá de nuevo.');
    }
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
                  <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1"><Icon name="pin" className="w-3.5 h-3.5 text-gray-400" /> {d.direccion}</p>
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

function TrackingCard({ orden, cadete, onClick, active }) {
  const progreso = { pendiente: 'w-1/4', asignada: 'w-2/4', en_camino: 'w-3/4', entregada: 'w-full' }[orden.estado] ?? 'w-1/4';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className={`w-full cursor-pointer text-left rounded-xl border p-3 transition-all ${active ? 'border-green-300 bg-green-50' : 'border-gray-100 bg-white hover:border-green-200 hover:bg-green-50'}`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{orden.descripcion ?? 'Pedido'}</p>
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
            <Icon name="pin" className="w-3 h-3 shrink-0" />
            <span className="truncate">{orden.origen} → {orden.destino}</span>
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${ESTADO_CHIP[orden.estado]}`}>
          {ESTADO_LABEL[orden.estado]}
        </span>
      </div>

      {(cadete?.nombre || orden.precio) && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
          {cadete?.nombre
            ? <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-600">
                <Icon name="bike" className="w-3.5 h-3.5 shrink-0 text-green-600" />
                <span className="font-semibold truncate">{cadete.nombre}</span>
                {cadete.telefono && (
                  <a href={`tel:${cadete.telefono}`} onClick={e => e.stopPropagation()}
                    className="ml-1 inline-flex shrink-0 items-center gap-0.5 font-semibold text-green-600 hover:text-green-700">
                    <Icon name="phone" className="w-3 h-3" /> Llamar
                  </a>
                )}
              </span>
            : <span className="text-xs text-gray-400">Buscando cadete...</span>}
          {orden.precio && <span className="text-sm font-bold text-gray-800 shrink-0">${Number(orden.precio).toLocaleString('es-AR')}</span>}
        </div>
      )}

      {['pendiente','asignada','en_camino'].includes(orden.estado) && (
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full bg-green-500 transition-all duration-700 ${progreso} ${orden.estado === 'pendiente' ? 'animate-pulse' : ''}`} />
        </div>
      )}
    </div>
  );
}
function TipoCard({ icon, label, onClick }) {
  return (
    <button onClick={onClick}
      className="group bg-white border border-gray-100 rounded-2xl p-4 text-left hover:border-green-300 hover:bg-green-50 transition-colors">
      <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600 transition-transform group-hover:scale-110">
        <Icon name={icon} className="w-5 h-5" />
      </span>
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
