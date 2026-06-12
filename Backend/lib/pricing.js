// Lógica centralizada de precios y reparto de Yendo.
// ÚNICA fuente de verdad de los montos: el frontend solo manda
// distancia_km, propina_cadete y metodo_pago; acá se decide todo.
//
// Reglas:
//   - Comercio:   $3.000 hasta 5 km incluidos, luego $1.100 por km extra.
//                 (10 km = 3000 + 5*1100 = $8.500 — caso real a San José)
//   - Particular: $3.500 hasta 5 km incluidos, luego $1.000 por km extra.
//                 (10 km = 3500 + 5*1000 = $8.500)
//   - Recargo clima/feriado: $500 fijos si lluvia O feriado está activo
//     (si están los dos activos se cobra UNA sola vez). Forma parte del
//     precio del envío, así que se reparte 82/18 como todo lo demás.
//   - Yendo se queda 18% del precio del envío. El cadete, 82%.
//   - La propina es 100% del cadete: NO entra en el 18% de Yendo.
//   - Efectivo: el cadete cobra todo y rinde a Yendo la ganancia_yendo.
//   - Online/transferencia: Yendo cobra todo y deposita al cadete su total.

export const TARIFAS = {
  comercio:   { precio_base: 3000, km_incluidos: 5, precio_km_extra: 1100 },
  particular: { precio_base: 3500, km_incluidos: 5, precio_km_extra: 1000 },
};

export const RECARGO_DEFAULT = 500;
export const FEE_YENDO = 0.18;

const METODOS_EFECTIVO = ['efectivo', 'paga_cliente'];

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Calcula el desglose financiero completo de un envío.
 *
 * @param {object} params
 * @param {'comercio'|'particular'} params.tipo
 * @param {number}  params.distancia_km     - distancia del viaje en km
 * @param {number} [params.propina_cadete]  - propina opcional (default 0)
 * @param {string} [params.metodo_pago]     - efectivo | transferencia | online
 * @param {object} [params.config]          - { recargo_feriado_activo, recargo_lluvia_activo, recargo_monto }
 * @returns {object} desglose completo (ver campos abajo)
 */
export function calcularPrecio({ tipo, distancia_km, propina_cadete = 0, metodo_pago = 'efectivo', config = {} }) {
  const tarifa = TARIFAS[tipo === 'comercio' ? 'comercio' : 'particular'];

  const distancia = Math.max(0, Number(distancia_km) || 0);
  const propina   = Math.max(0, Number(propina_cadete) || 0);

  // Km extra: por km iniciado (8,2 km => 4 km extra)
  const kmExtra      = Math.max(0, Math.ceil(distancia - tarifa.km_incluidos));
  const costoExtra   = kmExtra * tarifa.precio_km_extra;

  // Recargo clima/feriado: $500 una sola vez aunque estén los dos activos
  const recargoActivo = Boolean(config.recargo_feriado_activo) || Boolean(config.recargo_lluvia_activo);
  const recargo       = recargoActivo ? Number(config.recargo_monto ?? RECARGO_DEFAULT) : 0;

  const precio_envio  = r2(tarifa.precio_base + costoExtra + recargo);
  const total_cliente = r2(precio_envio + propina);

  // El 18% de Yendo se calcula SOLO sobre el envío, nunca sobre la propina
  const ganancia_yendo  = r2(precio_envio * FEE_YENDO);
  const ganancia_cadete = r2(precio_envio - ganancia_yendo); // 82% exacto, sin pérdida por redondeo
  const total_cadete    = r2(ganancia_cadete + propina);

  const esEfectivo = METODOS_EFECTIVO.includes(String(metodo_pago).toLowerCase());

  return {
    tipo: tarifa === TARIFAS.comercio ? 'comercio' : 'particular',
    distancia_km: distancia,
    precio_base: tarifa.precio_base,
    km_incluidos: tarifa.km_incluidos,
    precio_km_extra: tarifa.precio_km_extra,
    km_extra: kmExtra,
    recargo_clima_feriado: recargo,
    recargos_activos: {
      feriado: Boolean(config.recargo_feriado_activo),
      lluvia:  Boolean(config.recargo_lluvia_activo),
    },
    propina_cadete: r2(propina),
    precio_envio,
    total_cliente,
    ganancia_yendo,
    ganancia_cadete,
    total_cadete,
    metodo_pago,
    // Liquidación según cómo entró la plata:
    //  - efectivo: el cadete cobró todo => rinde a Yendo su 18%
    //  - online/transferencia: Yendo cobró todo => deposita al cadete su total
    efectivo_a_rendir:         esEfectivo ? ganancia_yendo : 0,
    monto_a_depositar_cadete:  esEfectivo ? 0 : total_cadete,
  };
}
