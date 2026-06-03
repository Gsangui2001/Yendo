import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';

const router = Router();

// ── GET /api/cadetes/disponibles?zona=Ciudad+de+Colón ─────────────────────
router.get('/disponibles', async (req, res) => {
  const { zona } = req.query;

  if (!zona) {
    return res.status(400).json({ error: 'El parámetro zona es requerido' });
  }

  const { data, error } = await supabase
    .from('cadetes')
    .select('id, nombre, telefono, zona, estado, viajes_completados, ubicacion_lat, ubicacion_lng')
    .eq('estado', 'disponible')
    .eq('zona', zona);

  if (error) {
    console.error('[GET /api/cadetes/disponibles]', error.message);
    return res.status(500).json({ error: 'No se pudo obtener los cadetes' });
  }

  return res.json({ zona, total: data.length, cadetes: data });
});

export default router;
