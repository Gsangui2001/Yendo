import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';

const router = Router();

// ── GET /api/cadetes/disponibles?zona=ciudad_colon ───────────────────────
router.get('/disponibles', async (req, res) => {
  const { zona } = req.query;

  if (!zona) {
    return res.status(400).json({ error: 'El parámetro zona es requerido' });
  }

  const { data, error } = await supabase
    .from('cadetes')
    .select('id, nombre, telefono, zona, estado, ubicacion_lat, ubicacion_lng, ultima_entrega_en')
    .eq('estado', 'disponible')
    .eq('zona', zona)
    .eq('activo', true);

  if (error) {
    console.error('[GET /api/cadetes/disponibles]', error.message);
    return res.status(500).json({ error: 'No se pudo obtener los cadetes' });
  }

  return res.json({ zona, total: data.length, cadetes: data });
});

// ── PUT /api/cadetes/:id/ubicacion ─────────────────────────────────────────
// Actualiza las coordenadas GPS del cadete. Se llama cada ~5 segundos desde la app.
router.put('/:id/ubicacion', async (req, res) => {
  const { id }        = req.params;
  const { lat, lng }  = req.body;

  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'lat y lng son requeridos' });
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (isNaN(latNum) || isNaN(lngNum)) {
    return res.status(400).json({ error: 'lat y lng deben ser números' });
  }

  // Solo actualizar si el cadete no está offline
  const { data, error } = await supabase
    .from('cadetes')
    .update({ ubicacion_lat: latNum, ubicacion_lng: lngNum })
    .eq('id', id)
    .neq('estado', 'offline')
    .select('id, ubicacion_lat, ubicacion_lng, estado')
    .single();

  if (error) {
    console.error('[PUT /api/cadetes/:id/ubicacion]', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar la ubicación' });
  }

  if (!data) {
    return res.status(409).json({ error: 'Cadete offline o no encontrado' });
  }

  return res.json(data);
});

// ── PATCH /api/cadetes/:id/estado ─────────────────────────────────────────
// Toggle disponible/offline (el cadete abre/cierra su jornada)
router.patch('/:id/estado', async (req, res) => {
  const { id }     = req.params;
  const { estado } = req.body;

  const ESTADOS_VALIDOS = ['disponible', 'offline'];
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: `estado debe ser: ${ESTADOS_VALIDOS.join(' o ')}` });
  }

  const updateData = { estado };
  if (estado === 'disponible') {
    updateData.jornada_inicio = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('cadetes')
    .update(updateData)
    .eq('id', id)
    .select('id, nombre, estado, jornada_inicio')
    .single();

  if (error) {
    console.error('[PATCH /api/cadetes/:id/estado]', error.message);
    return res.status(500).json({ error: 'No se pudo cambiar el estado' });
  }

  return res.json(data);
});

export default router;
