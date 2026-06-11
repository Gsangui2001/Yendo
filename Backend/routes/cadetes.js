import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';
import { authenticate, isAdmin, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

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

// ── GET /api/cadetes/activos ───────────────────────────────────────────────
// Lista operativa para comercios/privados: SOLO columnas seguras.
// Sin teléfono ni ganancias (el teléfono sale de /:id/contacto, validado).
router.get('/activos', async (_req, res) => {
  const { data, error } = await supabase
    .from('cadetes')
    .select('id, nombre, zona, estado, ubicacion_lat, ubicacion_lng')
    .in('estado', ['disponible', 'en_viaje'])
    .eq('activo', true)
    .limit(50);

  if (error) {
    console.error('[GET /api/cadetes/activos]', error.message);
    return res.status(500).json({ error: 'No se pudo obtener los cadetes' });
  }

  return res.json(data);
});

// ── GET /api/cadetes/:id/contacto ──────────────────────────────────────────
// Nombre + teléfono + GPS del cadete, SOLO para quien tiene un pedido
// activo (asignada/en_camino) con él. Admin siempre puede.
router.get('/:id/contacto', async (req, res) => {
  const { id } = req.params;

  if (!isAdmin(req)) {
    let query = supabase
      .from('ordenes')
      .select('id')
      .in('estado', ['asignada', 'en_camino'])
      .or(`cadete_id.eq.${id},asignado_a_id.eq.${id}`)
      .limit(1);

    if (req.perfil?.rol === 'comercio') {
      const { data: comercios } = await supabase
        .from('comercios').select('id').eq('owner_id', req.user.id);
      const ids = (comercios ?? []).map((c) => c.id);
      if (!ids.length) return res.status(403).json({ error: 'Sin pedido activo con este cadete' });
      query = query.in('comercio_id', ids);
    } else if (req.perfil?.rol === 'privado') {
      query = query.eq('solicitante_id', req.user.id);
    } else if (req.perfil?.rol === 'cadete' && req.user.id === id) {
      // el cadete puede pedir su propio contacto
    } else {
      return res.status(403).json({ error: 'No autorizado' });
    }

    if (req.perfil?.rol !== 'cadete') {
      const { data: activas } = await query;
      if (!activas?.length) {
        return res.status(403).json({ error: 'Sin pedido activo con este cadete' });
      }
    }
  }

  const { data, error } = await supabase
    .from('cadetes')
    .select('id, nombre, telefono, estado, ubicacion_lat, ubicacion_lng')
    .eq('id', id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Cadete no encontrado' });
  }

  return res.json(data);
});

// ── PUT /api/cadetes/:id/ubicacion ─────────────────────────────────────────
// Actualiza las coordenadas GPS del cadete. Se llama cada ~5 segundos desde la app.
router.put('/:id/ubicacion', async (req, res) => {
  const { id }        = req.params;
  const { lat, lng }  = req.body;

  if (!isAdmin(req) && (req.perfil?.rol !== 'cadete' || req.user.id !== id)) {
    return res.status(403).json({ error: 'No podes actualizar la ubicacion de otro cadete' });
  }

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
router.patch('/:id/estado', requireRole('cadete', 'admin'), async (req, res) => {
  const { id }     = req.params;
  const { estado } = req.body;

  if (!isAdmin(req) && req.user.id !== id) {
    return res.status(403).json({ error: 'No podes cambiar el estado de otro cadete' });
  }

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
