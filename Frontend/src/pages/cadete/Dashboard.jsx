import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { AssignmentModal } from '../../features/notifications/AssignmentModal';
import { useGeolocation } from '../../features/tracking/useGeolocation';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { apiFetch } from '../../lib/api';

function fmt(n) { return `$${Number(n ?? 0).toLocaleString('es-AR')}`; }
function fmtFecha(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function CadeteApp({ perfil, page }) {
  const [cadete,      setCadete]      = useState(null);
  const [ordenes,     setOrdenes]     = useState([]);
  const [ordenActiva, setOrdenActiva] = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [accion,      setAccion]      = useState(false);

  const gpsActivo = cadete?.estado === 'disponible' || cadete?.estado === 'en_viaje';
  useGeolocation(perfil?.id, gpsActivo);

  useEffect(() => { if (perfil?.id) cargarDatos(); }, [perfil?.id]);

  // Realtime: orden activa del cadete
  useEffect(() => {
    if (!ordenActiva?.id) return;
    const ch = supabase
      .channel(`orden-activa-${ordenActiva.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'ordenes',
        filter: `id=eq.${ordenActiva.id}`,
      }, ({ new: upd }) => {
        if (['entregada', 'cancelada'].includes(upd.estado)) {
          setOrdenActiva(null);
          cargarDatos();
        } else {
          setOrdenActiva(upd);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [ordenActiva?.id]);

  async function cargarDatos() {
    setLoading(true);
    const [{ data: cad }, { data: activa }, { data: ords }] = await Promise.all([
      supabase.from('cadetes').select('*').eq('id', perfil.id).single(),
      supabase.from('ordenes').select('*').eq('cadete_id', perfil.id)
        .in('estado', ['asignada', 'en_camino']).order('asignada_en', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ordenes').select('*').eq('cadete_id', perfil.id)
        .order('creado_en', { ascending: false }).limit(50),
    ]);
    setCadete(cad);
    setOrdenActiva(activa ?? null);
    setOrdenes(ords ?? []);
    setLoading(false);
  }

  async function toggleEstado() {
    if (!cadete || accion) return;
    setAccion(true);
    const nuevoEstado = cadete.estado === 'disponible' ? 'offline' : 'disponible';
    try {
      const res = await apiFetch(`/api/cadetes/${perfil.id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      const data = await res.json();
      if (res.ok) setCadete((prev) => ({ ...prev, ...data }));
    } catch {}
    setAccion(false);
  }

  async function marcarEnCamino() {
    if (!ordenActiva || accion) return;
    setAccion(true);
    try {
      const res = await apiFetch(`/api/ordenes/${ordenActiva.id}/en_camino`, {
        method: 'PATCH',
        body: JSON.stringify({ cadete_id: perfil.id }),
      });
      if (res.ok) setOrdenActiva(await res.json());
    } catch {}
    setAccion(false);
  }

  async function marcarEntregado() {
    if (!ordenActiva || accion) return;
    if (!window.confirm('¿Confirmar entrega del pedido?')) return;
    setAccion(true);
    try {
      const res = await apiFetch(`/api/ordenes/${ordenActiva.id}/entregar`, {
        method: 'PATCH',
        body: JSON.stringify({ cadete_id: perfil.id }),
      });
      if (res.ok) {
        setOrdenActiva(null);
        await cargarDatos();
      }
    } catch {}
    setAccion(false);
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <Spinner size="lg" />
    </div>
  );

  const hoy          = new Date().toISOString().slice(0, 10);
  const ordenesHoy   = ordenes.filter((o) => o.creado_en?.startsWith(hoy));
  const entregadasHoy = ordenesHoy.filter((o) => o.estado === 'entregada');
  const disponible   = cadete?.estado === 'disponible';
  const enViaje      = cadete?.estado === 'en_viaje';

  let duracion = null;
  if (cadete?.jornada_inicio) {
    const mins = Math.floor((Date.now() - new Date(cadete.jornada_inicio)) / 60000);
    duracion = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  if (page === 'ganancias') return <GananciasView cadete={cadete} ordenes={ordenes} />;
  if (page === 'jornada')   return <JornadaView cadete={cadete} disponible={disponible} enViaje={enViaje} duracion={duracion} toggleEstado={toggleEstado} accion={accion} />;
  if (page === 'historial') return <HistorialView ordenes={ordenes} />;

  // ── Inicio ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* Modal de asignación (siempre montado cuando el cadete no está offline) */}
      {cadete?.estado !== 'offline' && (
        <AssignmentModal
          cadete={{ id: perfil.id, zona: cadete?.zona }}
          onAceptar={() => cargarDatos()}
        />
      )}

      <div className="space-y-4 animate-fade-in max-w-lg mx-auto">
        {/* Estado */}
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative flex">
                <span className={['relative inline-flex rounded-full h-3 w-3', disponible ? 'bg-green-500' : enViaje ? 'bg-blue-500' : 'bg-gray-300'].join(' ')} />
                {(disponible || enViaje) && (
                  <span className={['animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', disponible ? 'bg-green-400' : 'bg-blue-400'].join(' ')} />
                )}
              </div>
              <div>
                <p className="font-bold text-gray-900">{cadete?.nombre ?? perfil?.nombre}</p>
                <p className="text-xs text-gray-500">
                  {disponible ? 'Disponible' : enViaje ? 'En viaje' : 'Offline'}
                  {duracion && ` · ${duracion}`}
                </p>
              </div>
            </div>
            <button
              onClick={toggleEstado}
              disabled={accion || enViaje}
              className={[
                'relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none disabled:opacity-50',
                disponible || enViaje ? 'bg-green-500' : 'bg-gray-300',
              ].join(' ')}
            >
              <span className={['absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-300', disponible || enViaje ? 'translate-x-6' : 'translate-x-0.5'].join(' ')} />
            </button>
          </div>
        </Card>

        {/* Stats hoy */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Viajes hoy', value: cadete?.viajes_hoy ?? 0 },
            { label: 'Entregas hoy', value: entregadasHoy.length },
            { label: 'Ganancia hoy', value: fmt(cadete?.ganancias_hoy) },
          ].map((s, i) => (
            <Card key={i} className="text-center py-3">
              <p className="text-xl font-extrabold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Pedido en curso */}
        {ordenActiva && (
          <PedidoEnCurso
            orden={ordenActiva}
            accion={accion}
            onEnCamino={marcarEnCamino}
            onEntregar={marcarEntregado}
          />
        )}

        {/* Esperando pedidos */}
        {disponible && !ordenActiva && (
          <Card className="text-center py-8">
            <div className="text-4xl mb-3 animate-float">🛵</div>
            <p className="font-semibold text-gray-700">Esperando pedidos...</p>
            <p className="text-sm text-gray-400 mt-1">Te llegará una notificación automáticamente</p>
          </Card>
        )}

        {/* Offline */}
        {!disponible && !enViaje && (
          <Card className="text-center py-8 border-dashed">
            <p className="text-3xl mb-3">😴</p>
            <p className="font-semibold text-gray-600">Estás offline</p>
            <p className="text-sm text-gray-400 mt-1">Activá el toggle para empezar a recibir pedidos</p>
          </Card>
        )}
      </div>
    </>
  );
}

function PedidoEnCurso({ orden, accion, onEnCamino, onEntregar }) {
  const estadoColor = orden.estado === 'en_camino' ? 'bg-blue-500' : 'bg-green-500';

  return (
    <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 animate-bounce-in">
      <div className={['rounded-xl px-3 py-2 text-white text-xs font-semibold mb-3 inline-block', estadoColor].join(' ')}>
        {orden.estado === 'en_camino' ? '🚴 En camino' : '✅ Asignado — preparate'}
      </div>

      <div className="space-y-1.5 text-sm mb-4">
        <p className="font-bold text-gray-900 text-base">{orden.cliente_nombre ?? orden.descripcion ?? 'Pedido'}</p>
        <p className="text-gray-600">📍 {orden.direccion ?? orden.destino}</p>
        {orden.zona_label && <p className="text-gray-500">🗺️ {orden.zona_label}</p>}
        <p className="text-gray-700 font-semibold">
          💰 {`$${Number(orden.precio ?? 0).toLocaleString('es-AR')}`}
          <span className="text-green-600 font-normal text-xs ml-1">
            (tuyo: {`$${Math.round((orden.precio ?? 0) * 0.82).toLocaleString('es-AR')}`})
          </span>
        </p>
        <p className="text-gray-500">
          {orden.metodo_pago === 'efectivo' ? '💵' : '💳'} {orden.metodo_pago ?? 'efectivo'}
        </p>
      </div>

      <div className="flex gap-2">
        {orden.estado === 'asignada' && (
          <Button onClick={onEnCamino} loading={accion} fullWidth variant="outline">
            🚴 Salí a entregar
          </Button>
        )}
        <Button onClick={onEntregar} loading={accion} fullWidth>
          ✓ Entregado
        </Button>
      </div>
    </Card>
  );
}

function GananciasView({ cadete, ordenes }) {
  const [tab, setTab] = useState('hoy');
  const hoy = new Date().toISOString().slice(0, 10);

  const periodos = {
    hoy:    { label: 'Hoy',     ganancia: cadete?.ganancias_hoy,    viajes: cadete?.viajes_hoy },
    semana: { label: 'Semana',  ganancia: cadete?.ganancias_semana, viajes: cadete?.viajes_semana },
    mes:    { label: 'Mes',     ganancia: cadete?.ganancias_mes,    viajes: cadete?.viajes_mes },
  };

  const entregadas = ordenes.filter((o) => o.estado === 'entregada' && (tab === 'hoy' ? o.creado_en?.startsWith(hoy) : true));
  const p = periodos[tab];

  return (
    <div className="space-y-4 animate-fade-in max-w-lg mx-auto">
      <h2 className="text-2xl font-extrabold text-gray-900">Mis ganancias</h2>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
        {Object.entries(periodos).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={['flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all', tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="text-center py-4">
          <p className="text-2xl font-extrabold text-green-600">${Number(p.ganancia ?? 0).toLocaleString('es-AR')}</p>
          <p className="text-xs text-gray-500 mt-1">Ganancia neta (82%)</p>
        </Card>
        <Card className="text-center py-4">
          <p className="text-2xl font-extrabold text-gray-900">{p.viajes ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">Viajes</p>
        </Card>
      </div>

      {/* Detalle */}
      <Card>
        <h3 className="font-semibold text-gray-700 mb-3 text-sm">Detalle de entregas</h3>
        {entregadas.length === 0
          ? <p className="text-sm text-gray-400 text-center py-4">Sin entregas en este período</p>
          : (
            <div className="space-y-2">
              {entregadas.slice(0, 20).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="font-medium text-gray-700 truncate max-w-[180px]">{o.cliente_nombre ?? o.descripcion ?? 'Pedido'}</p>
                    <p className="text-xs text-gray-400">{fmtFecha(o.entregada_en)}</p>
                  </div>
                  <span className="text-green-600 font-bold">${Math.round((o.ganancia_cadete ?? o.precio * 0.82) ?? 0).toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>
          )
        }
      </Card>
    </div>
  );
}

function JornadaView({ cadete, disponible, enViaje, duracion, toggleEstado, accion }) {
  return (
    <div className="space-y-4 max-w-lg mx-auto animate-fade-in">
      <h2 className="text-2xl font-extrabold text-gray-900">Mi jornada</h2>

      <Card className={disponible || enViaje ? 'border-2 border-green-300 bg-green-50' : ''}>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex">
            <span className={['relative inline-flex rounded-full h-3 w-3', disponible ? 'bg-green-500' : enViaje ? 'bg-blue-500' : 'bg-gray-300'].join(' ')} />
            {(disponible || enViaje) && (
              <span className={['animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', disponible ? 'bg-green-400' : 'bg-blue-400'].join(' ')} />
            )}
          </div>
          <span className="font-bold text-gray-900 text-lg">
            {disponible ? 'Disponible' : enViaje ? 'En viaje' : 'Offline'}
          </span>
        </div>

        {duracion && <p className="text-sm text-gray-500 mb-3">⏱ Tiempo activo: <strong>{duracion}</strong></p>}

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Hoy', value: cadete?.viajes_hoy ?? 0 },
            { label: 'Semana', value: cadete?.viajes_semana ?? 0 },
            { label: 'Mes', value: cadete?.viajes_mes ?? 0 },
          ].map((s) => (
            <div key={s.label} className="text-center bg-white rounded-xl p-3 border border-gray-100">
              <p className="text-xl font-extrabold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        <Button
          onClick={toggleEstado}
          loading={accion}
          disabled={enViaje}
          variant={disponible ? 'danger' : 'primary'}
          fullWidth
        >
          {disponible ? '⏹ Pausar jornada' : '▶ Iniciar jornada'}
        </Button>
      </Card>
    </div>
  );
}

function HistorialView({ ordenes }) {
  const estadoColor = { entregada: 'green', asignada: 'blue', en_camino: 'blue', pendiente: 'yellow', cancelada: 'red' };

  return (
    <div className="space-y-3 animate-fade-in max-w-lg mx-auto">
      <h2 className="text-2xl font-extrabold text-gray-900">Historial</h2>
      {ordenes.length === 0
        ? <Card><p className="text-center text-gray-400 py-6">Sin pedidos aún</p></Card>
        : ordenes.map((o) => (
          <Card key={o.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{o.cliente_nombre ?? o.descripcion ?? 'Pedido'}</p>
                <p className="text-xs text-gray-500 truncate">{o.direccion ?? o.destino}</p>
                <p className="text-xs text-gray-400 mt-0.5">{fmtFecha(o.creado_en)}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge color={estadoColor[o.estado] ?? 'gray'}>{o.estado}</Badge>
                <span className="text-green-600 font-bold text-sm">
                  ${Math.round((o.ganancia_cadete ?? (o.precio ?? 0) * 0.82)).toLocaleString('es-AR')}
                </span>
              </div>
            </div>
          </Card>
        ))
      }
    </div>
  );
}
