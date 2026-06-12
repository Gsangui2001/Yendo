import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { apiFetch } from '../../lib/api';
import { Icon } from '../ui/Icon';

const SURCHARGE     = 500; // recargo para particulares

const ZONAS_FALLBACK = [
  { value: 'ciudad_colon',      label: 'Ciudad de Colón',   precio: 3000 },
  { value: 'barrio_ombu',       label: 'Barrio Ombú',       precio: 3500 },
  { value: 'barrio_artalaz',    label: 'Barrio Artalaz',    precio: 5000 },
  { value: 'barrio_los_bretes', label: 'Barrio Los Bretes', precio: 6000 },
  { value: 'san_jose',          label: 'San José',           precio: 8500 },
  { value: 'el_brillante',      label: 'El Brillante',       precio: 8500 },
  { value: 'pueblo_liebig',     label: 'Pueblo Liebig',      precio: 8500 },
];

const METODOS_PAGO = [
  {
    value: 'efectivo',
    label: 'Pagar al cadete',
    descripcion: 'Efectivo cuando llegue',
    icon: 'money',
  },
  {
    value: 'tarjeta',
    label: 'Pagar a Yendo',
    descripcion: 'Tarjeta antes de que salga',
    icon: 'wallet',
  },
];

export default function SolicitarCadete({ usuarioId, onPedidoCreado }) {
  const [direccionesGuardadas, setDireccionesGuardadas] = useState([]);
  const [zonas,   setZonas]   = useState(ZONAS_FALLBACK);
  const [loading, setLoading] = useState(false);
  const [toast,   setToast]   = useState(null);
  const [errors,  setErrors]  = useState({});
  const [form, setForm]       = useState({
    descripcion:    '',
    origen:         '',
    origenGuardado: '',
    destino:        '',
    destinoGuardado: '',
    zona:           '',
    metodoPago:     '',
    distanciaKm:    '',
    propina:        '',
  });
  const [cotizacion, setCotizacion] = useState(null);
  const [cotizando,  setCotizando]  = useState(false);
  const [geoError,   setGeoError]   = useState(null); // dirección no encontrada → fallback km manual

  // ── Cargar datos iniciales ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchDirecciones() {
      const { data, error } = await supabase
        .from('direcciones').select('id, nombre, direccion')
        .eq('usuario_id', usuarioId).order('nombre', { ascending: true });
      if (!error) setDireccionesGuardadas(data ?? []);
    }
    async function fetchZonas() {
      const { data } = await supabase.from('zonas').select('*').eq('activo', true).order('orden');
      if (data?.length) setZonas(data);
    }
    fetchDirecciones();
    fetchZonas();
  }, [usuarioId]);

  // Cotización en vivo POR DIRECCIONES: el backend geocodifica origen y
  // destino, calcula la distancia de ruta y decide todos los montos. Si
  // alguna dirección no se encuentra, se habilita el fallback de km a mano.
  useEffect(() => {
    const origen  = form.origen.trim();
    const destino = form.destino.trim();
    const kmManual = Number(form.distanciaKm);
    const tieneDirecciones = origen.length >= 5 && destino.length >= 5;
    if (!tieneDirecciones && !(kmManual > 0)) {
      setCotizacion(null); setGeoError(null); setCotizando(false);
      return;
    }
    let activo = true;
    setCotizando(true);
    const t = setTimeout(async () => {
      try {
        if (tieneDirecciones) {
          const res  = await apiFetch('/api/precios/cotizar-direcciones', {
            method: 'POST',
            body: JSON.stringify({
              tipo: 'particular',
              origen,
              destino,
              // Si eligió direcciones guardadas, el backend usa sus
              // coordenadas persistidas (presupuesto instantáneo)
              origen_direccion_id:  form.origenGuardado  || undefined,
              destino_direccion_id: form.destinoGuardado || undefined,
              propina_cadete: Number(form.propina) || 0,
              metodo_pago: form.metodoPago || 'efectivo',
            }),
          });
          const data = await res.json().catch(() => null);
          if (!activo) return;
          if (res.ok && data) {
            setCotizacion(data);
            setGeoError(null);
            return;
          }
          setGeoError(data?.error ?? 'No pudimos calcular la distancia con esas direcciones.');
        }
        // Fallback: cotizar con los km cargados a mano
        if (kmManual > 0) {
          const res = await apiFetch('/api/precios/cotizar', {
            method: 'POST',
            body: JSON.stringify({
              tipo: 'particular',
              distancia_km: kmManual,
              propina_cadete: Number(form.propina) || 0,
              metodo_pago: form.metodoPago || 'efectivo',
            }),
          });
          if (!activo) return;
          setCotizacion(res.ok ? await res.json() : null);
        } else if (activo) {
          setCotizacion(null);
        }
      } catch {
        if (activo) { setCotizacion(null); setGeoError('No pudimos cotizar. Revisá tu conexión.'); }
      } finally {
        if (activo) setCotizando(false);
      }
    }, 700);
    return () => { activo = false; clearTimeout(t); };
  }, [form.origen, form.destino, form.origenGuardado, form.destinoGuardado, form.distanciaKm, form.propina, form.metodoPago]);

  // ── Handlers ───────────────────────────────────────────────────────────
  function handleOrigenGuardado(e) {
    const id  = e.target.value;
    const dir = direccionesGuardadas.find(d => d.id === id);
    setForm(prev => ({
      ...prev,
      origenGuardado: id,
      origen: dir?.direccion ?? '',
    }));
    clearError('origen');
  }

  function handleDestinoGuardado(e) {
    const id  = e.target.value;
    const dir = direccionesGuardadas.find(d => d.id === id);
    setForm(prev => ({
      ...prev,
      destinoGuardado: id,
      destino: dir?.direccion ?? '',
    }));
    clearError('destino');
  }

  function handleField(campo) {
    return e => {
      setForm(prev => ({ ...prev, [campo]: e.target.value }));
      clearError(campo);
    };
  }

  function handleMetodoPago(valor) {
    setForm(prev => ({ ...prev, metodoPago: valor }));
    clearError('metodoPago');
  }

  function clearError(campo) {
    setErrors(prev => {
      const next = { ...prev };
      delete next[campo];
      return next;
    });
  }

  const zonaSeleccionada = zonas.find(z => z.value === form.zona);
  const precio = zonaSeleccionada ? zonaSeleccionada.precio + SURCHARGE : null;

  // ── Validación ─────────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (form.descripcion.trim().length < 5)
      e.descripcion = 'Describí qué necesitás';
    if (!form.origen.trim())  e.origen     = 'Indicá desde dónde';
    if (!form.destino.trim()) e.destino    = 'Indicá hacia dónde';
    if (form.origen.trim() === form.destino.trim() && form.origen.trim())
      e.destino = 'El destino debe ser diferente al origen';
    if (!form.zona)           e.zona       = 'Seleccioná la zona de destino';
    if (!form.metodoPago)     e.metodoPago = 'Elegí un método de pago';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit → POST /api/ordenes ─────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      // El backend geocodifica origen/destino y recalcula distancia y precio.
      // Los km solo viajan como fallback por si el geocoder no responde.
      const kmFallback = Number(cotizacion?.distancia_km) > 0
        ? Number(cotizacion.distancia_km)
        : (Number(form.distanciaKm) > 0 ? Number(form.distanciaKm) : undefined);
      const res = await apiFetch('/api/ordenes', {
        method:  'POST',
        body: JSON.stringify({
          usuario_id:  usuarioId,
          descripcion: form.descripcion.trim(),
          origen:      form.origen.trim(),
          destino:     form.destino.trim(),
          origen_direccion_id:  form.origenGuardado  || undefined,
          destino_direccion_id: form.destinoGuardado || undefined,
          zona:        form.zona,
          zona_label:  zonaSeleccionada?.label,
          distancia_km:   kmFallback,
          propina_cadete: Number(form.propina) || 0,
          metodo_pago: form.metodoPago,
          // Último recurso: si no hay km ni dirección geocodificable, precio de zona
          precio:      kmFallback ? undefined : (precio ?? 0),
        }),
      });

      if (!res.ok) throw new Error('Error del servidor');
      const data = await res.json();

      const msg = data.sin_cadetes
        ? `Sin cadetes disponibles. Espera aprox. ${data.espera_minutos} min — tu pedido quedó en cola`
        : 'Pedido creado. Buscando cadete...';
      showToast(msg, data.sin_cadetes ? 'warn' : 'success');
      onPedidoCreado?.(data.id);
    } catch {
      showToast('No se pudo crear el pedido. Intentá de nuevo.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function showToast(message, type) {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-8">

      {/* Toast */}
      {toast && (
        <div
          role="alert"
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3 rounded-xl
            shadow-lg text-white text-sm font-semibold transition-all max-w-xs
            ${toast.type === 'error' ? 'bg-red-500' : toast.type === 'warn' ? 'bg-amber-500' : 'bg-green-600'}`}
        >
          <Icon name={toast.type === 'error' ? 'x' : toast.type === 'warn' ? 'clock' : 'check'} className="w-4 h-4" />
          {toast.message}
        </div>
      )}

      <div className="w-full max-w-md">

        {/* Encabezado */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Solicitar cadete</h1>
          <p className="text-sm text-gray-400 mt-0.5">Completá los datos y te buscamos uno</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5"
        >

          {/* ¿Qué necesitás mandar? */}
          <Field label="¿Qué necesitás mandar?" required error={errors.descripcion}>
            <textarea
              value={form.descripcion}
              onChange={handleField('descripcion')}
              placeholder='Ej: "Documento urgente al Hospital Central"'
              rows={3}
              className={inputCls(errors.descripcion) + ' resize-none'}
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {form.descripcion.length}/10 mínimo
            </p>
          </Field>

          {/* Desde dónde */}
          <div className="space-y-2">
            <Field label="¿Desde dónde?" required error={errors.origen}>
              {direccionesGuardadas.length > 0 && (
                <select
                  value={form.origenGuardado}
                  onChange={handleOrigenGuardado}
                  className={`${inputCls()} mb-2`}
                >
                  <option value="">Elegir dirección guardada...</option>
                  {direccionesGuardadas.map(d => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={form.origen}
                onChange={e => {
                  setForm(prev => ({ ...prev, origen: e.target.value, origenGuardado: '' }));
                  clearError('origen');
                }}
                placeholder="O escribí la dirección"
                className={inputCls(errors.origen)}
              />
            </Field>
          </div>

          {/* Hacia dónde */}
          <div className="space-y-2">
            <Field label="¿Hacia dónde?" required error={errors.destino}>
              {direccionesGuardadas.length > 0 && (
                <select
                  value={form.destinoGuardado}
                  onChange={handleDestinoGuardado}
                  className={`${inputCls()} mb-2`}
                >
                  <option value="">Elegir dirección guardada...</option>
                  {direccionesGuardadas.map(d => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={form.destino}
                onChange={e => {
                  setForm(prev => ({ ...prev, destino: e.target.value, destinoGuardado: '' }));
                  clearError('destino');
                }}
                placeholder="O escribí la dirección"
                className={inputCls(errors.destino)}
              />
            </Field>
          </div>

          {/* Zona de destino */}
          <Field label="Zona de destino" required error={errors.zona}>
            <select
              value={form.zona}
              onChange={e => { setForm(prev => ({ ...prev, zona: e.target.value })); clearError('zona'); }}
              className={inputCls(errors.zona)}
            >
              <option value="">Seleccioná la zona...</option>
              {zonas.map(z => (
                <option key={z.value} value={z.value}>{z.label}</option>
              ))}
            </select>
          </Field>

          {/* Dirección no encontrada → aviso + fallback de km a mano */}
          {geoError && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              {geoError} Mientras tanto podés cargar los km a mano.
            </p>
          )}

          {/* Propina y (solo como fallback) distancia manual */}
          <div className={`grid gap-3 ${geoError ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {geoError && (
              <Field label="Distancia (km)">
                <input type="number" min="0.5" step="0.5" inputMode="decimal" value={form.distanciaKm}
                  onChange={e => { setForm(prev => ({ ...prev, distanciaKm: e.target.value })); }}
                  placeholder="Ej: 4" className={inputCls()} />
              </Field>
            )}
            <Field label="Propina cadete (opcional)">
              <input type="number" min="0" step="100" inputMode="numeric" value={form.propina}
                onChange={e => { setForm(prev => ({ ...prev, propina: e.target.value })); }}
                placeholder="$0" className={inputCls()} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-gray-400">Tarifa: $3.500 hasta 5 km · $1.000 por km extra. La distancia se calcula sola con tus direcciones. La propina es 100% para el cadete.</p>

          {/* Desglose cotizado */}
          {(cotizacion || cotizando) && (
            <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-sm">
              {cotizacion ? (
                <>
                  <div className="flex justify-between text-green-800">
                    <span>Envío ({cotizacion.distancia_km} km{cotizacion.metodo_distancia === 'osrm' ? ' · ruta real' : cotizacion.metodo_distancia === 'haversine' ? ' · estimada' : ''})</span>
                    <strong>${cotizacion.precio_envio.toLocaleString('es-AR')}</strong>
                  </div>
                  {cotizacion.recargo_clima_feriado > 0 && (
                    <div className="flex justify-between text-green-800">
                      <span>Incluye recargo {cotizacion.recargos_activos?.lluvia ? 'por lluvia' : 'por feriado'}</span>
                      <strong>+${cotizacion.recargo_clima_feriado.toLocaleString('es-AR')}</strong>
                    </div>
                  )}
                  {cotizacion.propina_cadete > 0 && (
                    <div className="flex justify-between text-green-800">
                      <span>Propina cadete</span>
                      <strong>+${cotizacion.propina_cadete.toLocaleString('es-AR')}</strong>
                    </div>
                  )}
                  <div className="mt-1 flex justify-between border-t border-green-200 pt-1 text-base font-extrabold text-green-700">
                    <span>Total a pagar</span>
                    <span>${cotizacion.total_cliente.toLocaleString('es-AR')}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-green-200 border-t-green-600 animate-spin" />
                  Calculando distancia y precio...
                </p>
              )}
            </div>
          )}

          {/* Método de pago */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Método de pago <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {METODOS_PAGO.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => handleMetodoPago(m.value)}
                  className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 text-center
                    transition-all cursor-pointer
                    ${form.metodoPago === m.value
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${form.metodoPago === m.value ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}><Icon name={m.icon} className="w-5 h-5" /></span>
                  <span className="text-sm font-semibold text-gray-800">{m.label}</span>
                  <span className="text-xs text-gray-500">{m.descripcion}</span>
                </button>
              ))}
            </div>
            {errors.metodoPago && (
              <p className="text-red-500 text-xs mt-1">{errors.metodoPago}</p>
            )}
          </div>

          {/* Botón submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl bg-green-600 text-white font-bold text-base
              hover:bg-green-700 active:scale-95 transition-all
              disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {loading ? 'Buscando cadete...' : 'Solicitar cadete ahora'}
          </button>

        </form>
      </div>
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────
function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function inputCls(error) {
  return [
    'w-full px-4 py-3 rounded-xl border text-sm bg-white',
    'transition-colors focus:outline-none focus:ring-2 focus:ring-green-500',
    error ? 'border-red-400 bg-red-50' : 'border-gray-200',
  ].join(' ');
}
