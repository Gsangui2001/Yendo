import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';
import { authenticate, isAdmin } from '../middleware/auth.js';
import { calcularPrecio } from '../lib/pricing.js';
import { distanciaRutaKm } from '../lib/geo.js';
import { resolverCoordenadas, cargarConCoords } from '../lib/ubicaciones.js';

const router = Router();
router.use(authenticate);

// Lee la config de recargos. Si la tabla todavía no existe (migración 004
// sin aplicar), devuelve recargos apagados para no romper la cotización.
export async function leerConfigServicio() {
  try {
    const { data, error } = await supabase
      .from('configuracion_servicio')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return { recargo_feriado_activo: false, recargo_lluvia_activo: false, recargo_monto: 500 };
    return data;
  } catch {
    return { recargo_feriado_activo: false, recargo_lluvia_activo: false, recargo_monto: 500 };
  }
}

// ── POST /api/precios/cotizar ───────────────────────────────────────────────
// Devuelve el desglose completo de un envío. El frontend la usa para mostrar
// la cotización en vivo; los montos definitivos se recalculan al crear la orden.
router.post('/cotizar', async (req, res) => {
  const { tipo, distancia_km, propina_cadete, metodo_pago } = req.body;

  if (!['comercio', 'particular'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser comercio o particular' });
  }
  const distancia = Number(distancia_km);
  if (!Number.isFinite(distancia) || distancia <= 0 || distancia > 100) {
    return res.status(400).json({ error: 'distancia_km debe ser un número entre 0 y 100' });
  }
  if (propina_cadete != null && (Number(propina_cadete) < 0 || Number(propina_cadete) > 50000)) {
    return res.status(400).json({ error: 'propina_cadete inválida' });
  }

  const config = await leerConfigServicio();
  const desglose = calcularPrecio({
    tipo,
    distancia_km: distancia,
    propina_cadete: Number(propina_cadete) || 0,
    metodo_pago: metodo_pago || 'efectivo',
    config,
  });

  return res.json(desglose);
});

// ── POST /api/precios/cotizar-direcciones ──────────────────────────────────
// Cotiza a partir de DIRECCIONES: el backend resuelve las coordenadas
// (primero las GUARDADAS en comercio/cliente/dirección; geocodifica solo si
// faltan y las persiste), calcula la distancia de ruta y aplica pricing.js.
// El frontend nunca manda km ni coordenadas.
//   comercio:   { tipo:'comercio', comercio_id, destino, cliente_id?, propina_cadete?, metodo_pago? }
//               (el origen es la dirección registrada del comercio)
//   particular: { tipo:'particular', origen, destino, origen_direccion_id?,
//                 destino_direccion_id?, propina_cadete?, metodo_pago? }
router.post('/cotizar-direcciones', async (req, res) => {
  const {
    tipo, comercio_id, cliente_id, origen, destino,
    origen_direccion_id, destino_direccion_id, propina_cadete, metodo_pago,
  } = req.body;

  if (!['comercio', 'particular'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser comercio o particular' });
  }
  if (!destino || !String(destino).trim()) {
    return res.status(400).json({ error: 'destino es requerido' });
  }
  if (propina_cadete != null && (Number(propina_cadete) < 0 || Number(propina_cadete) > 50000)) {
    return res.status(400).json({ error: 'propina_cadete inválida' });
  }

  // Origen + entidades con coordenadas guardadas
  let direccionOrigen;
  let entidadOrigen  = null; // dueña del origen  (comercio o dirección privada)
  let entidadDestino = null; // dueña del destino (cliente o dirección privada)

  if (tipo === 'comercio') {
    if (!comercio_id) return res.status(400).json({ error: 'comercio_id es requerido' });
    const { data: comercio, error: errComercio } = await cargarConCoords('comercios', comercio_id, 'id, owner_id, direccion');
    if (errComercio || !comercio) return res.status(404).json({ error: 'Comercio no encontrado' });
    if (!isAdmin(req) && comercio.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'No podés cotizar por otro comercio' });
    }
    if (!comercio.direccion?.trim()) {
      return res.status(422).json({
        error: 'Completá la dirección del comercio para cotizar automático.',
        campo: 'origen',
      });
    }
    direccionOrigen = comercio.direccion;
    entidadOrigen   = { tabla: 'comercios', ...comercio };

    if (cliente_id) {
      const { data: cliente } = await cargarConCoords('clientes', cliente_id, 'id, comercio_id, direccion');
      if (cliente && cliente.comercio_id === comercio_id) {
        entidadDestino = { tabla: 'clientes', ...cliente };
      }
    }
  } else {
    if (!origen || !String(origen).trim()) {
      return res.status(400).json({ error: 'origen es requerido' });
    }
    direccionOrigen = origen;

    // Direcciones guardadas del usuario: usan/persisten sus lat/lng
    for (const [id, asignar] of [
      [origen_direccion_id,  (e) => { entidadOrigen  = e; }],
      [destino_direccion_id, (e) => { entidadDestino = e; }],
    ]) {
      if (!id) continue;
      const { data: dir } = await cargarConCoords('direcciones', id, 'id, usuario_id, direccion');
      if (dir && (isAdmin(req) || dir.usuario_id === req.user.id)) {
        asignar({ tabla: 'direcciones', ...dir });
      }
    }
  }

  // Resolver coordenadas: guardadas primero, geocoder solo si faltan
  let geoOrigen, geoDestino;
  try {
    geoOrigen = await resolverCoordenadas(direccionOrigen, entidadOrigen);
    if (geoOrigen && !geoOrigen.fuera_de_zona) geoDestino = await resolverCoordenadas(destino, entidadDestino);
  } catch (err) {
    console.error('[POST /cotizar-direcciones] geocoder:', err.message);
    return res.status(503).json({ error: 'No pudimos verificar las direcciones ahora. Probá de nuevo en unos segundos.' });
  }
  // Resultado ambiguo o lejos de la zona: pedir más detalle, no cotizar mal
  if (geoOrigen?.fuera_de_zona) {
    return res.status(422).json({ error: `No pudimos confirmar la dirección de origen: "${direccionOrigen}". Agregá ciudad/localidad.`, campo: 'origen' });
  }
  if (geoDestino?.fuera_de_zona) {
    return res.status(422).json({ error: `No pudimos confirmar la dirección de destino: "${destino}". Agregá ciudad/localidad.`, campo: 'destino' });
  }
  if (!geoOrigen) {
    return res.status(422).json({ error: `No encontramos la dirección de origen: "${direccionOrigen}". Revisá calle y número.`, campo: 'origen' });
  }
  if (!geoDestino) {
    return res.status(422).json({ error: `No encontramos la dirección de destino: "${destino}". Revisá calle y número.`, campo: 'destino' });
  }

  const ruta = await distanciaRutaKm(geoOrigen, geoDestino);
  // Mismo punto u origen=destino: se cobra la base igual (viaje mínimo)
  const distancia = Math.max(0.1, ruta.km);
  if (distancia > 100) {
    return res.status(422).json({ error: 'Las direcciones están demasiado lejos para un envío local.' });
  }

  const config = await leerConfigServicio();
  const desglose = calcularPrecio({
    tipo,
    distancia_km: distancia,
    propina_cadete: Number(propina_cadete) || 0,
    metodo_pago: metodo_pago || 'efectivo',
    config,
  });

  return res.json({
    ...desglose,
    metodo_distancia: ruta.metodo, // 'osrm' (ruta real) | 'haversine' (estimada)
    origen:  { direccion: direccionOrigen, lat: geoOrigen.lat,  lng: geoOrigen.lng,  display: geoOrigen.display },
    destino: { direccion: destino,         lat: geoDestino.lat, lng: geoDestino.lng, display: geoDestino.display },
  });
});

// ── GET /api/precios/config ─────────────────────────────────────────────────
// Estado de los recargos (para mostrar el aviso "tarifa con recargo" en el front).
router.get('/config', async (_req, res) => {
  const config = await leerConfigServicio();
  return res.json({
    recargo_feriado_activo: Boolean(config.recargo_feriado_activo),
    recargo_lluvia_activo:  Boolean(config.recargo_lluvia_activo),
    recargo_monto:          Number(config.recargo_monto ?? 500),
  });
});

export default router;
