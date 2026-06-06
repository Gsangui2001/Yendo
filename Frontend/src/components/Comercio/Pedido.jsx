import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

const LAST_ZONA_KEY = 'yendo_ultima_zona';

export default function Pedido({ comercioId, onSuccess }) {
  const [clientes,  setClientes]  = useState([]);
  const [zonas,     setZonas]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [toast,     setToast]     = useState(null);
  const [errors,    setErrors]    = useState({});
  const [modoNuevo, setModoNuevo] = useState(false); // true = formulario cliente nuevo

  const [form, setForm] = useState({
    clienteId:  '',
    direccion:  '',
    zona:       localStorage.getItem(LAST_ZONA_KEY) || '',
  });

  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: '', telefono: '', direccion: '', zona: '',
  });
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  const zonaData = zonas.find(z => z.value === form.zona) ?? null;

  useEffect(() => {
    cargarClientes();
    cargarZonas();
  }, [comercioId]);

  async function cargarClientes() {
    const { data } = await supabase
      .from('clientes').select('id, nombre, direccion, zona')
      .eq('comercio_id', comercioId).order('nombre');
    setClientes(data ?? []);
  }

  async function cargarZonas() {
    const { data } = await supabase.from('zonas').select('*').eq('activo', true).order('orden');
    if (data?.length) setZonas(data);
    else setZonas([
      { value: 'ciudad_colon',      label: 'Ciudad de Colón',   precio: 3000 },
      { value: 'barrio_ombu',       label: 'Barrio Ombú',       precio: 3500 },
      { value: 'barrio_artalaz',    label: 'Barrio Artalaz',    precio: 5000 },
      { value: 'barrio_los_bretes', label: 'Barrio Los Bretes', precio: 6000 },
      { value: 'san_jose',          label: 'San José',          precio: 8500 },
      { value: 'el_brillante',      label: 'El Brillante',      precio: 8500 },
      { value: 'pueblo_liebig',     label: 'Pueblo Liebig',     precio: 8500 },
    ]);
  }

  function handleCliente(e) {
    const id      = e.target.value;
    if (id === '__nuevo__') { setModoNuevo(true); return; }
    const cliente = clientes.find(c => c.id === id);
    setForm(prev => ({ ...prev, clienteId: id, direccion: cliente?.direccion ?? '', zona: cliente?.zona || prev.zona }));
    clearErrors('clienteId', 'direccion');
  }

  function clearErrors(...keys) {
    setErrors(prev => { const n = {...prev}; keys.forEach(k => delete n[k]); return n; });
  }

  function validate() {
    const e = {};
    if (!form.clienteId)        e.clienteId = 'Seleccioná un cliente';
    if (!form.direccion.trim()) e.direccion = 'La dirección es requerida';
    if (!form.zona)             e.zona      = 'Seleccioná una zona';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function guardarNuevoCliente() {
    if (!nuevoCliente.nombre.trim()) return;
    setGuardandoCliente(true);
    const { data, error } = await supabase.from('clientes').insert({
      comercio_id: comercioId,
      nombre:      nuevoCliente.nombre.trim(),
      telefono:    nuevoCliente.telefono.trim(),
      direccion:   nuevoCliente.direccion.trim(),
      zona:        nuevoCliente.zona || null,
    }).select().single();

    if (!error && data) {
      await cargarClientes();
      setForm(prev => ({ ...prev, clienteId: data.id, direccion: data.direccion ?? '' , zona: data.zona || prev.zona }));
      setNuevoCliente({ nombre: '', telefono: '', direccion: '', zona: '' });
      setModoNuevo(false);
      showToast('Cliente guardado', 'success');
    }
    setGuardandoCliente(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      // Verificar saldo suficiente
      const { data: com } = await supabase.from('comercios').select('saldo').eq('id', comercioId).single();
      const saldoActual = Number(com?.saldo) || 0;
      const precio = zonaData?.precio ?? 0;
      if (saldoActual < precio) {
        showToast(`Presupuesto insuficiente. Tenés $${saldoActual.toLocaleString('es-AR')} y el envío cuesta $${precio.toLocaleString('es-AR')}.`, 'error');
        setLoading(false);
        return;
      }

      const cliente = clientes.find(c => c.id === form.clienteId);
      const { error } = await supabase.from('ordenes').insert({
        comercio_id:    comercioId,
        cliente_id:     form.clienteId,
        cliente_nombre: cliente?.nombre,
        direccion:      form.direccion,
        zona:           form.zona,
        zona_label:     zonaData?.label,
        precio,
        tipo:           'comercio',
        prioridad:      'alta',
        estado:         'pendiente',
      });
      if (error) throw error;

      // Descontar del presupuesto
      await supabase.from('comercios').update({ saldo: saldoActual - precio }).eq('id', comercioId);
      // Incrementar veces_usado del cliente
      await supabase.from('clientes').update({ veces_usado: (cliente?.veces_usado ?? 0) + 1 }).eq('id', form.clienteId);

      showToast('¡Pedido enviado! Buscando cadete...', 'success');
      setForm(prev => ({ ...prev, clienteId: '', direccion: '' }));
      setErrors({});
      setTimeout(() => onSuccess?.(), 1500);
    } catch {
      showToast('No se pudo enviar el pedido. Intentá de nuevo.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function showToast(message, type) {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="max-w-md mx-auto">
      {toast && (
        <div role="alert" className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-semibold ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}>
          <span>{toast.type === 'error' ? '✕' : '✓'}</span>{toast.message}
        </div>
      )}

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Nuevo pedido</h1>
        <p className="text-sm text-gray-400 mt-0.5">Completá los datos y enviá</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">

        {/* Cliente */}
        <Field label="Cliente" required error={errors.clienteId}>
          <select value={form.clienteId} onChange={handleCliente} className={inputCls(errors.clienteId)}>
            <option value="">Seleccionar cliente...</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            <option value="__nuevo__">➕ Guardar nuevo cliente...</option>
          </select>
        </Field>

        {/* Formulario nuevo cliente (inline) */}
        {modoNuevo && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-green-800">Nuevo cliente</p>
            <input value={nuevoCliente.nombre} onChange={e => setNuevoCliente(p => ({...p, nombre: e.target.value}))}
              placeholder="Nombre *" className={inputCls()} />
            <input value={nuevoCliente.telefono} onChange={e => setNuevoCliente(p => ({...p, telefono: e.target.value}))}
              placeholder="Teléfono" className={inputCls()} />
            <input value={nuevoCliente.direccion} onChange={e => setNuevoCliente(p => ({...p, direccion: e.target.value}))}
              placeholder="Dirección" className={inputCls()} />
            <select value={nuevoCliente.zona} onChange={e => setNuevoCliente(p => ({...p, zona: e.target.value}))} className={inputCls()}>
              <option value="">Zona habitual (opcional)</option>
              {zonas.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={() => setModoNuevo(false)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">Cancelar</button>
              <button type="button" onClick={guardarNuevoCliente} disabled={guardandoCliente || !nuevoCliente.nombre.trim()}
                className="flex-[2] py-2 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-60">
                {guardandoCliente ? 'Guardando...' : 'Guardar cliente'}
              </button>
            </div>
          </div>
        )}

        {/* Dirección */}
        <Field label="Dirección de entrega" required error={errors.direccion}>
          <input type="text" value={form.direccion} onChange={e => { setForm(p => ({...p, direccion: e.target.value})); clearErrors('direccion'); }}
            placeholder="Calle y número" className={inputCls(errors.direccion)} />
        </Field>

        {/* Zona */}
        <Field label="Zona" required error={errors.zona}>
          <select value={form.zona} onChange={e => { const v = e.target.value; setForm(p => ({...p, zona: v})); if(v) localStorage.setItem(LAST_ZONA_KEY, v); clearErrors('zona'); }}
            className={inputCls(errors.zona)}>
            <option value="">Seleccionar zona...</option>
            {zonas.map(z => <option key={z.value} value={z.value}>{z.label} — ${z.precio.toLocaleString('es-AR')}</option>)}
          </select>
        </Field>

        {/* Precio automático */}
        {zonaData && (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-green-700">Precio del envío</p>
              <p className="text-xs text-green-600 mt-0.5">{zonaData.label}</p>
            </div>
            <p className="text-3xl font-bold text-green-700 tabular-nums">${zonaData.precio.toLocaleString('es-AR')}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => { setForm(p => ({...p, clienteId: '', direccion: ''})); setErrors({}); }}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">
            Limpiar
          </button>
          <button type="submit" disabled={loading}
            className="flex-[2] py-3 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 active:scale-95 disabled:opacity-60">
            {loading ? 'Enviando...' : 'Enviar pedido'}
          </button>
        </div>
      </form>
    </div>
  );
}

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
  return ['w-full px-4 py-3 rounded-xl border text-sm bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-green-500', error ? 'border-red-400 bg-red-50' : 'border-gray-200'].join(' ');
}
