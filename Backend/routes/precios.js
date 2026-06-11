import { Router } from 'express';
import { supabase } from '../lib/supabaseAdmin.js';
import { authenticate } from '../middleware/auth.js';
import { calcularPrecio } from '../lib/pricing.js';

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
