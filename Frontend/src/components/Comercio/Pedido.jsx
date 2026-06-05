import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ZONAS = [
  { value: 'ciudad_colon',      label: 'Ciudad de Colón',   precio: 3000 },
  { value: 'barrio_ombu',       label: 'Barrio Ombú',       precio: 3500 },
  { value: 'barrio_artalaz',    label: 'Barrio Artalaz',    precio: 5000 },
  { value: 'barrio_los_bretes', label: 'Barrio Los Bretes', precio: 6000 },
  { value: 'san_jose',          label: 'San José',           precio: 8500 },
  { value: 'el_brillante',      label: 'El Brillante',      precio: 8500 },
  { value: 'pueblo_liebig',     label: 'Pueblo Liebig',     precio: 8500 },
];

const LAST_ZONA_KEY = 'yendo_ultima_zona';

export default function Pedido({ comercioId, onSuccess }) {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState(null); // { message, type: 'success'|'error' }
  const [errors, setErrors]     = useState({});
  const [form, setForm]         = useState({
    clienteId: '',
    direccion: '',
    zona: localStorage.getItem(LAST_ZONA_KEY) || '',
  });

  const zonaData = ZONAS.find(z => z.value === form.zona) ?? null;

  // ── Cargar clientes guardados del comercio ─────────────────────────────
  useEffect(() => {
    async function fetchClientes() {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, direccion')
        .eq('comercio_id', comercioId)
        .order('nombre', { ascending: true });

      if (!error) setClientes(data ?? []);
    }
    fetchClientes();
  }, [comercioId]);

  // ── Handlers ───────────────────────────────────────────────────────────
  function handleCliente(e) {
    const id      = e.target.value;
    const cliente = clientes.find(c => c.id === id);
    setForm(prev => ({
      ...prev,
      clienteId: id,
      direccion: cliente?.direccion ?? '',
    }));
    clearErrors('clienteId', 'direccion');
  }

  function handleDireccion(e) {
    setForm(prev => ({ ...prev, direccion: e.target.value }));
    clearErrors('direccion');
  }

  function handleZona(e) {
    const val = e.target.value;
    setForm(prev => ({ ...prev, zona: val }));
    if (val) localStorage.setItem(LAST_ZONA_KEY, val);
    clearErrors('zona');
  }

  function clearErrors(...keys) {
    setErrors(prev => {
      const next = { ...prev };
      keys.forEach(k => delete next[k]);
      return next;
    });
  }

  // ── Validación ─────────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (!form.clienteId)        e.clienteId = 'Seleccioná un cliente';
    if (!form.direccion.trim()) e.direccion = 'La dirección es requerida';
    if (!form.zona)             e.zona      = 'Seleccioná una zona';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit → POST /api/ordenes ─────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const cliente = clientes.find(c => c.id === form.clienteId);

      const res = await fetch('/api/ordenes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comercio_id:    comercioId,
          cliente_id:     form.clienteId,
          cliente_nombre: cliente?.nombre,
          direccion:      form.direccion,
          zona:           form.zona,
          zona_label:     zonaData?.label,
          precio:         zonaData?.precio,
          estado:         'pendiente',
        }),
      });

      if (!res.ok) throw new Error('Error del servidor');

      showToast('Pedido enviado a los cadetes disponibles', 'success');
      limpiar();
      setTimeout(() => onSuccess?.(), 1500);
    } catch {
      showToast('No se pudo enviar el pedido. Intentá de nuevo.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function limpiar() {
    setForm(prev => ({ ...prev, clienteId: '', direccion: '' }));
    setErrors({});
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
            shadow-lg text-white text-sm font-semibold transition-all
            ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}
        >
          <span>{toast.type === 'error' ? '✕' : '✓'}</span>
          {toast.message}
        </div>
      )}

      <div className="w-full max-w-md">

        {/* Encabezado */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Nuevo Pedido</h1>
          <p className="text-sm text-gray-400 mt-0.5">Completá los datos y enviá</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5"
        >

          {/* Cliente */}
          <Field label="Cliente" required error={errors.clienteId}>
            <select
              value={form.clienteId}
              onChange={handleCliente}
              className={inputCls(errors.clienteId)}
            >
              <option value="">Seleccionar cliente...</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Field>

          {/* Dirección */}
          <Field label="Dirección" required error={errors.direccion}>
            <input
              type="text"
              value={form.direccion}
              onChange={handleDireccion}
              placeholder="Calle y número"
              className={inputCls(errors.direccion)}
            />
          </Field>

          {/* Zona */}
          <Field label="Zona" required error={errors.zona}>
            <select
              value={form.zona}
              onChange={handleZona}
              className={inputCls(errors.zona)}
            >
              <option value="">Seleccionar zona...</option>
              {ZONAS.map(z => (
                <option key={z.value} value={z.value}>
                  {z.label} — ${z.precio.toLocaleString('es-AR')}
                </option>
              ))}
            </select>
          </Field>

          {/* Precio automático */}
          {zonaData && (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-green-700">Precio del envío</p>
                <p className="text-xs text-green-600 mt-0.5">{zonaData.label}</p>
              </div>
              <p className="text-3xl font-bold text-green-700 tabular-nums">
                ${zonaData.precio.toLocaleString('es-AR')}
              </p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={limpiar}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600
                text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Limpiar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-[2] py-3 rounded-xl bg-green-600 text-white text-sm font-bold
                hover:bg-green-700 active:scale-95 transition-all
                disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Enviando...' : 'Enviar pedido'}
            </button>
          </div>

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
