import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';

const router = Router();

const ESTADOS_ORDEN   = ['pendiente', 'asignada', 'en_camino', 'entregada', 'cancelada'];
const ESTADOS_CADETE  = ['disponible', 'en_viaje', 'offline'];

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
  const { estado } = req.body;

  if (!estado || !ESTADOS_CADETE.includes(estado)) {
    return res.status(400).json({ error: `estado inválido. Valores: ${ESTADOS_CADETE.join(', ')}` });
  }

  const { data, error } = await supabase
    .from('cadetes')
    .update({ estado })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /api/admin/cadetes/:id]', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar el cadete' });
  }

  return res.json(data);
});

export default router;
