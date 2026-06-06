import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

const SEGUNDOS_LIMITE = 30;

// ── Sonido con Web Audio API (sin archivos externos) ───────────────────────
function tocarAlarma() {
  try {
    const ctx = new AudioContext();
    // 3 beeps ascendentes
    [0, 0.35, 0.70].forEach((delay, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660 + i * 110; // 660 → 770 → 880 Hz
      gain.gain.setValueAtTime(0.6, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.25);
    });
  } catch {
    // AudioContext puede estar bloqueado hasta interacción del usuario
  }
}

// ── Componente ─────────────────────────────────────────────────────────────
// Props:
//   cadete: { id, zona }
//   onAceptar(pedido): callback cuando cadete acepta (para redirigir a mapa, etc.)
export default function NotificacionesPedidos({ cadete, onAceptar }) {
  const [pedido,    setPedido]    = useState(null);
  const [segundos,  setSegundos]  = useState(SEGUNDOS_LIMITE);
  const [aceptando, setAceptando] = useState(false);
  const [error,     setError]     = useState(null);
  const timerRef = useRef(null);

  // ── Mostrar pedido + sonido ──────────────────────────────────────────────
  const mostrarPedido = useCallback((nuevoPedido) => {
    // Ignorar si ya hay uno activo (solo mostrar de a uno)
    setPedido(prev => prev ?? nuevoPedido);
    tocarAlarma();
  }, []);

  // ── Buscar pedidos pendientes existentes al conectarse ──────────────────
  useEffect(() => {
    async function buscarPendientes() {
      const { data } = await supabase
        .from('ordenes')
        .select('*')
        .eq('estado', 'pendiente')
        .order('creado_en', { ascending: true })
        .limit(1);

      if (data?.length) mostrarPedido(data[0]);
    }
    buscarPendientes();
  }, [mostrarPedido]);

  // ── Supabase Realtime: escuchar INSERT en ordenes pendientes ─────────────
  useEffect(() => {
    const channel = supabase
      .channel('pedidos-pendientes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ordenes' },
        ({ new: nuevoPedido }) => {
          if (nuevoPedido.estado === 'pendiente') mostrarPedido(nuevoPedido);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [mostrarPedido]);

  // ── Countdown: auto-rechaza al llegar a 0 ───────────────────────────────
  useEffect(() => {
    if (!pedido) return;

    setSegundos(SEGUNDOS_LIMITE);
    timerRef.current = setInterval(() => {
      setSegundos(prev => {
        if (prev <= 1) { rechazar(); return 0; }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [pedido]);

  // ── Acciones ─────────────────────────────────────────────────────────────
  async function aceptar() {
    if (!pedido || aceptando) return;
    setAceptando(true);
    setError(null);
    clearInterval(timerRef.current);

    try {
      const res = await fetch(`/api/ordenes/${pedido.id}/aceptar`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadete_id: cadete.id }),
      });

      if (res.status === 409) {
        // Otro cadete se adelantó
        setError('Este pedido ya fue tomado por otro cadete.');
        setTimeout(cerrar, 2500);
        return;
      }
      if (!res.ok) throw new Error();

      const ordenActualizada = await res.json();
      cerrar();
      onAceptar?.(ordenActualizada);
    } catch {
      setError('No se pudo aceptar. Intentá de nuevo.');
      setAceptando(false);
    }
  }

  function rechazar() {
    clearInterval(timerRef.current);
    cerrar();
  }

  function cerrar() {
    setPedido(null);
    setAceptando(false);
    setError(null);
  }

  if (!pedido) return null;

  // ── Variables de display ──────────────────────────────────────────────────
  const precio         = pedido.precio?.toLocaleString('es-AR') ?? '—';
  const progreso       = (segundos / SEGUNDOS_LIMITE) * 100;
  const esParticular   = pedido.tipo === 'particular';
  const titulo         = esParticular ? 'Cliente particular' : (pedido.cliente_nombre ?? 'Comercio');
  const subtitulo      = esParticular ? pedido.descripcion   : pedido.zona_label;
  const direccionLabel = esParticular ? pedido.origen        : pedido.direccion;

  // ── Render: overlay pantalla completa ────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Barra de tiempo */}
        <div className="h-2 bg-gray-100">
          <div
            className={`h-full transition-all duration-1000 ease-linear rounded-full
              ${segundos > 10 ? 'bg-green-500' : 'bg-red-500'}`}
            style={{ width: `${progreso}%` }}
          />
        </div>

        {/* Cabecera */}
        <div className="bg-green-600 px-6 py-5 text-center">
          <p className="text-green-100 text-sm font-medium tracking-wide uppercase">
            Nuevo pedido
          </p>
          <h2 className="text-white text-2xl font-bold mt-1">{titulo}</h2>
          {subtitulo && (
            <p className="text-green-200 text-sm mt-1 line-clamp-2">{subtitulo}</p>
          )}
        </div>

        {/* Detalles */}
        <div className="px-6 py-5 space-y-3">
          {direccionLabel && (
            <Fila icono="📍" label="Dirección" valor={direccionLabel} />
          )}
          {esParticular && pedido.destino && (
            <Fila icono="🏁" label="Destino" valor={pedido.destino} />
          )}
          {pedido.zona_label && !esParticular && (
            <Fila icono="🗺️" label="Zona" valor={pedido.zona_label} />
          )}
          {esParticular && pedido.metodo_pago && (
            <Fila
              icono={pedido.metodo_pago === 'efectivo' ? '💵' : '💳'}
              label="Pago"
              valor={pedido.metodo_pago === 'efectivo' ? 'Efectivo al cadete' : 'Tarjeta a Yendo'}
            />
          )}

          {/* Lo que gana el cadete */}
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-2xl px-4 py-3 mt-1">
            <span className="text-sm font-semibold text-green-700">Ganás</span>
            <span className="text-3xl font-bold text-green-700 tabular-nums">
              ${precio}
            </span>
          </div>

          {/* Contador */}
          <p className="text-center text-sm text-gray-400">
            Se cierra en{' '}
            <span className={`font-bold ${segundos <= 10 ? 'text-red-500' : 'text-gray-600'}`}>
              {segundos}s
            </span>
          </p>

          {/* Error */}
          {error && (
            <p className="text-center text-sm text-red-500 font-medium">{error}</p>
          )}
        </div>

        {/* Botones */}
        <div className="px-6 pb-6 grid grid-cols-2 gap-3">
          <button
            onClick={rechazar}
            disabled={aceptando}
            className="py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold
              text-base hover:bg-gray-50 active:scale-95 transition-all
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✕ Rechazar
          </button>
          <button
            onClick={aceptar}
            disabled={aceptando}
            className="py-4 rounded-2xl bg-green-600 text-white font-bold text-base
              hover:bg-green-700 active:scale-95 transition-all
              disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {aceptando ? 'Aceptando...' : '✓ Aceptar'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Sub-componente ─────────────────────────────────────────────────────────
function Fila({ icono, label, valor }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-lg mt-0.5">{icono}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-sm text-gray-800 font-semibold truncate">{valor}</p>
      </div>
    </div>
  );
}
