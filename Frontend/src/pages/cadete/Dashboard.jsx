import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { AssignmentModal } from '../../features/notifications/AssignmentModal';
import { useGeolocation } from '../../features/tracking/useGeolocation';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { apiFetch } from '../../lib/api';
import { useToast, useConfirm } from '../../components/ui/feedback';
import { Icon } from '../../components/ui/Icon';
import { TrackingMap } from '../../features/tracking/TrackingMapLazy';

function fmt(n) { return `$${Number(n ?? 0).toLocaleString('es-AR')}`; }
function fmtFecha(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function fmtFechaDia(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Desglose financiero de una orden, con fallback para pedidos viejos que no
// tienen los campos de la migración 004 (calcula el split clásico 82/18).
function finanzasDe(o) {
  const envio    = Number(o.precio_envio ?? o.precio ?? 0);
  const gYendo   = Number(o.ganancia_yendo  ?? Math.round(envio * 0.18 * 100) / 100);
  const gCadete  = Number(o.ganancia_cadete ?? envio - gYendo);
  const propina  = Number(o.propina_cadete ?? 0);
  const total    = Number(o.total_cadete ?? gCadete + propina);
  const efectivo = ['efectivo', 'paga_cliente'].includes(String(o.metodo_pago ?? 'efectivo').toLowerCase());
  return {
    envio, gYendo, gCadete, propina, total, efectivo,
    rendir:    Number(o.efectivo_a_rendir        ?? (efectivo ? gYendo : 0)),
    depositar: Number(o.monto_a_depositar_cadete ?? (efectivo ? 0 : total)),
  };
}

export default function CadeteApp({ perfil, page }) {
  const toast = useToast();
  const confirm = useConfirm();
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
    const ok = await confirm({ title: 'Confirmar entrega', message: '¿Marcar este pedido como entregado?', confirmLabel: 'Sí, entregado' });
    if (!ok) return;
    setAccion(true);
    try {
      const res = await apiFetch(`/api/ordenes/${ordenActiva.id}/entregar`, {
        method: 'PATCH',
        body: JSON.stringify({ cadete_id: perfil.id }),
      });
      if (res.ok) {
        setOrdenActiva(null);
        await cargarDatos();
        toast.success('¡Entrega confirmada!');
      } else {
        toast.error('No se pudo confirmar la entrega.');
      }
    } catch {
      toast.error('No se pudo confirmar la entrega. Revisá tu conexión.');
    }
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

      <div className="space-y-4 animate-fade-in max-w-3xl mx-auto">
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
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <TrackingMap
              order={ordenActiva}
              cadete={cadete}
              height={380}
              compact
            />
            <PedidoEnCurso
              orden={ordenActiva}
              accion={accion}
              onEnCamino={marcarEnCamino}
              onEntregar={marcarEntregado}
            />
          </div>
        )}

        {/* Esperando pedidos */}
        {disponible && !ordenActiva && (
          <Card className="text-center py-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-green-600">
              <Icon name="bike" className="w-8 h-8" />
            </div>
            <p className="font-bold text-gray-800">Esperando pedidos</p>
            <p className="text-sm text-gray-400 mt-1">Apenas haya un envío en tu zona te avisamos al instante</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Conectado y disponible
            </div>
          </Card>
        )}

        {/* Offline */}
        {!disponible && !enViaje && (
          <Card className="text-center py-10 border-dashed">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
              <Icon name="power" className="w-8 h-8" />
            </div>
            <p className="font-bold text-gray-700">Estás offline</p>
            <p className="text-sm text-gray-400 mt-1">Activá tu jornada para empezar a recibir pedidos</p>
            <button onClick={toggleEstado} disabled={accion}
              className="mt-4 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60 transition-colors">
              Conectarme
            </button>
          </Card>
        )}
      </div>
    </>
  );
}

