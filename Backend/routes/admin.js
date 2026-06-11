import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

const ESTADOS_ORDEN   = ['pendiente', 'asignada', 'en_camino', 'entregada', 'cancelada'];
const ESTADOS_CADETE  = ['disponible', 'en_viaje', 'offline'];
const PLANES_COMERCIO = ['sin_plan', 'diario', 'mensual', 'anual'];

// ── PATCH /api/admin/ordenes/:id ──────────────────────────────────────────────
router.patch('/ordenes/:id', async (req, res) => {
  const { id }     = req.params;
  const { estado } = req.body;

  if (!estado || !ESTADOS_ORDEN.includes(estado)) {
    return res.status(400).json({ error: `estado inválido. Valores: ${ESTADOS_ORDEN.join(', ')}` });
  }

  const updateData = { estado };

  // Si el admin marca entregada a mano, dejar la orden consistente con el
  // flujo normal del cadete: fecha de entrega + split 82/18.
  if (estado === 'entregada') {
    const { data: actual } = await supabase
      .from('ordenes')
      .select('precio, entregada_en, ganancia_cadete, ganancia_yendo')
      .eq('id', id)
      .single();
    const precio = Number(actual?.precio ?? 0);
    if (!actual?.entregada_en)         updateData.entregada_en = new Date().toISOString();
    if (actual?.ganancia_cadete == null) updateData.ganancia_cadete = Math.round(precio * 0.82 * 100) / 100;
    if (actual?.ganancia_yendo == null)  updateData.ganancia_yendo  = Math.round(precio * 0.18 * 100) / 100;
  }

  const { data, error } = await supabase
    .from('ordenes')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /api/admin/ordenes/:id]', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar la orden' });
  }

  return res.json(data);
});

// ── PATCH /api/admin/cadetes/:id ──────────────────────────────────────────────
router.patch('/cadetes/:id', async (req, res) => {
  const { id }     = req.params;
  const { estado, telefono, zona } = req.body;
  const updateData = {};

  if (estado && !ESTADOS_CADETE.includes(estado)) {
    return res.status(400).json({ error: `estado inválido. Valores: ${ESTADOS_CADETE.join(', ')}` });
  }
  if (estado) updateData.estado = estado;
  if (telefono !== undefined) updateData.telefono = telefono?.trim() || null;
  if (zona !== undefined) updateData.zona = zona || null;

  if (!Object.keys(updateData).length) {
    return res.status(400).json({ error: 'No hay cambios para aplicar' });
  }

  const { data, error } = await supabase
    .from('cadetes')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /api/admin/cadetes/:id]', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar el cadete' });
  }

  return res.json(data);
});

// ── PATCH /api/admin/comercios/:id ───────────────────────────────────────────
router.patch('/comercios/:id', async (req, res) => {
  const { id } = req.params;
  const { plan, activo, telefono, direccion, categoria } = req.body;
  const updateData = {};

  if (plan !== undefined) {
    if (!PLANES_COMERCIO.includes(plan)) {
      return res.status(400).json({ error: `plan inválido. Valores: ${PLANES_COMERCIO.join(', ')}` });
    }
    updateData.plan = plan;
  }
  if (activo !== undefined) updateData.activo = Boolean(activo);
  if (telefono !== undefined) updateData.telefono = telefono?.trim() || null;
  if (direccion !== undefined) updateData.direccion = direccion?.trim() || null;
  if (categoria !== undefined) updateData.categoria = categoria || null;

  if (!Object.keys(updateData).length) {
    return res.status(400).json({ error: 'No hay cambios para aplicar' });
  }

  const { data, error } = await supabase
    .from('comercios')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /api/admin/comercios/:id]', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar el comercio' });
  }

  return res.json(data);
});

router.patch('/comercios/owner/:ownerId', async (req, res) => {
  const { ownerId } = req.params;
  const { plan, telefono, direccion, categoria } = req.body;
  const updateData = {};

  if (plan !== undefined) {
    if (!PLANES_COMERCIO.includes(plan)) {
      return res.status(400).json({ error: `plan inválido. Valores: ${PLANES_COMERCIO.join(', ')}` });
    }
    updateData.plan = plan;
  }
  if (telefono !== undefined) updateData.telefono = telefono?.trim() || null;
  if (direccion !== undefined) updateData.direccion = direccion?.trim() || null;
  if (categoria !== undefined) updateData.categoria = categoria || null;

  const { data, error } = await supabase
    .from('comercios')
    .update(updateData)
    .eq('owner_id', ownerId)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /api/admin/comercios/owner/:ownerId]', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar el comercio' });
  }

  return res.json(data);
});

// ── ZONAS / PRECIOS ──────────────────────────────────────────────────────────
router.post('/zonas', async (req, res) => {
  const { label, value, precio, precio_km, tiempo, orden } = req.body;

  if (!label?.trim() || !value?.trim() || precio == null) {
    return res.status(400).json({ error: 'label, value y precio son requeridos' });
  }

  const { data, error } = await supabase
    .from('zonas')
    .insert({
      label: label.trim(),
      value: value.trim(),
      precio: Number(precio) || 0,
      precio_km: Number(precio_km) || 0,
      tiempo: tiempo || null,
      orden: Number(orden) || 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/admin/zonas]', error.message);
    return res.status(500).json({ error: 'No se pudo crear la zona' });
  }

  return res.status(201).json(data);
});

