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
    <div className="space-y-4 max-w-md mx-auto animate-fade-in">
      <h2 className="text-2xl font-extrabold text-gray-900">Mi jornada</h2>
      <div className={`rounded-2xl p-6 border-2 shadow-sm transition-all ${disponible || enViaje ? 'border-green-400 bg-gradient-to-br from-green-50 to-emerald-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex">
            <span className={`relative inline-flex rounded-full h-3 w-3 ${disponible ? 'bg-green-500' : enViaje ? 'bg-blue-500' : 'bg-gray-300'}`} />
            {(disponible || enViaje) && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${disponible ? 'bg-green-400' : 'bg-blue-400'}`} />
            )}
          </div>
          <span className="font-extrabold text-lg text-gray-900">
            {disponible ? 'Disponible' : enViaje ? 'En viaje' : 'Offline'}
          </span>
        </div>
        {duracion && <p className="text-sm text-gray-500 mb-1">⏱ Tiempo activo: <strong>{duracion}</strong></p>}
        <div className="grid grid-cols-3 gap-3 mt-4 text-center">
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-2xl font-extrabold text-green-600">{entregadasHoy.length}</p>
            <p className="text-xs text-gray-400">Viajes hoy</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-2xl font-extrabold text-green-600">${(cadete?.ganancias_hoy ?? 0).toLocaleString('es-AR')}</p>
            <p className="text-xs text-gray-400">Ganancias</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <p className="text-2xl font-extrabold text-gray-700">{duracion ?? '—'}</p>
            <p className="text-xs text-gray-400">Tiempo</p>
          </div>
        </div>
      </div>

      {(disponible || enViaje) && (
        <button onClick={finalizarJornada}
          className="w-full py-4 rounded-2xl border-2 border-red-300 text-red-500 font-bold transition-all duration-200 hover:bg-red-50 hover:border-red-400 hover:-translate-y-0.5 hover:shadow-md active:scale-95">
          Finalizar jornada
        </button>
      )}
    </div>
  );

  if (page === 'pedidos') return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-extrabold text-gray-900 mb-5">Mis pedidos</h2>
      {ordenes.length === 0
        ? <Empty texto="Todavía no realizaste pedidos" />
        : <div className="space-y-2 stagger">
            {ordenes.map((o, i) => (
              <div key={o.id} style={{ animationDelay: `${i * 40}ms` }}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex justify-between items-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-gray-200 animate-slide-up">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${o.estado === 'entregada' ? 'bg-green-500' : 'bg-blue-400'}`} />
                  <div>
                    <p className="font-semibold text-gray-800">{o.cliente_nombre ?? o.descripcion ?? '—'}</p>
                    <p className="text-xs text-gray-400">{new Date(o.creado_en).toLocaleDateString('es-AR')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-green-600">+${(o.precio ?? 0).toLocaleString('es-AR')}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${o.estado === 'entregada' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{o.estado}</span>
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
    <div className="space-y-5 max-w-xl mx-auto animate-fade-in">
      {disponible && (
        <NotificacionesPedidos cadete={{ id: perfil.id, zona: cadete?.zona ?? 'ciudad_colon' }} onAceptar={() => cargarDatos()} />
      )}

      {/* Toggle Disponible */}
      <div className={`rounded-2xl p-5 transition-all duration-300 shadow-sm ${disponible || enViaje ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-400' : 'bg-white border-2 border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex">
              <span className={`relative inline-flex rounded-full h-3 w-3 ${disponible ? 'bg-green-500' : enViaje ? 'bg-blue-500' : 'bg-gray-300'}`} />
              {(disponible || enViaje) && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${disponible ? 'bg-green-400' : 'bg-blue-400'}`} />
              )}
            </div>
            <div>
              <p className="font-extrabold text-lg text-gray-900">{disponible ? 'Disponible' : enViaje ? 'En viaje' : 'Offline'}</p>
              <p className="text-sm text-gray-500">{duracion ? `Conectado hace ${duracion}` : `Hola, ${perfil.nombre?.split(' ')[0]} 👋`}</p>
            </div>
          </div>
          {!enViaje && (
            <button
              onClick={toggleEstado}
              disabled={cambiandoEstado}
              className={`relative w-14 h-8 rounded-full transition-all duration-300 disabled:opacity-60 shadow-inner active:scale-95 ${disponible ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${disponible ? 'left-7' : 'left-1'}`} />
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
            <div className="relative flex">
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            </div>
            <p className="font-bold text-gray-900">{pedidosPendientes.length} pedido{pedidosPendientes.length > 1 ? 's' : ''} disponible{pedidosPendientes.length > 1 ? 's' : ''}</p>
          </div>
          {pedidosPendientes.map((o, i) => (
            <div key={o.id} style={{ animationDelay: `${i * 60}ms` }}
              className="bg-white border-2 border-green-400 rounded-2xl p-4 shadow-md animate-bounce-in transition-all duration-200 hover:shadow-lift hover:border-green-500">
              <div className="flex items-start justify-between mb-3">
                <div className="flex gap-3">
                  <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center text-xl transition-transform hover:scale-110">
                    {o.tipo === 'particular' ? '📦' : '🍔'}
                  </div>
                  <div>
                    <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">⚡ Nuevo pedido</span>
                    <p className="font-bold text-gray-900 mt-1">{o.cliente_nombre ?? o.descripcion ?? '—'}</p>
                    <p className="text-sm text-gray-500">{o.zona_label ?? o.origen ?? '—'}</p>
                  </div>
                </div>
                <p className="text-2xl font-extrabold text-green-600">${(o.precio ?? 0).toLocaleString('es-AR')}</p>
              </div>
              <button
                onClick={() => aceptarPedido(o)}
                disabled={!!aceptandoId}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-xl font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow-md disabled:opacity-60 active:scale-95 ripple"
              >
                {aceptandoId === o.id ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Aceptando...
                  </span>
                ) : 'Aceptar pedido'}
              </button>
            </div>
          ))}
        </div>
      )}

      {!ordenActiva && pedidosPendientes.length === 0 && disponible && (
        <div className="bg-gray-50 rounded-2xl p-8 text-center border border-gray-100">
          <p className="text-4xl mb-3 animate-float inline-block">🛵</p>
          <p className="text-gray-400 text-sm font-medium">Esperando pedidos cercanos...</p>
          <p className="text-xs text-gray-300 mt-1">Te avisamos cuando llegue uno</p>
        </div>
      )}

      {/* Resumen de hoy */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-4">Resumen de hoy</h3>
        <div className="grid grid-cols-4 gap-2 text-center stagger">
          <div className="bg-green-50 rounded-xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm animate-slide-up">
            <p className="text-xl font-extrabold text-green-600">${(cadete?.ganancias_hoy ?? 0).toLocaleString('es-AR')}</p>
            <p className="text-xs text-gray-400">Ganancias</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm animate-slide-up">
            <p className="text-xl font-extrabold text-gray-900">{entregadasHoy.length}</p>
            <p className="text-xs text-gray-400">Viajes</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm animate-slide-up">
            <p className="text-xl font-extrabold text-gray-900">$0</p>
            <p className="text-xs text-gray-400">Propinas</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm animate-slide-up">
            <p className="text-xl font-extrabold text-amber-500">4.9★</p>
            <p className="text-xs text-gray-400">Calif.</p>
          </div>
        </div>
      </div>

      {/* Objetivo diario */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-gray-900 flex items-center gap-2">🎯 Objetivo diario</p>
          <p className="text-sm font-extrabold text-green-600">{Math.round(progreso)}%</p>
        </div>
        <p className="text-sm text-gray-500 mb-3">${(cadete?.ganancias_hoy ?? 0).toLocaleString('es-AR')} / ${objetivo.toLocaleString('es-AR')}</p>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progreso}%` }}
          />
        </div>
        {progreso >= 100 && (
          <p className="text-xs text-green-600 font-bold mt-2 animate-bounce-in">🎉 ¡Objetivo alcanzado!</p>
        )}
      </div>

      {/* Actividad reciente */}
      {ordenes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="font-bold mb-4 text-gray-900">Actividad reciente</h3>
          <div className="space-y-1">
            {ordenes.slice(0, 5).map((o, i) => (
              <div key={o.id} style={{ animationDelay: `${i * 40}ms` }}
                className="flex justify-between items-center py-2.5 px-2 rounded-xl border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${o.estado === 'entregada' ? 'bg-green-500' : 'bg-blue-400'}`} />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{o.cliente_nombre ?? o.descripcion ?? '—'}</p>
                    <p className="text-xs text-gray-400">{new Date(o.creado_en).toLocaleDateString('es-AR')}</p>
                  </div>
                </div>
                <p className="font-extrabold text-green-600 text-sm">+${(o.precio ?? 0).toLocaleString('es-AR')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vista Ganancias ───────────────────────────────────────────────────────────
function GananciasView({ cadete, ordenesHoy, ordenes }) {
  const [periodo, setPeriodo] = useState('hoy');
  const valores = {
    hoy:    { gan: cadete?.ganancias_hoy ?? 0,       viajes: cadete?.viajes_hoy ?? 0 },
    semana: { gan: cadete?.ganancias_semana ?? 0,    viajes: cadete?.viajes_semana ?? 0 },
    mes:    { gan: cadete?.ganancias_mes ?? 0,       viajes: cadete?.viajes_mes ?? 0 },
    año:    { gan: (cadete?.ganancias_mes ?? 0) * 12, viajes: (cadete?.viajes_mes ?? 0) * 12 },
  };
  const v = valores[periodo];
  const promedio = v.viajes ? Math.round(v.gan / v.viajes) : 0;
  const barras = [30, 46, 40, 62, 54, 78, 100, 70, 48, 60];

  return (
    <div className="space-y-5 max-w-xl mx-auto animate-fade-in">
      <h2 className="text-2xl font-extrabold text-gray-900 animate-slide-up">Mis ganancias</h2>

      {/* Tabs período */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl animate-slide-up" style={{ animationDelay: '50ms' }}>
        {[['hoy','Hoy'],['semana','Semana'],['mes','Mes'],['año','Año']].map(([k,l]) => (
          <button key={k} onClick={() => setPeriodo(k)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${periodo===k ? 'bg-white text-gray-900 shadow-sm scale-105' : 'text-gray-500 hover:text-gray-700 active:scale-95'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Card grande verde */}
      <div className="bg-gradient-to-br from-green-600 via-green-600 to-emerald-700 rounded-2xl p-6 text-white shadow-lift-lg animate-slide-up" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-green-100 text-sm font-medium">Ganancias — {periodo}</p>
          <span className="text-xs bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full font-semibold">En pesos</span>
        </div>
        <p className="text-4xl font-extrabold tracking-tight">${v.gan.toLocaleString('es-AR')}</p>
        <svg viewBox="0 0 120 30" className="w-full h-10 mt-4 opacity-80">
          <path d="M0 25 L20 20 L40 22 L60 14 L80 16 L100 6 L120 10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 stagger">
        {[
          { label: 'Viajes', value: v.viajes, color: 'text-gray-900' },
          { label: 'Prom. viaje', value: `$${promedio.toLocaleString('es-AR')}`, color: 'text-green-600' },
          { label: 'Propinas', value: '$0', color: 'text-gray-900' },
        ].map((s, i) => (
          <div key={i} style={{ animationDelay: `${i * 60}ms` }}
            className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lift animate-slide-up">
            <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Gráfico barras */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm animate-slide-up" style={{ animationDelay: '200ms' }}>
        <h3 className="font-bold mb-4 text-gray-900">Evolución de ganancias</h3>
        <div className="flex items-end justify-between gap-1.5 h-32">
          {barras.map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-gradient-to-t from-green-600 to-green-400 rounded-t-lg transition-all duration-500 hover:opacity-100"
              style={{ height: `${h}%`, opacity: 0.4 + (h/100)*0.6, animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Resumen */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm animate-slide-up" style={{ animationDelay: '250ms' }}>
        <h3 className="font-bold mb-4 text-gray-900">Desglose</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Ganancias por viajes</span>
            <span className="font-bold text-gray-900">${v.gan.toLocaleString('es-AR')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Propinas</span>
            <span className="font-bold text-gray-900">$0</span>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-gray-100">
            <span className="font-bold text-gray-900">Total</span>
            <span className="text-xl font-extrabold text-green-600">${v.gan.toLocaleString('es-AR')}</span>
          </div>
        </div>
      </div>

      {ordenesHoy.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm animate-slide-up" style={{ animationDelay: '300ms' }}>
          <h3 className="font-bold mb-4 text-gray-900">Pedidos de hoy</h3>
          <div className="space-y-1">
            {ordenesHoy.map((o, i) => (
              <div key={o.id} style={{ animationDelay: `${i * 40}ms` }}
                className="flex justify-between items-center py-2.5 px-2 rounded-xl hover:bg-gray-50 transition-colors animate-fade-in">
                <div>
                  <p className="font-semibold text-sm text-gray-800">{o.cliente_nombre ?? o.descripcion ?? '—'}</p>
                  <p className="text-xs text-gray-400">{o.zona_label ?? o.origen ?? '—'}</p>
                </div>
                <p className="font-extrabold text-green-600">+${(o.precio ?? 0).toLocaleString('es-AR')}</p>
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
    <div className="bg-white rounded-2xl border-2 border-blue-300 overflow-hidden shadow-lift animate-bounce-in">
      {/* Header azul */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider">Pedido en curso</p>
          <p className="text-white font-extrabold text-lg mt-0.5 line-clamp-1">{titulo}</p>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5
          ${enCamino ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${enCamino ? 'bg-white animate-pulse' : 'bg-blue-500'}`} />
          {enCamino ? 'En camino' : 'Asignado'}
        </span>
      </div>

      <div className="px-5 py-4 space-y-3">
        {direccion && <Fila icono="📍" label={esParticular ? 'Desde' : 'Dirección'} valor={direccion} />}
        {destino && <Fila icono="🏁" label="Hasta" valor={destino} />}
        {orden.zona_label && !esParticular && <Fila icono="🗺️" label="Zona" valor={orden.zona_label} />}
        {orden.precio && (
          <div className="flex items-center justify-between bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl px-4 py-3">
            <span className="text-sm font-bold text-green-700">Tu ganancia</span>
            <span className="text-2xl font-extrabold text-green-700">${orden.precio.toLocaleString('es-AR')}</span>
          </div>
        )}
      </div>

      <div className={`px-5 pb-5 grid gap-3 ${enCamino ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {!enCamino && (
          <button
            onClick={onEnCamino}
            disabled={cargando}
            className="py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-sm transition-all duration-200 hover:bg-blue-100 hover:-translate-y-0.5 active:scale-95 disabled:opacity-60"
          >
            🚴 Salí a entregar
          </button>
        )}
        <button
          onClick={onEntregado}
          disabled={cargando}
          className="py-3 rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white font-bold text-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow-md active:scale-95 disabled:opacity-60 ripple"
        >
          {cargando ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Procesando...
            </span>
          ) : '✓ Entregado'}
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
