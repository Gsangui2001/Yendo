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
          // El payload de realtime trae la fila completa: el código de
          // entrega no es para el cadete, se descarta acá.
          const { codigo_entrega, ...limpia } = upd;
          setOrdenActiva(limpia);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [ordenActiva?.id]);

  async function cargarDatos() {
    setLoading(true);
    // Las órdenes van por el BACKEND: ahí se filtra el código de entrega
    // (el cadete no lo ve nunca; se lo da el cliente en mano al recibir).
    const [{ data: cad }, resOrdenes] = await Promise.all([
      supabase.from('cadetes').select('*').eq('id', perfil.id).single(),
      apiFetch('/api/ordenes').catch(() => null),
    ]);
    let mias = [];
    if (resOrdenes?.ok) {
      const todas = await resOrdenes.json().catch(() => []);
      mias = (Array.isArray(todas) ? todas : []).filter((o) => o.cadete_id === perfil.id);
      mias.sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
    }
    const activa = mias.find((o) => ['asignada', 'en_camino'].includes(o.estado)) ?? null;
    setCadete(cad);
    setOrdenActiva(activa);
    setOrdenes(mias.slice(0, 50));
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

  // Entrega con CÓDIGO: el cliente/comercio le da el código al cadete y el
  // backend lo valida. Sin código correcto no hay entrega.
  const [entrega, setEntrega] = useState(null); // { codigo, error, enviando } | null

  function abrirEntrega() {
    if (!ordenActiva || accion) return;
    setEntrega({ codigo: '', error: '', enviando: false });
  }

  async function confirmarEntrega() {
    if (!ordenActiva || !entrega || entrega.enviando) return;
    setEntrega((p) => ({ ...p, enviando: true, error: '' }));
    try {
      const res = await apiFetch(`/api/ordenes/${ordenActiva.id}/entregar`, {
        method: 'PATCH',
        body: JSON.stringify({ cadete_id: perfil.id, codigo: entrega.codigo.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEntrega((p) => ({ ...p, enviando: false, error: data?.error ?? 'No se pudo confirmar la entrega.' }));
        return;
      }
      setEntrega(null);
      setOrdenActiva(null);
      await cargarDatos();
      toast.success('¡Entrega confirmada!');
    } catch {
      setEntrega((p) => ({ ...p, enviando: false, error: 'No se pudo confirmar. Revisá tu conexión.' }));
    }
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
      {/* Modal de asignación: solo cuando está conectado Y SIN pedido en
          curso — un cadete ocupado no recibe ofertas nuevas */}
      {cadete?.estado !== 'offline' && !ordenActiva && (
        <AssignmentModal
          cadete={{ id: perfil.id, zona: cadete?.zona }}
          onAceptar={() => cargarDatos()}
        />
      )}

      {/* Modal de código de entrega */}
      {entrega && ordenActiva && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !entrega.enviando && setEntrega(null)} />
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl animate-bounce-in">
            <h3 className="text-lg font-extrabold text-gray-900">Confirmar entrega</h3>
            <p className="mt-1 text-sm text-gray-500">Pedile el código de entrega al cliente e ingresalo acá.</p>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={entrega.codigo}
              onChange={(e) => setEntrega((p) => ({ ...p, codigo: e.target.value.replace(/\D/g, ''), error: '' }))}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmarEntrega(); }}
              placeholder="0000"
              className="mt-4 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-center text-3xl font-extrabold tracking-[0.4em] text-gray-900 focus:border-green-500 focus:outline-none"
            />
            {entrega.error && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{entrega.error}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setEntrega(null)} disabled={entrega.enviando}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60">
                Cancelar
              </button>
              <button onClick={confirmarEntrega} disabled={entrega.enviando}
                className="flex-[2] rounded-xl bg-green-600 py-3 text-sm font-extrabold text-white hover:bg-green-700 active:scale-95 disabled:opacity-60">
                {entrega.enviando ? 'Verificando...' : 'Confirmar entrega'}
              </button>
            </div>
          </div>
        </div>
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
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
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
              onEntregar={abrirEntrega}
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
  const f = finanzasDe(orden);
  const destino = orden.direccion ?? orden.destino ?? orden.zona_label ?? 'Destino del pedido';

  // Ruta en Google Maps: con coordenadas exactas si el backend las guardó.
  // Si no hay coordenadas, va la dirección con provincia pero SIN forzar
  // "Colón" (el destino puede ser San José, C. del Uruguay, etc.).
  // Se abre con CLICK del cadete (los navegadores bloquean popups automáticos).
  const urlRuta = orden.destino_lat != null && orden.destino_lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${orden.destino_lat},${orden.destino_lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${destino}, Entre Ríos, Argentina`)}`;

  return (
    <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 animate-bounce-in">
      <div className={['inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-white text-xs font-bold mb-4', enCamino ? 'bg-blue-500' : 'bg-green-600'].join(' ')}>
        <Icon name={enCamino ? 'bike' : 'check'} className="w-3.5 h-3.5" />
        {enCamino ? 'En camino' : 'Asignado — preparate'}
      </div>

      {/* Destino prominente */}
      <div className="rounded-2xl bg-white p-4 mb-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600">
            <Icon name="pin" className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-400">Entregar en</p>
            <p className="text-xl font-extrabold text-gray-900 leading-snug">{destino}</p>
            {orden.distancia_km > 0 && <p className="text-xs text-gray-500 mt-0.5">{orden.distancia_km} km{orden.zona_label ? ` · ${orden.zona_label}` : ''}</p>}
          </div>
        </div>
        {/* Botón principal: abrir la ruta en Google Maps */}
        <a
          href={urlRuta}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-extrabold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95"
        >
          <Icon name="navigate" className="w-5 h-5" />
          Abrir ruta
        </a>
        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 text-sm">
          <Icon name="user" className="w-4 h-4 text-gray-400" />
          <span className="font-semibold text-gray-700 truncate">{orden.cliente_nombre ?? orden.descripcion ?? 'Cliente'}</span>
        </div>
        {orden.notas_cadete && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <Icon name="info" className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 font-medium">{orden.notas_cadete}</p>
          </div>
        )}
      </div>

      {/* Ganancia del viaje */}
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-4">
        <div>
          <p className="text-xs font-semibold text-gray-400">Tu ganancia{f.propina > 0 ? ' (82% + propina)' : ' (82%)'}</p>
          <p className="text-2xl font-extrabold text-green-600">{fmt(Math.round(f.total))}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Total a cobrar</p>
          <p className="text-sm font-bold text-gray-700">{fmt(Number(orden.total_cliente ?? orden.precio ?? 0))}</p>
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

  // Días trabajados del mes: fechas únicas con al menos una entrega
  const mesStr = new Date().toISOString().slice(0, 7);
  const diasTrabajados = [...new Set(
    ordenes
      .filter((o) => o.estado === 'entregada' && (o.entregada_en ?? o.creado_en ?? '').startsWith(mesStr))
      .map((o) => (o.entregada_en ?? o.creado_en).slice(0, 10))
  )].sort().reverse();

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

      {/* Días trabajados del mes */}
      <Card className="py-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-lg font-extrabold text-gray-900">{diasTrabajados.length} día{diasTrabajados.length === 1 ? '' : 's'}</p>
            <p className="text-[11px] text-gray-500">Trabajados este mes (con entregas)</p>
          </div>
          <div className="flex max-w-[55%] flex-wrap justify-end gap-1">
            {diasTrabajados.slice(0, 10).map((d) => (
              <span key={d} className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">
                {new Date(`${d}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
              </span>
            ))}
          </div>
        </div>
      </Card>

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
