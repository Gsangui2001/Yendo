import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import NotificacionesPedidos from '../../components/Cadete/NotificacionesPedidos';

export default function CadeteApp({ perfil, page }) {
  const [cadete,         setCadete]         = useState(null);
  const [ordenes,        setOrdenes]        = useState([]);
  const [ordenActiva,    setOrdenActiva]    = useState(null); // pedido en curso
  const [loading,        setLoading]        = useState(true);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  useEffect(() => { cargarDatos(); }, [perfil]);

  // Realtime: escucha cambios en la orden activa para que el comerciante
  // también vea actualizaciones si alguien más cambia el estado
  useEffect(() => {
    if (!ordenActiva) return;
    const ch = supabase.channel(`orden-activa-${ordenActiva.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'ordenes',
        filter: `id=eq.${ordenActiva.id}`,
      }, ({ new: updated }) => {
        if (['entregada', 'cancelada'].includes(updated.estado)) {
          setOrdenActiva(null);
          cargarDatos();
        } else {
          setOrdenActiva(updated);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [ordenActiva?.id]);

  async function cargarDatos() {
    setLoading(true);
    const { data: cad } = await supabase
      .from('cadetes').select('*').eq('id', perfil.id).single();
    setCadete(cad);

    // Buscar si tiene un pedido en curso (asignada o en_camino)
    const { data: activa } = await supabase
      .from('ordenes')
      .select('*')
      .eq('cadete_id', perfil.id)
      .in('estado', ['asignada', 'en_camino'])
      .order('asignada_en', { ascending: false })
      .limit(1)
      .single();
    setOrdenActiva(activa ?? null);

    const { data: ords } = await supabase
      .from('ordenes').select('*')
      .eq('cadete_id', perfil.id)
      .order('creado_en', { ascending: false }).limit(30);
    setOrdenes(ords ?? []);
    setLoading(false);
  }

  async function toggleEstado() {
    if (!cadete) return;
    setCambiandoEstado(true);
    const nuevoEstado = cadete.estado === 'disponible' ? 'offline' : 'disponible';
    const { data } = await supabase.from('cadetes')
      .update({
        estado: nuevoEstado,
        jornada_inicio: nuevoEstado === 'disponible'
          ? new Date().toISOString()
          : cadete.jornada_inicio,
      })
      .eq('id', perfil.id).select().single();
    setCadete(data);
    setCambiandoEstado(false);
  }

  async function finalizarJornada() {
    if (!confirm('¿Finalizar jornada?')) return;
    const { data } = await supabase.from('cadetes')
      .update({ estado: 'offline', jornada_inicio: null })
      .eq('id', perfil.id).select().single();
    setCadete(data);
  }

  async function marcarEnCamino() {
    if (!ordenActiva) return;
    setCambiandoEstado(true);
    try {
      const res = await fetch(`/api/ordenes/${ordenActiva.id}/en_camino`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadete_id: perfil.id }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setOrdenActiva(updated);
    } catch {
      alert('No se pudo actualizar el estado. Intentá de nuevo.');
    } finally {
      setCambiandoEstado(false);
    }
  }

  async function marcarEntregado() {
    if (!ordenActiva) return;
    if (!confirm('¿Confirmar entrega del pedido?')) return;
    setCambiandoEstado(true);
    try {
      const res = await fetch(`/api/ordenes/${ordenActiva.id}/entregar`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadete_id: perfil.id }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      // Actualizar ganancias localmente hasta que llegue el realtime
      setCadete(prev => prev ? {
        ...prev,
        estado:           'disponible',
        ganancias_hoy:    (prev.ganancias_hoy    ?? 0) + (updated.precio ?? 0),
        ganancias_mes:    (prev.ganancias_mes    ?? 0) + (updated.precio ?? 0),
        viajes_hoy:       (prev.viajes_hoy       ?? 0) + 1,
      } : prev);
      setOrdenActiva(null);
      await cargarDatos();
    } catch {
      alert('No se pudo registrar la entrega. Intentá de nuevo.');
    } finally {
      setCambiandoEstado(false);
    }
  }

  if (loading) return <Spinner />;

  const hoy        = new Date().toISOString().slice(0, 10);
  const ordenesHoy = ordenes.filter(o => o.creado_en?.startsWith(hoy));
  const entregadasHoy = ordenesHoy.filter(o => o.estado === 'entregada');
  const disponible = cadete?.estado === 'disponible';
  const enViaje    = cadete?.estado === 'en_viaje';

  let duracion = null;
  if (cadete?.jornada_inicio) {
    const mins = Math.floor((Date.now() - new Date(cadete.jornada_inicio)) / 60000);
    duracion = mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}m`;
  }

  if (page === 'ganancias') return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Ganancias</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GanCard label="Hoy"    value={cadete?.ganancias_hoy ?? 0}    viajes={cadete?.viajes_hoy ?? 0} />
        <GanCard label="Semana" value={cadete?.ganancias_semana ?? 0} viajes={cadete?.viajes_semana ?? 0} />
        <GanCard label="Mes"    value={cadete?.ganancias_mes ?? 0}    viajes={cadete?.viajes_mes ?? 0} />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-bold mb-3">Pedidos de hoy</h3>
        {ordenesHoy.length === 0
          ? <p className="text-sm text-gray-400 text-center py-6">Sin pedidos hoy</p>
          : <div className="space-y-2">
              {ordenesHoy.map(o => (
                <div key={o.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="font-semibold text-sm">{o.cliente_nombre ?? o.descripcion ?? '—'}</p>
                    <p className="text-xs text-gray-400">{o.zona_label ?? o.origen ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">${(o.precio ?? 0).toLocaleString('es-AR')}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${o.estado === 'entregada' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {o.estado}
                    </span>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );

  if (page === 'jornada') return (
    <div className="space-y-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold">Mi jornada</h2>
      <div className={`rounded-2xl p-6 border-2 ${disponible || enViaje ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-3 h-3 rounded-full ${disponible ? 'bg-green-500 animate-pulse' : enViaje ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
          <span className="font-bold text-lg">
            {disponible ? 'Disponible' : enViaje ? 'En viaje' : 'Offline'}
          </span>
        </div>
        {duracion && <p className="text-sm text-gray-500 mb-1">⏱ Tiempo activo: <strong>{duracion}</strong></p>}
        <div className="grid grid-cols-3 gap-3 mt-4 text-center">
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-2xl font-bold text-green-600">{entregadasHoy.length}</p>
            <p className="text-xs text-gray-400">Viajes hoy</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-2xl font-bold text-green-600">${(cadete?.ganancias_hoy ?? 0).toLocaleString('es-AR')}</p>
            <p className="text-xs text-gray-400">Ganancias</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-2xl font-bold text-gray-700">{duracion ?? '—'}</p>
            <p className="text-xs text-gray-400">Tiempo</p>
          </div>
        </div>
      </div>

      {(disponible || enViaje) && (
        <button onClick={finalizarJornada}
          className="w-full py-4 rounded-2xl border-2 border-red-400 text-red-500 font-bold hover:bg-red-50 transition-colors">
          Finalizar jornada
        </button>
      )}
    </div>
  );

  if (page === 'pedidos') return (
    <div>
      <h2 className="text-xl font-bold mb-4">Mis pedidos</h2>
      {ordenes.length === 0
        ? <Empty texto="Todavía no realizaste pedidos" />
        : <div className="space-y-2">
            {ordenes.map(o => (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{o.cliente_nombre ?? o.descripcion ?? '—'}</p>
                  <p className="text-xs text-gray-400">{new Date(o.creado_en).toLocaleDateString('es-AR')}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600">${(o.precio ?? 0).toLocaleString('es-AR')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${o.estado === 'entregada' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{o.estado}</span>
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );

  // ── INICIO ──
  return (
    <div className="space-y-5 max-w-lg mx-auto">
      {/* Notificaciones de pedidos (overlay) — solo cuando está disponible */}
      {disponible && (
        <NotificacionesPedidos
          cadete={{ id: perfil.id, zona: cadete?.zona ?? 'ciudad_colon' }}
          onAceptar={() => cargarDatos()}
        />
      )}

      {/* ── Pedido en curso ── */}
      {ordenActiva && (
        <PedidoEnCurso
          orden={ordenActiva}
          cargando={cambiandoEstado}
          onEnCamino={marcarEnCamino}
          onEntregado={marcarEntregado}
        />
      )}

      {/* Estado del cadete */}
      {!ordenActiva && (
        <div className={`rounded-2xl p-5 border-2 transition-colors ${disponible ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${disponible ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
              <div>
                <p className="font-bold text-lg">{disponible ? 'Disponible' : 'Offline'}</p>
                <p className="text-sm text-gray-500">Hola, {perfil.nombre?.split(' ')[0]} 👋</p>
              </div>
            </div>
            <button onClick={toggleEstado} disabled={cambiandoEstado}
              className={`px-4 py-2 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60
                ${disponible ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-green-600 text-white hover:bg-green-700'}`}>
              {cambiandoEstado ? '...' : disponible ? 'Pausar' : 'Activarme'}
            </button>
          </div>
          {duracion && <p className="text-sm text-gray-500 mt-3">⏱ Tiempo activo: <strong>{duracion}</strong></p>}
        </div>
      )}

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Viajes hoy"    value={entregadasHoy.length} />
        <MiniStat label="Ganancias hoy" value={`$${(cadete?.ganancias_hoy ?? 0).toLocaleString('es-AR')}`} highlight />
        <MiniStat label="Este mes"      value={`$${(cadete?.ganancias_mes ?? 0).toLocaleString('es-AR')}`} />
      </div>

      {/* Últimos viajes */}
      {ordenes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold mb-3">Últimos viajes</h3>
          <div className="space-y-2">
            {ordenes.slice(0, 5).map(o => (
              <div key={o.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-semibold">{o.cliente_nombre ?? o.descripcion ?? '—'}</p>
                  <p className="text-xs text-gray-400">{new Date(o.creado_en).toLocaleDateString('es-AR')}</p>
                </div>
                <p className="font-bold text-green-600 text-sm">${(o.precio ?? 0).toLocaleString('es-AR')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pedido en curso ───────────────────────────────────────────────────────────
function PedidoEnCurso({ orden, cargando, onEnCamino, onEntregado }) {
  const esParticular = orden.tipo === 'particular';
  const titulo       = esParticular ? (orden.descripcion ?? 'Pedido particular') : (orden.cliente_nombre ?? 'Pedido comercio');
  const direccion    = esParticular ? orden.origen    : orden.direccion;
  const destino      = esParticular ? orden.destino   : null;
  const enCamino     = orden.estado === 'en_camino';

  return (
    <div className="bg-white rounded-2xl border-2 border-blue-400 overflow-hidden shadow-sm">
      <div className="bg-blue-600 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-blue-100 text-xs font-semibold uppercase tracking-wide">Pedido en curso</p>
          <p className="text-white font-bold text-lg mt-0.5 line-clamp-1">{titulo}</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-semibold
          ${enCamino ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-700'}`}>
          {enCamino ? '🚴 En camino' : '✅ Asignado'}
        </span>
      </div>

      <div className="px-5 py-4 space-y-3">
        {direccion && (
          <Fila icono="📍" label={esParticular ? 'Desde' : 'Dirección'} valor={direccion} />
        )}
        {destino && (
          <Fila icono="🏁" label="Hasta" valor={destino} />
        )}
        {orden.zona_label && !esParticular && (
          <Fila icono="🗺️" label="Zona" valor={orden.zona_label} />
        )}
        {orden.precio && (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
            <span className="text-sm font-semibold text-green-700">Ganás</span>
            <span className="text-2xl font-bold text-green-700">
              ${orden.precio.toLocaleString('es-AR')}
            </span>
          </div>
        )}
      </div>

      <div className={`px-5 pb-5 grid gap-3 ${enCamino ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {!enCamino && (
          <button
            onClick={onEnCamino}
            disabled={cargando}
            className="py-3 rounded-xl bg-blue-100 text-blue-700 font-bold text-sm
              hover:bg-blue-200 active:scale-95 transition-all disabled:opacity-60"
          >
            🚴 Salí a entregar
          </button>
        )}
        <button
          onClick={onEntregado}
          disabled={cargando}
          className="py-3 rounded-xl bg-green-600 text-white font-bold text-sm
            hover:bg-green-700 active:scale-95 transition-all disabled:opacity-60"
        >
          {cargando ? 'Procesando...' : '✓ Entregado'}
        </button>
      </div>
    </div>
  );
}

function Fila({ icono, label, valor }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-base mt-0.5">{icono}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-sm text-gray-800 font-semibold truncate">{valor}</p>
      </div>
    </div>
  );
}
function GanCard({ label, value, viajes }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-bold text-green-600">${value.toLocaleString('es-AR')}</p>
      <p className="text-xs text-gray-400 mt-1">{viajes} viajes</p>
    </div>
  );
}
function MiniStat({ label, value, highlight }) {
  return (
    <div className={`rounded-2xl p-3 text-center border ${highlight ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
      <p className={`font-bold text-lg ${highlight ? 'text-green-600' : 'text-gray-800'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}
function Empty({ texto }) {
  return <p className="text-sm text-gray-400 text-center py-10">{texto}</p>;
}
function Spinner() {
  return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"/></div>;
}
