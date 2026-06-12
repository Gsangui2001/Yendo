import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';
import { encontrarCadete, estimarEspera } from '../lib/matching.js';
import { authenticate, isAdmin, requireRole } from '../middleware/auth.js';
import { calcularPrecio, FEE_YENDO } from '../lib/pricing.js';
import { leerConfigServicio } from './precios.js';
import { distanciaRutaKm } from '../lib/geo.js';
import { resolverCoordenadas, cargarConCoords, coordsValidas } from '../lib/ubicaciones.js';

const router = Router();
router.use(authenticate);

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

  // Precio: por km (distancia_km) o legacy por zona (precio). Uno de los dos.
  const tieneDistancia = Number.isFinite(Number(body.distancia_km)) && Number(body.distancia_km) > 0;

  if (esComercio) {
    if (!body.cliente_id)  errores.push('cliente_id es requerido');
    if (!body.direccion)   errores.push('direccion es requerida');
    // zona ya NO es requerida: el precio sale de la distancia; para matching
    // es solo una preferencia y puede derivarse del cliente.
  }

  if (esParticular) {
    if (!body.descripcion || body.descripcion.trim().length < 5)
      errores.push('descripcion debe tener al menos 5 caracteres');
    if (!body.origen)      errores.push('origen es requerido');
    if (!body.destino)     errores.push('destino es requerido');
    if (!body.zona)        errores.push('zona es requerida');
    if (!body.metodo_pago) errores.push('metodo_pago es requerido');
  }

  if (tieneDistancia && Number(body.distancia_km) > 100) errores.push('distancia_km inválida');
  if (body.propina_cadete != null && (Number(body.propina_cadete) < 0 || Number(body.propina_cadete) > 50000))
    errores.push('propina_cadete inválida');

  if (errores.length > 0) {
    return res.status(400).json({ errores });
  }

  if (esParticular && !isAdmin(req) && body.usuario_id !== req.user.id) {
    return res.status(403).json({ error: 'No podes crear pedidos para otro usuario' });
  }

  let comercioRow = null;
  let clienteRow  = null;
  if (esComercio) {
    const { data: comercio, error: comercioError } = await cargarConCoords('comercios', body.comercio_id, 'id, owner_id, activo, direccion');

    if (comercioError || !comercio) {
      return res.status(403).json({ error: 'Comercio no habilitado para crear este pedido' });
    }
    comercioRow = comercio;

    if (!isAdmin(req)) {
      if (req.perfil?.rol !== 'comercio') {
        return res.status(403).json({ error: 'Solo comercios pueden crear pedidos comerciales' });
      }
      if (comercio.owner_id !== req.user.id || !comercio.activo) {
        return res.status(403).json({ error: 'Comercio no habilitado para crear este pedido' });
      }
    }

    const { data: cliente, error: clienteError } = await cargarConCoords('clientes', body.cliente_id, 'id, comercio_id, direccion, zona');
    if (!isAdmin(req) && (clienteError || !cliente || cliente.comercio_id !== body.comercio_id)) {
      return res.status(403).json({ error: 'Cliente no pertenece al comercio indicado' });
    }
    if (cliente && cliente.comercio_id === body.comercio_id) clienteRow = cliente;
  }

  // Direcciones guardadas del particular (para usar/persistir sus lat/lng)
  let dirOrigenRow = null, dirDestinoRow = null;
  if (esParticular) {
    for (const [id, asignar] of [
      [body.origen_direccion_id,  (d) => { dirOrigenRow  = d; }],
      [body.destino_direccion_id, (d) => { dirDestinoRow = d; }],
    ]) {
      if (!id) continue;
      const { data: dir } = await cargarConCoords('direcciones', id, 'id, usuario_id, direccion');
      if (dir && (isAdmin(req) || dir.usuario_id === req.user.id)) asignar(dir);
    }
  }

  // ── Distancia automática EN BACKEND ───────────────────────────────────
  // Origen: dirección del comercio registrado (comercio) o la cargada (particular).
  // Destino: dirección de entrega. Prioridad: coordenadas YA GUARDADAS en
  // comercio/cliente/dirección; geocoder solo si faltan (y se persisten).
  const direccionOrigen  = esComercio ? (comercioRow?.direccion ?? null) : (body.origen ?? null);
  const direccionDestino = esComercio ? (body.direccion ?? null) : (body.destino ?? null);
  const entidadOrigen  = esComercio
    ? (comercioRow ? { tabla: 'comercios', ...comercioRow } : null)
    : (dirOrigenRow ? { tabla: 'direcciones', ...dirOrigenRow } : null);
  const entidadDestino = esComercio
    ? (clienteRow ? { tabla: 'clientes', ...clienteRow } : null)
    : (dirDestinoRow ? { tabla: 'direcciones', ...dirDestinoRow } : null);

  let geoOrigen = null, geoDestino = null, distanciaKm = null, distanciaPor = null;
  try {
    if (direccionOrigen?.trim() && direccionDestino?.trim()) {
      geoOrigen = await resolverCoordenadas(direccionOrigen, entidadOrigen);
      if (geoOrigen?.fuera_de_zona) geoOrigen = null; // ambigua: no usar
      if (geoOrigen) geoDestino = await resolverCoordenadas(direccionDestino, entidadDestino);
      if (geoDestino?.fuera_de_zona) geoDestino = null;
      if (geoOrigen && geoDestino) {
        const ruta = await distanciaRutaKm(geoOrigen, geoDestino);
        const km = Math.max(0.1, ruta.km);
        if (km <= 100) {
          distanciaKm  = km;
          distanciaPor = ruta.metodo;
        }
      }
    }
  } catch (err) {
    console.warn('[POST /api/ordenes] geocoder no disponible:', err.message);
  }

  // Fallback: km cargados a mano si la geocodificación no resolvió
  if (distanciaKm == null && tieneDistancia) {
    distanciaKm  = Number(body.distancia_km);
    distanciaPor = 'manual';
  }

  if (distanciaKm == null && !body.precio) {
    return res.status(422).json({
      error: 'No pudimos confirmar las direcciones. Agregá ciudad/localidad, o cargá los km a mano.',
    });
  }

  // ── Cálculo financiero EN BACKEND (no se confía en montos del frontend) ──
  const config     = await leerConfigServicio();
  const metodoPago = body.metodo_pago || 'efectivo';
  const propina    = Math.max(0, Number(body.propina_cadete) || 0);
  const r2 = (n) => Math.round(n * 100) / 100;

  let desglose;
  if (distanciaKm != null) {
    desglose = calcularPrecio({
      tipo: esComercio ? 'comercio' : 'particular',
      distancia_km: distanciaKm,
      propina_cadete: propina,
      metodo_pago: metodoPago,
      config,
    });
  } else {
    // Legacy por zona: el precio viene del front, pero el reparto, la propina,
    // el recargo y la liquidación se calculan igual acá.
    const recargoActivo = Boolean(config.recargo_feriado_activo) || Boolean(config.recargo_lluvia_activo);
    const recargo       = recargoActivo ? Number(config.recargo_monto ?? 500) : 0;
    const precioEnvio   = r2(Number(body.precio) + recargo);
    const gananciaYendo = r2(precioEnvio * FEE_YENDO);
    const gananciaCad   = r2(precioEnvio - gananciaYendo);
    const totalCadete   = r2(gananciaCad + propina);
    const esEfectivo    = ['efectivo', 'paga_cliente'].includes(String(metodoPago).toLowerCase());
    desglose = {
      distancia_km: null, precio_base: null, km_incluidos: null, precio_km_extra: null,
      recargo_clima_feriado: recargo,
      propina_cadete: r2(propina),
      precio_envio: precioEnvio,
      total_cliente: r2(precioEnvio + propina),
      ganancia_yendo: gananciaYendo,
      ganancia_cadete: gananciaCad,
      total_cadete: totalCadete,
      efectivo_a_rendir:        esEfectivo ? gananciaYendo : 0,
      monto_a_depositar_cadete: esEfectivo ? 0 : totalCadete,
    };
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
    // Zona: secundaria (solo preferencia de matching); si el comercio no la
    // manda, se hereda del cliente guardado.
    zona:           body.zona           ?? clienteRow?.zona ?? null,
    zona_label:     body.zona_label     ?? null,

    // Particular
    solicitante_id: body.usuario_id ?? null,
    descripcion:    body.descripcion ?? null,
    origen:         body.origen      ?? null,
    destino:        body.destino     ?? null,
    metodo_pago:    metodoPago,

    // Desglose financiero (fuente de verdad: lib/pricing.js)
    precio:                   desglose.precio_envio, // compat con listados existentes
    distancia_km:             desglose.distancia_km,
    precio_base:              desglose.precio_base,
    km_incluidos:             desglose.km_incluidos,
    precio_km_extra:          desglose.precio_km_extra,
    recargo_clima_feriado:    desglose.recargo_clima_feriado,
    propina_cadete:           desglose.propina_cadete,
    precio_envio:             desglose.precio_envio,
    total_cliente:            desglose.total_cliente,
    ganancia_yendo:           desglose.ganancia_yendo,
    ganancia_cadete:          desglose.ganancia_cadete,
    total_cadete:             desglose.total_cadete,
    efectivo_a_rendir:        desglose.efectivo_a_rendir,
    monto_a_depositar_cadete: desglose.monto_a_depositar_cadete,
    precio_calculado_en:      new Date().toISOString(),

    // GPS: origen mejora el matching, destino alimenta el tracking en mapa.
    // Prioridad: GPS real del dispositivo si vino Y es razonable (caja
    // Argentina); si no, lo geocodificado por el backend.
    origen_lat:  (coordsValidas(Number(body.origen_lat), Number(body.origen_lng)) ? Number(body.origen_lat) : null) ?? geoOrigen?.lat ?? null,
    origen_lng:  (coordsValidas(Number(body.origen_lat), Number(body.origen_lng)) ? Number(body.origen_lng) : null) ?? geoOrigen?.lng ?? null,
    destino_lat: geoDestino?.lat ?? null,
    destino_lng: geoDestino?.lng ?? null,
    distancia_calculada_en:  distanciaKm != null ? new Date().toISOString() : null,
    distancia_calculada_por: distanciaPor,

    rechazos: [],
  };

  let { data: orden, error: errorInsert } = await supabase
    .from('ordenes')
    .insert(ordenData)
    .select()
    .single();

  // Migraciones sin aplicar: reintentar quitando columnas nuevas en cascada
  // (primero las de la 005, después las financieras de la 004).
  const esErrorColumna = (e) => e && /Could not find|does not exist/i.test(e.message);
  const campos005 = ['destino_lat', 'destino_lng', 'distancia_calculada_en', 'distancia_calculada_por'];
  const campos004 = [
    'distancia_km', 'precio_base', 'km_incluidos', 'precio_km_extra',
    'recargo_clima_feriado', 'propina_cadete', 'precio_envio', 'total_cliente',
    'total_cadete', 'efectivo_a_rendir', 'monto_a_depositar_cadete', 'precio_calculado_en',
  ];
  let base = { ...ordenData };
  for (const grupo of [campos005, campos004]) {
    if (!esErrorColumna(errorInsert)) break;
    console.warn('[POST /api/ordenes] columnas ausentes, reintento sin', grupo[0], '...:', errorInsert.message);
    grupo.forEach((c) => delete base[c]);
    ({ data: orden, error: errorInsert } = await supabase
      .from('ordenes')
      .insert(base)
      .select()
      .single());
  }

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

  if (!isAdmin(req)) {
    if (req.perfil?.rol === 'comercio') {
      const { data: comercios, error: comerciosError } = await supabase
        .from('comercios')
        .select('id')
        .eq('owner_id', req.user.id);

      if (comerciosError) {
        return res.status(500).json({ error: 'No se pudo validar el comercio' });
      }

      const ids = (comercios || []).map((comercio) => comercio.id);
      if (!ids.length) return res.json([]);
      if (comercio_id && !ids.includes(comercio_id)) {
        return res.status(403).json({ error: 'No podes leer pedidos de otro comercio' });
      }
      query = query.in('comercio_id', ids);
    } else if (req.perfil?.rol === 'privado') {
      if (usuario_id && usuario_id !== req.user.id) {
        return res.status(403).json({ error: 'No podes leer pedidos de otro usuario' });
      }
      query = query.eq('solicitante_id', req.user.id);
    } else if (req.perfil?.rol === 'cadete') {
      // Ve: sus pedidos, los asignados a él y TODOS los broadcasts pendientes
      // (la zona es preferencia del matching, no un muro: en una ciudad chica
      // cualquier cadete activo puede tomar un pedido en cola).
      query = query.or(
        `cadete_id.eq.${req.user.id},asignado_a_id.eq.${req.user.id},and(estado.eq.pendiente,broadcast_en.not.is.null)`
      );
    } else {
      return res.status(403).json({ error: 'Rol no autorizado' });
    }
  }

  if (comercio_id) query = query.eq('comercio_id', comercio_id);
  if (usuario_id && isAdmin(req))  query = query.eq('solicitante_id', usuario_id);
  if (estado)      query = query.eq('estado', estado);
  if (zona)        query = query.eq('zona', zona);
  if (cadete_id && isAdmin(req)) {
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
router.patch('/:id/aceptar', requireRole('cadete', 'admin'), async (req, res) => {
  const { id }        = req.params;
  const { cadete_id } = req.body;

  if (!cadete_id) {
    return res.status(400).json({ error: 'cadete_id es requerido' });
  }

  if (!isAdmin(req) && cadete_id !== req.user.id) {
    return res.status(403).json({ error: 'No podes aceptar pedidos por otro cadete' });
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

  // Un cadete lleva UN pedido a la vez: si ya tiene uno activo, no puede
  // aceptar otro hasta marcarlo entregado.
  const { data: ordenActiva } = await supabase
    .from('ordenes')
    .select('id')
    .eq('cadete_id', cadete_id)
    .in('estado', ['asignada', 'en_camino'])
    .limit(1)
    .maybeSingle();
  if (ordenActiva) {
    return res.status(409).json({ error: 'Ya tenés un pedido en curso. Entregalo antes de aceptar otro.' });
  }

  // Broadcast: cualquier cadete activo puede tomarlo (la zona no bloquea),
  // salvo que ya lo haya rechazado antes.
  const esAsignado  = orden.asignado_a_id === cadete_id;
  const esBroadcast = Boolean(orden.broadcast_en)
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
router.patch('/:id/rechazar', requireRole('cadete', 'admin'), async (req, res) => {
  const { id }        = req.params;
  const { cadete_id } = req.body;

  if (!cadete_id) {
    return res.status(400).json({ error: 'cadete_id es requerido' });
  }

  if (!isAdmin(req) && cadete_id !== req.user.id) {
    return res.status(403).json({ error: 'No podes rechazar pedidos por otro cadete' });
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
router.patch('/:id/en_camino', requireRole('cadete', 'admin'), async (req, res) => {
  const { id }        = req.params;
  const { cadete_id } = req.body;

  if (!cadete_id) {
    return res.status(400).json({ error: 'cadete_id es requerido' });
  }

  if (!isAdmin(req) && cadete_id !== req.user.id) {
    return res.status(403).json({ error: 'No podes actualizar pedidos de otro cadete' });
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
router.patch('/:id/entregar', requireRole('cadete', 'admin'), async (req, res) => {
  const { id }        = req.params;
  const { cadete_id } = req.body;

  if (!cadete_id) {
    return res.status(400).json({ error: 'cadete_id es requerido' });
  }

  if (!isAdmin(req) && cadete_id !== req.user.id) {
    return res.status(403).json({ error: 'No podes entregar pedidos de otro cadete' });
  }

  const { data: orden, error: errorBuscar } = await supabase
    .from('ordenes')
    .select('id, estado, cadete_id, precio, cliente_id, ganancia_cadete, ganancia_yendo, propina_cadete, total_cadete')
    .eq('id', id)
    .single();

  if (errorBuscar || !orden) return res.status(404).json({ error: 'Orden no encontrada' });
  if (orden.cadete_id !== cadete_id) return res.status(403).json({ error: 'No es tu orden' });
  if (!['asignada', 'en_camino'].includes(orden.estado)) {
    return res.status(409).json({ error: `Estado inválido: ${orden.estado}` });
  }

  // Usar los montos calculados al crear el pedido; si es una orden vieja sin
  // desglose, calcular el split clásico sobre el precio.
  const precio         = Number(orden.precio ?? 0);
  const gananciaCadete = Number(orden.ganancia_cadete ?? Math.round(precio * 0.82 * 100) / 100);
  const gananciaYendo  = Number(orden.ganancia_yendo  ?? Math.round(precio * 0.18 * 100) / 100);
  const propina        = Number(orden.propina_cadete ?? 0);
  // Lo que suma a las ganancias del cadete incluye la propina (es 100% suya)
  const totalCadete    = Number(orden.total_cadete ?? (gananciaCadete + propina));
  const ahora          = new Date().toISOString();

  const resOrden = await supabase
    .from('ordenes')
    .update({
      estado:          'entregada',
      entregada_en:    ahora,
      ganancia_cadete: gananciaCadete,
      ganancia_yendo:  gananciaYendo,
    })
    .eq('id', id)
    .select()
    .single();

  if (resOrden.error) {
    console.error('[PATCH /entregar] orden:', resOrden.error.message);
    return res.status(500).json({ error: 'No se pudo actualizar la orden' });
  }

  // Stats del cadete: incremento atómico vía función SQL (migración 003).
  // Si la función todavía no existe en la DB, fallback al camino anterior.
  const { error: rpcError } = await supabase.rpc('incrementar_stats_entrega', {
    p_cadete_id: cadete_id,
    p_ganancia:  totalCadete,
  });

  if (rpcError) {
    console.warn('[PATCH /entregar] rpc no disponible, fallback:', rpcError.message);
    const { data: cadete } = await supabase
      .from('cadetes')
      .select('ganancias_hoy, ganancias_semana, ganancias_mes, viajes_hoy, viajes_semana, viajes_mes')
      .eq('id', cadete_id)
      .single();

    const { error: fallbackError } = await supabase
      .from('cadetes')
      .update({
        estado:              'disponible',
        ultima_entrega_en:   ahora,
        ganancias_hoy:    (cadete?.ganancias_hoy    ?? 0) + totalCadete,
        ganancias_semana: (cadete?.ganancias_semana ?? 0) + totalCadete,
        ganancias_mes:    (cadete?.ganancias_mes    ?? 0) + totalCadete,
        viajes_hoy:       (cadete?.viajes_hoy       ?? 0) + 1,
        viajes_semana:    (cadete?.viajes_semana    ?? 0) + 1,
        viajes_mes:       (cadete?.viajes_mes       ?? 0) + 1,
      })
      .eq('id', cadete_id);

    if (fallbackError) {
      console.error('[PATCH /entregar] cadete:', fallbackError.message);
    }
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