function PedidoEnCurso({ orden, accion, onEnCamino, onEntregar }) {
  const enCamino = orden.estado === 'en_camino';
  const ganancia = Math.round((orden.precio ?? 0) * 0.82);
  const destino = orden.direccion ?? orden.destino ?? orden.zona_label ?? 'Destino del pedido';

  return (
    <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 animate-bounce-in">
      <div className={['inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-white text-xs font-bold mb-4', enCamino ? 'bg-blue-500' : 'bg-green-600'].join(' ')}>
        <Icon name={enCamino ? 'bike' : 'check'} className="w-3.5 h-3.5" />
        {enCamino ? 'En camino' : 'Asignado — preparate'}
      </div>

      {/* Destino prominente */}
      <div className="rounded-2xl bg-white p-4 mb-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600">
            <Icon name="pin" className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-400">Entregar en</p>
            <p className="font-bold text-gray-900 leading-snug">{destino}</p>
            {orden.zona_label && <p className="text-xs text-gray-500 mt-0.5">{orden.zona_label}</p>}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 text-sm">
          <Icon name="user" className="w-4 h-4 text-gray-400" />
          <span className="font-semibold text-gray-700 truncate">{orden.cliente_nombre ?? orden.descripcion ?? 'Cliente'}</span>
        </div>
      </div>

      {/* Ganancia del viaje */}
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-4">
        <div>
          <p className="text-xs font-semibold text-gray-400">Tu ganancia (82%)</p>
          <p className="text-2xl font-extrabold text-green-600">${ganancia.toLocaleString('es-AR')}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Total envío</p>
          <p className="text-sm font-bold text-gray-700">${Number(orden.precio ?? 0).toLocaleString('es-AR')}</p>
          <p className="text-[11px] text-gray-400 capitalize">{orden.metodo_pago ?? 'efectivo'}</p>
        </div>
      </div>

      {/* Botones grandes */}
      <div className="flex flex-col gap-2.5">
        {orden.estado === 'asignada' && (
          <Button onClick={onEnCamino} loading={accion} fullWidth variant="outline" className="py-3.5 text-base">
            <span className="flex items-center justify-center gap-2"><Icon name="bike" className="w-5 h-5" /> Salí a entregar</span>
          </Button>
        )}
        <Button onClick={onEntregar} loading={accion} fullWidth className="py-3.5 text-base">
          <span className="flex items-center justify-center gap-2"><Icon name="check" className="w-5 h-5" /> Marcar entregado</span>
        </Button>
      </div>
    </Card>
  );
}

