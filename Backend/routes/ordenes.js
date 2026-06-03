import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';

const router = Router();

// ── POST /api/ordenes ──────────────────────────────────────────────────────
// Crea un pedido. Acepta dos tipos:
//   - comercio:   { comercio_id, cliente_id, cliente_nombre, direccion, zona, zona_label, precio }
//   - particular: { usuario_id, descripcion, origen, destino, metodo_pago }
router.post('/', async (req, res) => {
  const body = req.body;

  // ── Validación ────────────────────────────────────────────────────────
  const errores = [];

  if (!body.estado) body.estado = 'pendiente';

  const esComercio   = Boolean(body.comercio_id);
  const esParticular = Boolean(body.usuario_id);

  if (!esComercio && !esParticular) {
    return res.status(400).json({ error: 'Falta comercio_id o usuario_id' });
  }

  if (esComercio) {
    if (!body.cliente_id)    errores.push('cliente_id es requerido');
    if (!body.direccion)     errores.push('direccion es requerida');
    if (!body.zona)          errores.push('zona es requerida');
    if (!body.precio)        errores.push('precio es requerido');
  }

  if (esParticular) {
    if (!body.descripcion || body.descripcion.trim().length < 10)
      errores.push('descripcion debe tener al menos 10 caracteres');
    if (!body.origen)        errores.push('origen es requerido');
    if (!body.destino)       errores.push('destino es requerido');
    if (!body.metodo_pago)   errores.push('metodo_pago es requerido');
  }

  if (errores.length > 0) {
    return res.status(400).json({ errores });
  }

  // ── Armar el registro ─────────────────────────────────────────────────
  const orden = {
    estado:    'pendiente',
    prioridad: esComercio ? 'alta' : 'baja',
    tipo:      esComercio ? 'comercio' : 'particular',
    creado_en: new Date().toISOString(),

    // Comercio
    comercio_id:    body.comercio_id    ?? null,
    cliente_id:     body.cliente_id     ?? null,
    cliente_nombre: body.cliente_nombre ?? null,
    direccion:      body.direccion      ?? null,
    zona:           body.zona           ?? null,
    zona_label:     body.zona_label     ?? null,
    precio:         body.precio         ?? null,

    // Particular
    usuario_id:  body.usuario_id  ?? null,
    descripcion: body.descripcion ?? null,
    origen:      body.origen      ?? null,
    destino:     body.destino     ?? null,
    metodo_pago: body.metodo_pago ?? null,
  };

  // ── Insertar en Supabase ──────────────────────────────────────────────
  const { data, error } = await supabase
    .from('ordenes')
    .insert(orden)
    .select()
    .single();

  if (error) {
    console.error('[POST /api/ordenes]', error.message);
    return res.status(500).json({ error: 'No se pudo crear la orden' });
  }

  return res.status(201).json(data);
});

// ── GET /api/ordenes ───────────────────────────────────────────────────────
// Devuelve órdenes filtradas por comercio_id o usuario_id
router.get('/', async (req, res) => {
  const { comercio_id, usuario_id, estado } = req.query;

  let query = supabase
    .from('ordenes')
    .select('*')
    .order('creado_en', { ascending: false });

  if (comercio_id) query = query.eq('comercio_id', comercio_id);
  if (usuario_id)  query = query.eq('usuario_id', usuario_id);
  if (estado)      query = query.eq('estado', estado);

  const { data, error } = await query;

  if (error) {
    console.error('[GET /api/ordenes]', error.message);
    return res.status(500).json({ error: 'No se pudo obtener las órdenes' });
  }

  return res.json(data);
});

// ── PATCH /api/ordenes/:id/aceptar ────────────────────────────────────────
// El cadete acepta una orden: orden → "asignada", cadete → "en_viaje"
router.patch('/:id/aceptar', async (req, res) => {
  const { id }       = req.params;
  const { cadete_id } = req.body;

  if (!cadete_id) {
    return res.status(400).json({ error: 'cadete_id es requerido' });
  }

  // ── Verificar que la orden existe y está pendiente ────────────────────
  const { data: orden, error: errorBuscar } = await supabase
    .from('ordenes')
    .select('id, estado')
    .eq('id', id)
    .single();

  if (errorBuscar || !orden) {
    return res.status(404).json({ error: 'Orden no encontrada' });
  }

  if (orden.estado !== 'pendiente') {
    return res.status(409).json({
      error: `La orden ya no está disponible (estado: ${orden.estado})`,
    });
  }

  // ── Actualizar orden y cadete en paralelo ─────────────────────────────
  const [resOrden, resCadete] = await Promise.all([
    supabase
      .from('ordenes')
      .update({ estado: 'asignada', cadete_id, asignada_en: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single(),

    supabase
      .from('cadetes')
      .update({ estado: 'en_viaje' })
      .eq('id', cadete_id),
  ]);

  if (resOrden.error) {
    console.error('[PATCH /api/ordenes/:id/aceptar] orden:', resOrden.error.message);
    return res.status(500).json({ error: 'No se pudo actualizar la orden' });
  }

  if (resCadete.error) {
    console.error('[PATCH /api/ordenes/:id/aceptar] cadete:', resCadete.error.message);
    // La orden ya quedó asignada — loguear pero no fallar la respuesta
  }

  return res.json(resOrden.data);
});

export default router;
