import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';
import { encontrarCadete, estimarEspera } from '../lib/matching.js';

const router = Router();

// ── POST /api/ordenes ──────────────────────────────────────────────────────
// Crea un pedido y dispara el motor de asignación automática.
// Tipos:
//   comercio:   { comercio_id, cliente_id, cliente_nombre, direccion, zona, zona_label, precio, origen_lat?, origen_lng? }
//   particular: { usuario_id, descripcion, origen, destino, zona, zona_label, precio, metodo_pago, origen_lat?, origen_lng? }
router.post('/', async (req, res) => {
  const body = req.body;
  const errores = [];

  const esComercio   = Boolean(body.comercio_id);
  const esParticular = Boolean(body.usuario_id);

  if (!esComercio && !esParticular) {
    return res.status(400).json({ error: 'Falta comercio_id o usuario_id' });
  }

  if (esComercio) {
    if (!body.cliente_id)  errores.push('cliente_id es requerido');
    if (!body.direccion)   errores.push('direccion es requerida');
    if (!body.zona)        errores.push('zona es requerida');
    if (!body.precio)      errores.push('precio es requerido');
  }

  if (esParticular) {
    if (!body.descripcion || body.descripcion.trim().length < 5)
      errores.push('descripcion debe tener al menos 5 caracteres');
    if (!body.origen)      errores.push('origen es requerido');
    if (!body.destino)     errores.push('destino es requerido');
    if (!body.zona)        errores.push('zona es requerida');
    if (!body.precio)      errores.push('precio es requerido');
    if (!body.metodo_pago) errores.push('metodo_pago es requerido');
  }

  if (errores.length > 0) {
    return res.status(400).json({ errores });
  }

  const ordenData = {
    estado:    'pendiente',
    prioridad: esComercio ? 'alta' : 'baja',
    tipo:      esComercio ? 'comercio' : 'particular',
    es_particular: esParticular,

    // Comercio
    comercio_id:    body.comercio_id    ?? null,
    cliente_id:     body.cliente_id     ?? null,
    cliente_nombre: body.cliente_nombre ?? null,
    direccion:      body.direccion      ?? body.destino ?? null,
    zona:           body.zona           ?? null,
    zona_label:     body.zona_label     ?? null,
    precio:         body.precio         ?? null,

    // Particular
    solicitante_id: body.usuario_id ?? null,
    descripcion:    body.descripcion ?? null,
    origen:         body.origen      ?? null,
    destino:        body.destino     ?? null,
    metodo_pago:    body.metodo_pago ?? null,

    // GPS origen (opcional, mejora el matching)
    origen_lat: body.origen_lat ?? null,
    origen_lng: body.origen_lng ?? null,

    rechazos: [],
  };

  const { data: orden, error: errorInsert } = await supabase
    .from('ordenes')
    .insert(ordenData)
    .select()
    .single();

  if (errorInsert) {
    console.error('[POST /api/ordenes] insert:', errorInsert.message);
    return res.status(500).json({ error: 'No se pudo crear la orden' });
  }

  // ── Motor de asignación automática ────────────────────────────────────
  const mejorCadete = await encontrarCadete(orden);

  if (mejorCadete) {
    const { error: errorAsignacion } = await supabase
      .from('ordenes')
      .update({ asignado_a_id: mejorCadete.id })
      .eq('id', orden.id);

    if (errorAsignacion) {
      console.error('[POST /api/ordenes] asignacion:', errorAsignacion.message);
      return res.status(500).json({ error: 'La orden se creó, pero no se pudo asignar cadete' });
    }

    orden.asignado_a_id = mejorCadete.id;
    return res.status(201).json(orden);
  }

  // Sin cadetes disponibles: queda en broadcast para que la vea el primer cadete
  // que se conecte en la zona.
  const espera = await estimarEspera(orden.zona);
  const broadcastEn = new Date().toISOString();
  const { data: ordenBroadcast, error: errorBroadcast } = await supabase
    .from('ordenes')
    .update({ broadcast_en: broadcastEn, asignado_a_id: null })
    .eq('id', orden.id)
    .select()
    .single();

  if (errorBroadcast) {
    console.error('[POST /api/ordenes] broadcast:', errorBroadcast.message);
    return res.status(500).json({ error: 'La orden se creó, pero no se pudo abrir a cadetes' });
  }

  return res.status(201).json({ ...ordenBroadcast, sin_cadetes: true, espera_minutos: espera });
});

