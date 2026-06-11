import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/ui/Icon.jsx';

const TIMER_SEG   = 120; // 2 minutos

function tocarAlarma() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660 + i * 110;
      gain.gain.setValueAtTime(0.5, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.25);
    });
  } catch {}
}

/**
 * Modal de asignación de pedido para el cadete.
 * Se muestra cuando:
 *   a) La orden tiene asignado_a_id = cadete.id (asignación directa), o
 *   b) La orden tiene broadcast_en != null y el cadete está en su zona (broadcast)
 *
 * @param {object} cadete   - { id, zona }
 * @param {function} onAceptar  - callback cuando acepta (recibe la orden actualizada)
 */
export function AssignmentModal({ cadete, onAceptar }) {
  const [pedido,   setPedido]   = useState(null);
  const [segundos, setSegundos] = useState(TIMER_SEG);
  const [cargando, setCargando] = useState(false);
  const [error,    setError]    = useState('');
  const timerRef   = useRef(null);
  const alarmaRef  = useRef(false);

  const limpiar = useCallback(() => {
    clearInterval(timerRef.current);
    setPedido(null);
    setSegundos(TIMER_SEG);
    setCargando(false);
    setError('');
    alarmaRef.current = false;
  }, []);

  const mostrarPedido = useCallback((orden) => {
    // No pisar el pedido que el cadete ya está mirando con OTRO distinto:
    // podría aceptar B creyendo que es A. El siguiente llega al cerrar este.
    if (pedidoRef.current && pedidoRef.current.id !== orden.id) return;
    if (!alarmaRef.current) {
      alarmaRef.current = true;
      tocarAlarma();
    }
    setPedido(orden);
    setSegundos(TIMER_SEG);

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          // Auto-rechazo por timeout
          rechazarPedido(orden);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Suscripción Realtime: escucha asignaciones directas y broadcast
  useEffect(() => {
    if (!cadete?.id) return;

    // Buscar si ya hay una orden esperando al arrancar
    async function buscarOrdenPendiente() {
      const { data } = await supabase
        .from('ordenes')
        .select('*')
        .eq('estado', 'pendiente')
        .or(`asignado_a_id.eq.${cadete.id},broadcast_en.not.is.null`)
        .order('creado_en', { ascending: true })
        .limit(20);

      const pendiente = (data ?? []).find((orden) => {
        const esMia = orden.asignado_a_id === cadete.id;
        const esBroadcast = Boolean(orden.broadcast_en);
        const rechazos = orden.rechazos ?? [];
        const yoRechace = rechazos.includes(cadete.id);
        return !yoRechace && (esMia || (esBroadcast && orden.zona === cadete.zona));
      });

      if (pendiente) mostrarPedido(pendiente);
    }
    buscarOrdenPendiente();

    // Escuchar cambios en ordenes en tiempo real
    const channel = supabase
      .channel(`assignment-${cadete.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordenes' },
        ({ eventType, new: nueva, old: vieja }) => {
          if (eventType === 'DELETE') return;

          const esMia      = nueva.asignado_a_id === cadete.id;
          const esBroadcast = Boolean(nueva.broadcast_en);
          const rechazos   = nueva.rechazos ?? [];
          const yoRechace  = rechazos.includes(cadete.id);

          // Si la orden ya no está pendiente, limpiar
          if (nueva.estado !== 'pendiente') {
            setPedido((p) => (p?.id === nueva.id ? null : p));
            if (pedidoRef.current?.id === nueva.id) limpiar();
            return;
          }

          // Asignación directa a este cadete
          if (esMia && !yoRechace) {
            mostrarPedido(nueva);
            return;
          }

          // Broadcast — todos en la zona la ven (excepto quienes rechazaron)
          if (esBroadcast && !yoRechace && nueva.zona === cadete.zona) {
            mostrarPedido(nueva);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timerRef.current);
    };
  }, [cadete?.id, cadete?.zona, mostrarPedido, limpiar]);

  const pedidoRef = useRef(pedido);
  useEffect(() => { pedidoRef.current = pedido; }, [pedido]);

  async function rechazarPedido(orden) {
    const target = orden ?? pedidoRef.current;
    if (!target) return;
    limpiar();
    await apiFetch(`/api/ordenes/${target.id}/rechazar`, {
      method:  'PATCH',
      body:    JSON.stringify({ cadete_id: cadete.id }),
    }).catch(() => {});
  }

  async function aceptarPedido() {
    if (!pedido || cargando) return;
    setCargando(true);
    setError('');
    try {
      const res = await apiFetch(`/api/ordenes/${pedido.id}/aceptar`, {
        method:  'PATCH',
        body:    JSON.stringify({ cadete_id: cadete.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'No se pudo aceptar el pedido');
        setCargando(false);
        return;
      }
      limpiar();
      onAceptar?.(data);
    } catch {
      setError('Error de conexión');
      setCargando(false);
    }
  }

  if (!pedido) return null;

  const progreso  = (segundos / TIMER_SEG) * 100;
  const urgente   = segundos <= 30;
  const esBroadcast = Boolean(pedido.broadcast_en);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-bounce-in">

        {/* Header */}
        <div className={['px-5 py-4 text-white', esBroadcast ? 'bg-orange-500' : 'bg-green-500'].join(' ')}>
          <div className="flex items-center gap-2 mb-1">
            <Icon name={esBroadcast ? 'zap' : 'bike'} className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase tracking-wide opacity-90">
              {esBroadcast ? 'Pedido libre — primero que acepta' : 'Pedido asignado a vos'}
            </span>
          </div>
          <p className="text-lg font-bold leading-tight truncate">
            {pedido.cliente_nombre ?? pedido.descripcion ?? 'Nuevo pedido'}
          </p>
        </div>

        {/* Barra de tiempo */}
        <div className="h-1.5 bg-gray-100">
          <div
            className={['h-full transition-all duration-1000', urgente ? 'bg-red-500' : 'bg-green-500'].join(' ')}
            style={{ width: `${progreso}%` }}
          />
        </div>

        {/* Cuerpo */}
        <div className="px-5 py-4 space-y-3">
          {/* Timer */}
          <div className={['text-center text-sm font-semibold', urgente ? 'text-red-600' : 'text-gray-500'].join(' ')}>
            {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')} para decidir
          </div>

          {/* Detalles */}
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <Icon name="pin" className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              <span className="text-gray-700">{pedido.direccion ?? pedido.destino ?? '—'}</span>
            </div>
            {pedido.zona_label && (
              <div className="flex items-start gap-2">
                <Icon name="navigate" className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                <span className="text-gray-600">{pedido.zona_label}</span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Icon name="money" className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              <span className="text-gray-700 font-semibold">
                ${pedido.precio?.toLocaleString('es-AR') ?? '—'}
                <span className="text-green-600 ml-1 text-xs font-normal">
                  (vos: ${Math.round((pedido.precio ?? 0) * 0.82).toLocaleString('es-AR')})
                </span>
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Icon name="wallet" className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              <span className="text-gray-600 capitalize">{pedido.metodo_pago ?? 'efectivo'}</span>
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => rechazarPedido(pedido)}
              disabled={cargando}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Icon name="x" className="w-4 h-4" /> Rechazar
            </button>
            <button
              onClick={aceptarPedido}
              disabled={cargando}
              className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold text-sm active:scale-95 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {cargando
                ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Aceptando...</>
                : <><Icon name="check" className="w-4 h-4" /> Aceptar</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