router.patch('/zonas/:id', async (req, res) => {
  const { id } = req.params;
  const { precio, precio_km, tiempo, activo } = req.body;
  const updateData = {};

  if (precio !== undefined) updateData.precio = Number(precio) || 0;
  if (precio_km !== undefined) updateData.precio_km = Number(precio_km) || 0;
  if (tiempo !== undefined) updateData.tiempo = tiempo || null;
  if (activo !== undefined) updateData.activo = Boolean(activo);

  if (!Object.keys(updateData).length) {
    return res.status(400).json({ error: 'No hay cambios para aplicar' });
  }

  const { data, error } = await supabase
    .from('zonas')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /api/admin/zonas/:id]', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar la zona' });
  }

  return res.json(data);
});

router.delete('/zonas/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('zonas').delete().eq('id', id);

  if (error) {
    console.error('[DELETE /api/admin/zonas/:id]', error.message);
    return res.status(500).json({ error: 'No se pudo eliminar la zona' });
  }

  return res.status(204).send();
});

// ── CONFIGURACION DEL SERVICIO (recargos lluvia/feriado) ────────────────────
router.get('/configuracion', async (_req, res) => {
  const { data, error } = await supabase
    .from('configuracion_servicio')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('[GET /api/admin/configuracion]', error.message);
    return res.status(500).json({ error: 'No se pudo leer la configuración (¿corriste la migración 004?)' });
  }
  return res.json(data ?? { recargo_feriado_activo: false, recargo_lluvia_activo: false, recargo_monto: 500 });
});

router.patch('/configuracion', async (req, res) => {
  const { recargo_feriado_activo, recargo_lluvia_activo, recargo_monto } = req.body;
  const updateData = { actualizado_en: new Date().toISOString() };

  if (recargo_feriado_activo !== undefined) updateData.recargo_feriado_activo = Boolean(recargo_feriado_activo);
  if (recargo_lluvia_activo  !== undefined) updateData.recargo_lluvia_activo  = Boolean(recargo_lluvia_activo);
  if (recargo_monto !== undefined) {
    const monto = Number(recargo_monto);
    if (!Number.isFinite(monto) || monto < 0 || monto > 50000) {
      return res.status(400).json({ error: 'recargo_monto inválido' });
    }
    updateData.recargo_monto = monto;
  }

  const { data, error } = await supabase
    .from('configuracion_servicio')
    .update(updateData)
    .eq('id', 1)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /api/admin/configuracion]', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar la configuración (¿corriste la migración 004?)' });
  }
  return res.json(data);
});

// ── FINANZAS POR CADETE ──────────────────────────────────────────────────────
// Agregados de TODOS los pedidos entregados, por cadete: facturado, reparto,
// propinas, efectivo a rendir y monto a depositar.
router.get('/finanzas/cadetes', async (_req, res) => {
  const { data: cadetes, error: e1 } = await supabase
    .from('cadetes')
    .select('id, nombre, telefono, zona, estado, activo');

  let { data: ordenes, error: e2 } = await supabase
    .from('ordenes')
    .select('id, cadete_id, estado, precio, precio_envio, ganancia_cadete, ganancia_yendo, propina_cadete, total_cadete, efectivo_a_rendir, monto_a_depositar_cadete, metodo_pago, entregada_en')
    .eq('estado', 'entregada');

  // Migración 004 sin aplicar: pedir solo las columnas que existen seguro
  if (e2 && /does not exist|Could not find/i.test(e2.message)) {
    ({ data: ordenes, error: e2 } = await supabase
      .from('ordenes')
      .select('id, cadete_id, estado, precio, ganancia_cadete, ganancia_yendo, metodo_pago, entregada_en')
      .eq('estado', 'entregada'));
  }

  if (e1 || e2) {
    console.error('[GET /api/admin/finanzas/cadetes]', e1?.message ?? e2?.message);
    return res.status(500).json({ error: 'No se pudo calcular las finanzas' });
  }

  const r2 = (n) => Math.round(n * 100) / 100;
  const resumen = (cadetes ?? []).map((c) => {
    const propios = (ordenes ?? []).filter((o) => o.cadete_id === c.id);
    let facturado = 0, yendo = 0, cadete = 0, propinas = 0, rendir = 0, depositar = 0;
    for (const o of propios) {
      const envio    = Number(o.precio_envio ?? o.precio ?? 0);
      const gYendo   = Number(o.ganancia_yendo  ?? envio * 0.18);
      const gCadete  = Number(o.ganancia_cadete ?? envio - gYendo);
      const propina  = Number(o.propina_cadete ?? 0);
      const total    = Number(o.total_cadete ?? gCadete + propina);
      const efectivo = ['efectivo', 'paga_cliente'].includes(String(o.metodo_pago ?? 'efectivo').toLowerCase());
      facturado += envio;
      yendo     += gYendo;
      cadete    += gCadete;
      propinas  += propina;
      rendir    += Number(o.efectivo_a_rendir        ?? (efectivo ? gYendo : 0));
      depositar += Number(o.monto_a_depositar_cadete ?? (efectivo ? 0 : total));
    }
    return {
      id: c.id, nombre: c.nombre, telefono: c.telefono, zona: c.zona,
      estado: c.estado, activo: c.activo,
      viajes: propios.length,
      total_facturado:  r2(facturado),
      total_yendo:      r2(yendo),
      total_cadete:     r2(cadete),
      total_propinas:   r2(propinas),
      efectivo_a_rendir: r2(rendir),
      a_depositar:       r2(depositar),
    };
  }).sort((a, b) => b.total_facturado - a.total_facturado);

  return res.json(resumen);
});

export default router;