// ── GET /api/ordenes ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { comercio_id, usuario_id, cadete_id, zona, estado, disponibles } = req.query;

  let query = supabase
    .from('ordenes')
    .select('*')
    .order('creado_en', { ascending: false });

  if (comercio_id) query = query.eq('comercio_id', comercio_id);
  if (usuario_id)  query = query.eq('solicitante_id', usuario_id);
  if (estado)      query = query.eq('estado', estado);
  if (zona)        query = query.eq('zona', zona);
  if (cadete_id) {
    query = query.or(`cadete_id.eq.${cadete_id},asignado_a_id.eq.${cadete_id}`);
  }
  if (disponibles === 'true') {
    query = query.eq('estado', 'pendiente').not('broadcast_en', 'is', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[GET /api/ordenes]', error.message);
    return res.status(500).json({ error: 'No se pudo obtener las órdenes' });
  }

  return res.json(data);
});

// ── PATCH /api/ordenes/:id/aceptar ────────────────────────────────────────
// Cadete acepta: debe ser el asignado directamente O un broadcast abierto
router.patch('/:id/aceptar', async (req, res) => {
  const { id }        = req.params;
  const { cadete_id } = req.body;

  if (!cadete_id) {
    return res.status(400).json({ error: 'cadete_id es requerido' });
  }

  const { data: orden, error: errorBuscar } = await supabase
    .from('ordenes')
    .select('id, estado, zona, asignado_a_id, broadcast_en, rechazos')
    .eq('id', id)
    .single();

  if (errorBuscar || !orden) {
    return res.status(404).json({ error: 'Orden no encontrada' });
  }

  if (orden.estado !== 'pendiente') {
    return res.status(409).json({ error: `La orden ya no está disponible (estado: ${orden.estado})` });
  }

  // Verificar que el cadete tiene derecho a aceptar
  const { data: cadete, error: errorCadete } = await supabase
    .from('cadetes')
    .select('id, zona, estado, activo')
    .eq('id', cadete_id)
    .single();

  if (errorCadete || !cadete || !cadete.activo || cadete.estado === 'offline') {
    return res.status(403).json({ error: 'Cadete no disponible para aceptar pedidos' });
  }

  const esAsignado  = orden.asignado_a_id === cadete_id;
  const esBroadcast = Boolean(orden.broadcast_en)
    && orden.zona === cadete.zona
    && !orden.rechazos?.includes(cadete_id);

  if (!esAsignado && !esBroadcast) {
    return res.status(403).json({ error: 'Este pedido no está disponible para vos' });
  }

  const [resOrden, resCadete] = await Promise.all([
    supabase
      .from('ordenes')
      .update({
        estado:       'asignada',
        cadete_id,
        asignado_a_id: null,
        broadcast_en: null,
        asignada_en:  new Date().toISOString(),
      })
      .eq('id', id)
      .eq('estado', 'pendiente') // optimistic lock
      .select()
      .single(),

    supabase
      .from('cadetes')
      .update({ estado: 'en_viaje' })
      .eq('id', cadete_id),
  ]);

  if (resOrden.error || !resOrden.data) {
    return res.status(409).json({ error: 'Otro cadete se adelantó, el pedido ya fue tomado' });
  }

  if (resCadete.error) {
    console.error('[PATCH /aceptar] cadete:', resCadete.error.message);
  }

  return res.json(resOrden.data);
});

// ── PATCH /api/ordenes/:id/rechazar ────────────────────────────────────────
// Cadete rechaza. Se busca el siguiente cadete disponible o se pasa a broadcast.
router.patch('/:id/rechazar', async (req, res) => {
  const { id }        = req.params;
  const { cadete_id } = req.body;

  if (!cadete_id) {
    return res.status(400).json({ error: 'cadete_id es requerido' });
  }

  const { data: orden, error: errorBuscar } = await supabase
    .from('ordenes')
    .select('id, estado, zona, rechazos, asignado_a_id, broadcast_en, origen_lat, origen_lng')
    .eq('id', id)
    .single();

  if (errorBuscar || !orden) {
    return res.status(404).json({ error: 'Orden no encontrada' });
  }

  if (orden.estado !== 'pendiente') {
    return res.status(409).json({ error: 'La orden ya no está pendiente' });
  }

  // Registrar rechazo
  const rechazosActualizados = [...(orden.rechazos ?? []), cadete_id];

  // Buscar próximo candidato excluyendo a todos los que rechazaron
  const ordenConRechazos = { ...orden, rechazos: rechazosActualizados };
  const siguienteCadete  = await encontrarCadete(ordenConRechazos);

  const updateData = { rechazos: rechazosActualizados };

  if (siguienteCadete) {
    updateData.asignado_a_id = siguienteCadete.id;
  } else {
    // Nadie más disponible individualmente → broadcast a todos en la zona
    updateData.asignado_a_id = null;
    updateData.broadcast_en  = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('ordenes')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /rechazar]', error.message);
    return res.status(500).json({ error: 'No se pudo registrar el rechazo' });
  }

  return res.json({
    ...data,
    siguiente: siguienteCadete ? 'asignado' : 'broadcast',
  });
});