function GananciasView({ cadete, ordenes }) {
  const [tab, setTab] = useState('hoy');
  const hoy = new Date().toISOString().slice(0, 10);
  const hace7  = new Date(Date.now() - 7  * 86400_000).toISOString();
  const hace30 = new Date(Date.now() - 30 * 86400_000).toISOString();

  const periodos = {
    hoy:    { label: 'Hoy',     ganancia: cadete?.ganancias_hoy,    viajes: cadete?.viajes_hoy },
    semana: { label: 'Semana',  ganancia: cadete?.ganancias_semana, viajes: cadete?.viajes_semana },
    mes:    { label: 'Mes',     ganancia: cadete?.ganancias_mes,    viajes: cadete?.viajes_mes },
  };

  const enPeriodo = (o) => {
    const f = o.entregada_en ?? o.creado_en ?? '';
    if (tab === 'hoy')    return f.startsWith(hoy);
    if (tab === 'semana') return f >= hace7;
    return f >= hace30;
  };
  const entregadas = ordenes.filter((o) => o.estado === 'entregada' && enPeriodo(o));
  const p = periodos[tab];

  // Liquidación del período: propinas, efectivo a rendir y a depositar
  const liq = entregadas.reduce((acc, o) => {
    const f = finanzasDe(o);
    acc.propinas  += f.propina;
    acc.rendir    += f.rendir;
    acc.depositar += f.depositar;
    return acc;
  }, { propinas: 0, rendir: 0, depositar: 0 });

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
          <p className="text-xs text-gray-500 mt-1">Tu ganancia (82% + propinas)</p>
        </Card>
        <Card className="text-center py-4">
          <p className="text-2xl font-extrabold text-gray-900">{p.viajes ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">Viajes</p>
        </Card>
      </div>

      {/* Liquidación */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center py-3">
          <p className="text-lg font-extrabold text-violet-600">{fmt(liq.propinas)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Propinas</p>
        </Card>
        <Card className="text-center py-3">
          <p className="text-lg font-extrabold text-amber-600">{fmt(liq.rendir)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Efectivo a rendir a Yendo</p>
        </Card>
        <Card className="text-center py-3">
          <p className="text-lg font-extrabold text-blue-600">{fmt(liq.depositar)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Te deposita Yendo</p>
        </Card>
      </div>

      {/* Detalle */}
      <Card>
        <h3 className="font-semibold text-gray-700 mb-3 text-sm">Detalle de entregas</h3>
        {entregadas.length === 0
          ? <p className="text-sm text-gray-400 text-center py-4">Sin entregas en este período</p>
          : (
            <div className="space-y-2">
              {entregadas.slice(0, 20).map((o) => {
                const f = finanzasDe(o);
                return (
                  <div key={o.id} className="py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-700 truncate max-w-[190px]">{o.cliente_nombre ?? o.descripcion ?? 'Pedido'}</p>
                        <p className="text-xs text-gray-400">{fmtFechaDia(o.entregada_en)} · {f.efectivo ? 'Efectivo' : 'Online/transf.'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-green-600 font-bold">{fmt(f.total)}</p>
                        {f.propina > 0 && <p className="text-[11px] text-violet-600 font-semibold">incluye propina {fmt(f.propina)}</p>}
                      </div>
                    </div>
                    <p className={`mt-1 text-[11px] font-semibold ${f.efectivo ? 'text-amber-600' : 'text-blue-600'}`}>
                      {f.efectivo
                        ? `Cobraste ${fmt(f.envio + f.propina)} · rendís ${fmt(f.rendir)} a Yendo`
                        : `Yendo te deposita ${fmt(f.depositar)}`}
                    </p>
                  </div>
                );
              })}
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

        {duracion && (
          <p className="text-sm text-gray-500 mb-3 flex items-center gap-1.5">
            <Icon name="clock" className="w-4 h-4 text-gray-400" /> Tiempo activo: <strong className="text-gray-700">{duracion}</strong>
          </p>
        )}

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
          className="py-3 text-base"
        >
          <span className="flex items-center justify-center gap-2">
            <Icon name="power" className="w-5 h-5" />
            {disponible ? 'Pausar jornada' : 'Iniciar jornada'}
          </span>
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
        : ordenes.map((o) => {
          const f = finanzasDe(o);
          const entregada = o.estado === 'entregada';
          return (
            <Card key={o.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{o.cliente_nombre ?? o.descripcion ?? 'Pedido'}</p>
                  <p className="text-xs text-gray-500 truncate">{o.direccion ?? o.destino}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmtFechaDia(o.entregada_en ?? o.creado_en)} · {o.tipo === 'particular' ? 'Privado' : 'Comercio'} · {f.efectivo ? 'Efectivo' : 'Online/transf.'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge color={estadoColor[o.estado] ?? 'gray'}>{o.estado}</Badge>
                  <span className="text-green-600 font-bold text-sm">{fmt(f.total)}</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 border-t border-gray-50 pt-2 text-center text-[11px]">
                <div><p className="text-gray-400">Envío</p><p className="font-bold text-gray-700">{fmt(f.envio)}</p></div>
                <div><p className="text-gray-400">Yendo (18%)</p><p className="font-bold text-gray-700">{fmt(f.gYendo)}</p></div>
                <div><p className="text-gray-400">Propina</p><p className="font-bold text-violet-600">{f.propina > 0 ? fmt(f.propina) : '—'}</p></div>
              </div>
              {entregada && (
                <p className={`mt-1.5 text-[11px] font-semibold ${f.efectivo ? 'text-amber-600' : 'text-blue-600'}`}>
                  {f.efectivo
                    ? `Efectivo a rendir a Yendo: ${fmt(f.rendir)}`
                    : `A depositarte por Yendo: ${fmt(f.depositar)}`}
                </p>
              )}
            </Card>
          );
        })
      }
    </div>
  );
}
