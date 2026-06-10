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
  });

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
      const res = await apiFetch('/api/ordenes', {
        method:  'POST',
        body: JSON.stringify({
          usuario_id:  usuarioId,
          descripcion: form.descripcion.trim(),
          origen:      form.origen.trim(),
          destino:     form.destino.trim(),
          zona:        form.zona,
          zona_label:  zonaSeleccionada?.label,
          precio:      precio ?? 0,
          metodo_pago: form.metodoPago,
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
                <option key={z.value} value={z.value}>{z.label} — ${(z.precio + SURCHARGE).toLocaleString('es-AR')}</option>
              ))}
            </select>
            {precio != null && (
              <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1 flex-wrap">
                <Icon name="money" className="w-3.5 h-3.5 text-green-600" /> Precio del envío: <strong className="text-gray-800">${precio.toLocaleString('es-AR')}</strong>
                <span className="text-gray-400">(incluye recargo particular de ${SURCHARGE.toLocaleString('es-AR')})</span>
              </p>
            )}
          </Field>

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