// ── PATCH /api/ordenes/:id/en_camino ─────────────────────────────────────
router.patch('/:id/en_camino', async (req, res) => {
  const { id }        = req.params;
  const { cadete_id } = req.body;

  if (!cadete_id) {
    return res.status(400).json({ error: 'cadete_id es requerido' });
  }

  const { data: orden, error: errorBuscar } = await supabase
    .from('ordenes')
    .select('id, estado, cadete_id')
    .eq('id', id)
    .single();

  if (errorBuscar || !orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (orden.cadete_id !== cadete_id) return res.status(403).json({ error: 'No es tu orden' });
  if (orden.estado !== 'asignada') return res.status(409).json({ error: `Estado inválido: ${orden.estado}` });

  const { data, error } = await supabase
    .from('ordenes')
    .update({ estado: 'en_camino' })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /en_camino]', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar la orden' });
  }

  return res.json(data);
});

// ── PATCH /api/ordenes/:id/entregar ──────────────────────────────────────
// Entrega completada: calcula split 82/18 y actualiza ganancias del cadete
router.patch('/:id/entregar', async (req, res) => {
  const { id }        = req.params;
  const { cadete_id } = req.body;

  if (!cadete_id) {
    return res.status(400).json({ error: 'cadete_id es requerido' });
  }

  const { data: orden, error: errorBuscar } = await supabase
    .from('ordenes')
    .select('id, estado, cadete_id, precio, cliente_id')
    .eq('id', id)
    .single();

  if (errorBuscar || !orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (orden.cadete_id !== cadete_id) return res.status(403).json({ error: 'No es tu orden' });
  if (!['asignada', 'en_camino'].includes(orden.estado)) {
    return res.status(409).json({ error: `Estado inválido: ${orden.estado}` });
  }

  const precio         = Number(orden.precio ?? 0);
  const gananciaCadete = Math.round(precio * 0.82 * 100) / 100;
  const gananciaYendo  = Math.round(precio * 0.18 * 100) / 100;
  const ahora          = new Date().toISOString();

  const { data: cadete } = await supabase
    .from('cadetes')
    .select('ganancias_hoy, ganancias_semana, ganancias_mes, viajes_hoy, viajes_semana, viajes_mes')
    .eq('id', cadete_id)
    .single();

  const [resOrden, resCadete] = await Promise.all([
    supabase
      .from('ordenes')
      .update({
        estado:          'entregada',
        entregada_en:    ahora,
        ganancia_cadete: gananciaCadete,
        ganancia_yendo:  gananciaYendo,
      })
      .eq('id', id)
      .select()
      .single(),

    supabase
      .from('cadetes')
      .update({
        estado:              'disponible',
        ultima_entrega_en:   ahora,
        ganancias_hoy:    (cadete?.ganancias_hoy    ?? 0) + gananciaCadete,
        ganancias_semana: (cadete?.ganancias_semana ?? 0) + gananciaCadete,
        ganancias_mes:    (cadete?.ganancias_mes    ?? 0) + gananciaCadete,
        viajes_hoy:       (cadete?.viajes_hoy       ?? 0) + 1,
        viajes_semana:    (cadete?.viajes_semana    ?? 0) + 1,
        viajes_mes:       (cadete?.viajes_mes       ?? 0) + 1,
      })
      .eq('id', cadete_id),
  ]);

  if (resOrden.error) {
    console.error('[PATCH /entregar] orden:', resOrden.error.message);
    return res.status(500).json({ error: 'No se pudo actualizar la orden' });
  }

  if (resCadete.error) {
    console.error('[PATCH /entregar] cadete:', resCadete.error.message);
  }

  if (orden.cliente_id) {
    const { data: clienteData } = await supabase
      .from('clientes')
      .select('veces_usado')
      .eq('id', orden.cliente_id)
      .single();
    await supabase
      .from('clientes')
      .update({ veces_usado: (clienteData?.veces_usado ?? 0) + 1 })
      .eq('id', orden.cliente_id);
  }

  return res.json(resOrden.data);
});

export default router;
