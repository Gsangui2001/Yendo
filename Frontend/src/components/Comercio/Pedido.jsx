import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { apiFetch } from '../../lib/api';
import { Icon } from '../ui/Icon';

const LAST_ZONA_KEY = 'yendo_ultima_zona';

export default function Pedido({ comercioId, comercio, onSuccess }) {
  const direccionComercio = comercio?.direccion?.trim() || '';
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
    distanciaKm: '',
    propina:     '',
    metodoPago:  'efectivo',
  });
  const [cotizacion, setCotizacion] = useState(null);
  const [cotizando,  setCotizando]  = useState(false);
  const [geoError,   setGeoError]   = useState(null); // dirección no encontrada → fallback km manual

  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: '', telefono: '', direccion: '', zona: '',
  });
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  const zonaData = zonas.find(z => z.value === form.zona) ?? null;

  useEffect(() => {
    cargarClientes();
    cargarZonas();
  }, [comercioId]);

  // Cotización en vivo POR DIRECCIÓN: el backend geocodifica desde la
  // dirección del comercio hasta la de entrega, calcula la distancia de ruta
  // y decide todos los montos. Si la dirección no se encuentra, se habilita
  // el fallback de km a mano (que también cotiza en el backend).
  useEffect(() => {
    const direccion = form.direccion.trim();
    const kmManual  = Number(form.distanciaKm);
    if (direccion.length < 5 && !(kmManual > 0)) {
      setCotizacion(null); setGeoError(null); setCotizando(false);
      return;
    }
    let activo = true;
    setCotizando(true);
    const t = setTimeout(async () => {
      try {
        if (direccion.length >= 5) {
          const res  = await apiFetch('/api/precios/cotizar-direcciones', {
            method: 'POST',
            body: JSON.stringify({
              tipo: 'comercio',
              comercio_id: comercioId,
              // Si la dirección es la del cliente guardado, el backend usa
              // sus coordenadas persistidas (presupuesto instantáneo)
              cliente_id: form.clienteId || undefined,
              destino: direccion,
              propina_cadete: Number(form.propina) || 0,
              metodo_pago: form.metodoPago,
            }),
          });
          const data = await res.json().catch(() => null);
          if (!activo) return;
          if (res.ok && data) {
            setCotizacion(data);
            setGeoError(null);
            return;
          }
          setGeoError(data?.error ?? 'No pudimos calcular la distancia para esa dirección.');
        }
        // Fallback: cotizar con los km cargados a mano
        if (kmManual > 0) {
          const res = await apiFetch('/api/precios/cotizar', {
            method: 'POST',
            body: JSON.stringify({
              tipo: 'comercio',
              distancia_km: kmManual,
              propina_cadete: Number(form.propina) || 0,
              metodo_pago: form.metodoPago,
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
  }, [form.direccion, form.distanciaKm, form.propina, form.metodoPago, form.clienteId, comercioId]);

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
    try {
      const res = await apiFetch('/api/clientes', {
        method: 'POST',
        body: JSON.stringify({
          comercio_id: comercioId,
          nombre:      nuevoCliente.nombre.trim(),
          telefono:    nuevoCliente.telefono.trim(),
          direccion:   nuevoCliente.direccion.trim(),
          zona:        nuevoCliente.zona || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        showToast(data?.error ?? 'No se pudo guardar el cliente. Intentá de nuevo.', 'error');
        return;
      }
      await cargarClientes();
      setForm(prev => ({ ...prev, clienteId: data.id, direccion: data.direccion ?? '' , zona: data.zona || prev.zona }));
      setNuevoCliente({ nombre: '', telefono: '', direccion: '', zona: '' });
      setModoNuevo(false);
      showToast('Cliente guardado', 'success');
    } catch {
      showToast('No se pudo guardar el cliente. Revisá tu conexión.', 'error');
    } finally {
      setGuardandoCliente(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const cliente = clientes.find(c => c.id === form.clienteId);
      // El backend geocodifica las direcciones y recalcula distancia y precio.
      // Los km solo viajan como fallback por si el geocoder no responde.
      const kmFallback = Number(cotizacion?.distancia_km) > 0
        ? Number(cotizacion.distancia_km)
        : (Number(form.distanciaKm) > 0 ? Number(form.distanciaKm) : undefined);
      const res = await apiFetch('/api/ordenes', {
        method:  'POST',
        body:    JSON.stringify({
          comercio_id:    comercioId,
          cliente_id:     form.clienteId,
          cliente_nombre: cliente?.nombre,
          direccion:      form.direccion,
          zona:           form.zona,
          zona_label:     zonaData?.label,
          distancia_km:   kmFallback,
          propina_cadete: Number(form.propina) || 0,
          metodo_pago:    form.metodoPago,
          // Último recurso: si no hay km ni dirección geocodificable, precio de zona
          precio:         kmFallback ? undefined : (zonaData?.precio ?? 0),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const msg = data.sin_cadetes
        ? `Sin cadetes disponibles. Espera aprox. ${data.espera_minutos} min — el pedido quedó en cola`
        : '¡Pedido enviado! Buscando cadete...';
      showToast(msg, data.sin_cadetes ? 'warn' : 'success');
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
    <div className="mx-auto max-w-5xl">
      {toast && (
        <div role="alert" className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-semibold max-w-xs ${toast.type === 'error' ? 'bg-red-500' : toast.type === 'warn' ? 'bg-amber-500' : 'bg-green-600'}`}>
          <Icon name={toast.type === 'error' ? 'x' : toast.type === 'warn' ? 'clock' : 'check'} className="w-4 h-4" />{toast.message}
        </div>
      )}

      <div className="mb-5 rounded-3xl border border-green-100 bg-gradient-to-br from-green-50 to-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-green-700">Pedido comercio</p>
            <h1 className="mt-1 text-2xl font-extrabold text-gray-900">Pedir cadete</h1>
            <p className="text-sm text-gray-500 mt-0.5">Elegí cliente, confirmá dirección y enviá. Yendo busca el cadete automáticamente.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-gray-500">
            <Step n="1" label="Cliente" active={Boolean(form.clienteId)} />
            <Step n="2" label="Dirección" active={Boolean(form.direccion.trim())} />
            <Step n="3" label="Enviar" active={Boolean(zonaData)} />
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">

          {/* Cliente */}
          <Field label="Cliente" required error={errors.clienteId}>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <select value={form.clienteId} onChange={handleCliente} className={inputCls(errors.clienteId)}>
                <option value="">Seleccionar cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                <option value="__nuevo__">Guardar nuevo cliente...</option>
              </select>
              <button
                type="button"
                onClick={() => setModoNuevo(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700 hover:bg-green-100"
              >
                <Icon name="plus" className="h-4 w-4" />
                Nuevo
              </button>
            </div>
          </Field>

          {/* Formulario nuevo cliente (inline) */}
          {modoNuevo && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
              <div>
                <p className="text-sm font-bold text-green-900">Nuevo cliente</p>
                <p className="text-xs text-green-700">Guardalo una vez y después lo elegís en segundos.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
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
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setModoNuevo(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">Cancelar</button>
                <button type="button" onClick={guardarNuevoCliente} disabled={guardandoCliente || !nuevoCliente.nombre.trim()}
                  className="flex-[2] py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-60">
                  {guardandoCliente ? 'Guardando...' : 'Guardar cliente'}
                </button>
              </div>
            </div>
          )}

          {/* Origen: dirección registrada del comercio (solo lectura) */}
          <Field label="Origen — dirección del comercio">
            {direccionComercio ? (
              <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                <Icon name="store" className="h-4 w-4 shrink-0 text-green-600" />
                <span className="truncate">{direccionComercio}</span>
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Completá la dirección del comercio para cotizar automático.
              </p>
            )}
          </Field>

          {/* Dirección */}
          <Field label="Dirección de entrega" required error={errors.direccion}>
            <input type="text" value={form.direccion} onChange={e => { setForm(p => ({...p, direccion: e.target.value})); clearErrors('direccion'); }}
              placeholder="Calle y número (ej: San Martín 441)" className={inputCls(errors.direccion)} />
            {geoError && (
              <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                {geoError} Mientras tanto podés cargar los km a mano.
              </p>
            )}
          </Field>

          {/* Zona */}
          <Field label="Zona" required error={errors.zona}>
            <select value={form.zona} onChange={e => { const v = e.target.value; setForm(p => ({...p, zona: v})); if(v) localStorage.setItem(LAST_ZONA_KEY, v); clearErrors('zona'); }}
              className={inputCls(errors.zona)}>
              <option value="">Seleccionar zona...</option>
              {zonas.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          </Field>

          {/* Pago, propina y (solo como fallback) distancia manual */}
          <div className={`grid gap-3 ${geoError ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {geoError && (
              <Field label="Distancia (km)">
                <input type="number" min="0.5" step="0.5" inputMode="decimal" value={form.distanciaKm}
                  onChange={e => setForm(p => ({ ...p, distanciaKm: e.target.value }))}
                  placeholder="Ej: 8" className={inputCls()} />
              </Field>
            )}
            <Field label="Método de pago">
              <select value={form.metodoPago} onChange={e => setForm(p => ({ ...p, metodoPago: e.target.value }))} className={inputCls()}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="online">Online</option>
              </select>
            </Field>
            <Field label="Propina cadete (opcional)">
              <input type="number" min="0" step="100" inputMode="numeric" value={form.propina}
                onChange={e => setForm(p => ({ ...p, propina: e.target.value }))}
                placeholder="$0" className={inputCls()} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-gray-400">Tarifa comercio: $3.000 hasta 5 km · $700 por km extra. La distancia se calcula sola desde tu local hasta la entrega. La propina es 100% para el cadete.</p>
        </div>

        <aside className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:self-start">
          <p className="text-sm font-extrabold text-gray-900">Resumen del pedido</p>
          <div className="mt-4 space-y-3">
            <SummaryRow icon="user" label="Cliente" value={clientes.find(c => c.id === form.clienteId)?.nombre || 'Sin seleccionar'} />
            <SummaryRow icon="pin" label="Entrega" value={form.direccion || 'Dirección pendiente'} />
            <SummaryRow icon="navigate" label="Zona" value={zonaData?.label || 'Sin zona'} />
          </div>

          <div className="mt-5 rounded-2xl border border-green-100 bg-green-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-green-700">Total a pagar</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums text-green-700">
              {cotizacion
                ? `$${cotizacion.total_cliente.toLocaleString('es-AR')}`
                : zonaData ? `$${Number(zonaData.precio).toLocaleString('es-AR')}` : '—'}
            </p>
            {cotizacion && (
              <div className="mt-2 space-y-1 border-t border-green-200 pt-2 text-xs text-green-800">
                <div className="flex justify-between">
                  <span>Envío ({cotizacion.distancia_km} km{cotizacion.metodo_distancia === 'osrm' ? ' · ruta real' : cotizacion.metodo_distancia === 'haversine' ? ' · estimada' : ''})</span>
                  <strong>${cotizacion.precio_envio.toLocaleString('es-AR')}</strong>
                </div>
                {cotizacion.recargo_clima_feriado > 0 && (
                  <div className="flex justify-between">
                    <span>Incluye recargo {cotizacion.recargos_activos?.lluvia ? 'por lluvia' : 'por feriado'}</span>
                    <strong>+${cotizacion.recargo_clima_feriado.toLocaleString('es-AR')}</strong>
                  </div>
                )}
                {cotizacion.propina_cadete > 0 && (
                  <div className="flex justify-between"><span>Propina cadete</span><strong>+${cotizacion.propina_cadete.toLocaleString('es-AR')}</strong></div>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-green-700">
              {cotizando
                ? 'Calculando distancia...'
                : cotizacion
                  ? 'Cotizado por Yendo según la distancia calculada.'
                  : 'Ingresá la dirección de entrega para cotizar automático.'}
            </p>
          </div>

          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => { setForm(p => ({...p, clienteId: '', direccion: ''})); setErrors({}); }}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">
              Limpiar
            </button>
            <button type="submit" disabled={loading}
              className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-4 text-base font-extrabold text-white shadow-sm hover:bg-green-700 active:scale-95 disabled:opacity-60">
              {loading ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Enviando
                </>
              ) : (
                <>
                  <Icon name="bike" className="h-5 w-5" />
                  Pedir cadete
                </>
              )}
            </button>
          </div>

          {Object.keys(errors).length > 0 && (
            <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
              Revisá los campos marcados para enviar el pedido.
            </div>
          )}
        </aside>
      </form>
    </div>
  );
}

function Step({ n, label, active }) {
  return (
    <div className={`rounded-2xl border px-3 py-2 ${active ? 'border-green-200 bg-white text-green-700' : 'border-gray-100 bg-white/70 text-gray-400'}`}>
      <span className={`mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold ${active ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{active ? <Icon name="check" className="h-3.5 w-3.5" /> : n}</span>
      <span className="block">{label}</span>
    </div>
  );
}

function SummaryRow({ icon, label, value }) {
  return (
    <div className="flex gap-3 rounded-xl bg-gray-50 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-green-600 shadow-sm">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400">{label}</p>
        <p className="truncate text-sm font-bold text-gray-900">{value}</p>
      </div>
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
