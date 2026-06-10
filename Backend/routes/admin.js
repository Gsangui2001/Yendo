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

  const { data, error } = await supabase
    .from('ordenes')
    .update({ estado })
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

export default router;
