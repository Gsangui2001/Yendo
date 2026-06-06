import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import NotificacionesPedidos from '../../components/Cadete/NotificacionesPedidos';

export default function CadeteApp({ perfil, page }) {
  const [cadete,          setCadete]          = useState(null);
  const [ordenes,         setOrdenes]         = useState([]);
  const [ordenActiva,     setOrdenActiva]     = useState(null);
  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [aceptandoId,     setAceptandoId]     = useState(null);

  useEffect(() => { cargarDatos(); }, [perfil]);

  // Actualizar pedidos pendientes en tiempo real
  useEffect(() => {
    cargarPendientes();
    const ch = supabase.channel('cadete-pendientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, cargarPendientes)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function cargarPendientes() {
    const { data } = await supabase
      .from('ordenes').select('*').eq('estado', 'pendiente')
      .order('creado_en', { ascending: true });
    setPedidosPendientes(data ?? []);
  }

  async function aceptarPedido(orden) {
    if (aceptandoId) return;
    setAceptandoId(orden.id);
    const { data, error } = await supabase.from('ordenes')
      .update({ estado: 'asignada', cadete_id: perfil.id, asignada_en: new Date().toISOString() })
      .eq('id', orden.id).eq('estado', 'pendiente') // solo si sigue pendiente
      .select().single();
    if (error || !data) {
      alert('Este pedido ya fue tomado por otro cadete.');
    } else {
      await supabase.from('cadetes').update({ estado: 'en_viaje' }).eq('id', perfil.id);
      await cargarDatos();
      await cargarPendientes();
    }
    setAceptandoId(null);
  }

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
    <GananciasView cadete={cadete} ordenesHoy={ordenesHoy} ordenes={ordenes} perfil={perfil} />
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
  const objetivo = 30000;
  const progreso = Math.min(((cadete?.ganancias_hoy ?? 0) / objetivo) * 100, 100);
  return (
    <div className="space-y-5 max-w-xl mx-auto">
      {disponible && (
        <NotificacionesPedidos cadete={{ id: perfil.id, zona: cadete?.zona ?? 'ciudad_colon' }} onAceptar={() => cargarDatos()} />
      )}

      {/* Toggle Disponible (estilo mockup) */}
      <div className={`rounded-2xl p-5 transition-colors ${disponible || enViaje ? 'bg-green-50 border-2 border-green-500' : 'bg-white border-2 border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${disponible ? 'bg-green-500 animate-pulse' : enViaje ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
            <div>
              <p className="font-extrabold text-lg text-gray-900">{disponible ? 'Disponible' : enViaje ? 'En viaje' : 'Offline'}</p>
              <p className="text-sm text-gray-500">{duracion ? `Conectado hace ${duracion}` : `Hola, ${perfil.nombre?.split(' ')[0]} 👋`}</p>
            </div>
          </div>
          {/* Switch */}
          {!enViaje && (
            <button onClick={toggleEstado} disabled={cambiandoEstado}
              className={`relative w-14 h-8 rounded-full transition-colors disabled:opacity-60 ${disponible ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${disponible ? 'left-7' : 'left-1'}`} />
            </button>
          )}
        </div>
      </div>

      {/* Pedido en curso */}
      {ordenActiva && (
        <PedidoEnCurso orden={ordenActiva} cargando={cambiandoEstado} onEnCamino={marcarEnCamino} onEntregado={marcarEntregado} />
      )}

      {/* Pedidos disponibles */}
      {!ordenActiva && pedidosPendientes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <p className="font-bold text-gray-900">{pedidosPendientes.length} pedido{pedidosPendientes.length > 1 ? 's' : ''} disponible{pedidosPendientes.length > 1 ? 's' : ''}</p>
          </div>
          {pedidosPendientes.map(o => (
            <div key={o.id} className="bg-white border-2 border-green-500 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center text-xl">{o.tipo === 'particular' ? '📦' : '🍔'}</div>
                  <div>
                    <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">⚡ Nuevo pedido</span>
                    <p className="font-bold text-gray-900 mt-1">{o.cliente_nombre ?? o.descripcion ?? '—'}</p>
                    <p className="text-sm text-gray-500">{o.zona_label ?? o.origen ?? '—'}</p>
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-green-600">${(o.precio ?? 0).toLocaleString('es-AR')}</p>
              </div>
              <button onClick={() => aceptarPedido(o)} disabled={!!aceptandoId}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-60 transition-colors">
                {aceptandoId === o.id ? 'Aceptando...' : 'Aceptar pedido'}
              </button>
            </div>
          ))}
        </div>
      )}

      {!ordenActiva && pedidosPendientes.length === 0 && disponible && (
        <div className="bg-gray-50 rounded-2xl p-6 text-center border border-gray-100">
          <p className="text-3xl mb-2">🛵</p>
          <p className="text-gray-400 text-sm">Esperando pedidos cercanos...</p>
        </div>
      )}

      {/* Resumen de hoy */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-bold text-gray-900 mb-4">Resumen de hoy</h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><p className="text-xl font-extrabold text-green-600">${(cadete?.ganancias_hoy ?? 0).toLocaleString('es-AR')}</p><p className="text-xs text-gray-400">Ganancias</p></div>
          <div><p className="text-xl font-extrabold text-gray-900">{entregadasHoy.length}</p><p className="text-xs text-gray-400">Viajes</p></div>
          <div><p className="text-xl font-extrabold text-gray-900">$0</p><p className="text-xs text-gray-400">Propinas</p></div>
          <div><p className="text-xl font-extrabold text-amber-500">4.9★</p><p className="text-xs text-gray-400">Calif.</p></div>
        </div>
      </div>

      {/* Objetivo diario */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-gray-900 flex items-center gap-2">🎯 Objetivo diario</p>
          <p className="text-sm font-bold text-green-600">{Math.round(progreso)}%</p>
        </div>
        <p className="text-sm text-gray-500 mb-3">${(cadete?.ganancias_hoy ?? 0).toLocaleString('es-AR')} / ${objetivo.toLocaleString('es-AR')}</p>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progreso}%` }} />
        </div>
      </div>

      {/* Actividad reciente */}
      {ordenes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold mb-3">Actividad reciente</h3>
          <div className="space-y-2">
            {ordenes.slice(0, 5).map(o => (
              <div key={o.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${o.estado === 'entregada' ? 'bg-green-500' : 'bg-blue-400'}`} />
                  <div>
                    <p className="text-sm font-semibold">{o.cliente_nombre ?? o.descripcion ?? '—'}</p>
                    <p className="text-xs text-gray-400">{new Date(o.creado_en).toLocaleDateString('es-AR')}</p>
                  </div>
                </div>
                <p className="font-bold text-green-600 text-sm">+${(o.precio ?? 0).toLocaleString('es-AR')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vista Ganancias (estilo mockup) ───────────────────────────────────────────
function GananciasView({ cadete, ordenesHoy, ordenes }) {
  const [periodo, setPeriodo] = useState('hoy');
  const valores = {
    hoy:    { gan: cadete?.ganancias_hoy ?? 0,    viajes: cadete?.viajes_hoy ?? 0 },
    semana: { gan: cadete?.ganancias_semana ?? 0, viajes: cadete?.viajes_semana ?? 0 },
    mes:    { gan: cadete?.ganancias_mes ?? 0,    viajes: cadete?.viajes_mes ?? 0 },
    año:    { gan: (cadete?.ganancias_mes ?? 0) * 12, viajes: (cadete?.viajes_mes ?? 0) * 12 },
  };
  const v = valores[periodo];
  const promedio = v.viajes ? Math.round(v.gan / v.viajes) : 0;
  const barras = [30, 46, 40, 62, 54, 78, 100, 70, 48, 60];

  return (
    <div className="space-y-5 max-w-xl mx-auto">
      <h2 className="text-2xl font-extrabold text-gray-900">Ganancias</h2>

      {/* Tabs período */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {[['hoy','Hoy'],['semana','Semana'],['mes','Mes'],['año','Año']].map(([k,l]) => (
          <button key={k} onClick={() => setPeriodo(k)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${periodo===k?'bg-white text-gray-900 shadow-sm':'text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {/* Card grande verde */}
      <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-1"><p className="text-green-100 text-sm">Ganancias {periodo}</p><span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Detalles</span></div>
        <p className="text-4xl font-extrabold">${v.gan.toLocaleString('es-AR')}</p>
        {/* sparkline */}
        <svg viewBox="0 0 120 30" className="w-full h-10 mt-3"><path d="M0 25 L20 20 L40 22 L60 14 L80 16 L100 6 L120 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.8"/></svg>
      </div>

      {/* Stats breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center"><p className="text-xl font-extrabold text-gray-900">{v.viajes}</p><p className="text-xs text-gray-400">Viajes</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center"><p className="text-xl font-extrabold text-green-600">${promedio.toLocaleString('es-AR')}</p><p className="text-xs text-gray-400">Prom. viaje</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center"><p className="text-xl font-extrabold text-gray-900">$0</p><p className="text-xs text-gray-400">Propinas</p></div>
      </div>

      {/* Gráfico barras */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-bold mb-4">Evolución de ganancias</h3>
        <div className="flex items-end justify-between gap-1.5 h-32">
          {barras.map((h, i) => <div key={i} className="flex-1 bg-green-500 rounded-t-md" style={{ height: `${h}%`, opacity: 0.4 + (h/100)*0.6 }} />)}
        </div>
      </div>

      {/* Resumen */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-bold mb-3">Resumen</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Ganancias por viajes</span><span className="font-bold">${v.gan.toLocaleString('es-AR')}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Propinas</span><span className="font-bold">$0</span></div>
          <div className="flex justify-between border-t border-gray-100 pt-2 mt-2"><span className="font-bold text-gray-900">Total</span><span className="text-xl font-extrabold text-green-600">${v.gan.toLocaleString('es-AR')}</span></div>
        </div>
      </div>

      {/* Pedidos del período */}
      {ordenesHoy.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold mb-3">Pedidos de hoy</h3>
          <div className="space-y-2">
            {ordenesHoy.map(o => (
              <div key={o.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <div><p className="font-semibold text-sm">{o.cliente_nombre ?? o.descripcion ?? '—'}</p><p className="text-xs text-gray-400">{o.zona_label ?? o.origen ?? '—'}</p></div>
                <p className="font-bold text-green-600">+${(o.precio ?? 0).toLocaleString('es-AR')}</p>
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
