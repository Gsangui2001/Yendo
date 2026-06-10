import { supabase } from './supabaseAdmin.js';

// Haversine: distancia en metros entre dos coordenadas
function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Encuentra el mejor cadete disponible para una orden.
 * Criterios (en orden):
 *   1. Proximidad geográfica al origen (si ambos tienen GPS, diferencia > 300m importa)
 *   2. Fairness: el que hace más tiempo no entregó
 *
 * @param {object} orden - row de la tabla ordenes (necesita zona, origen_lat, origen_lng, rechazos)
 * @returns {object|null} cadete row o null si no hay ninguno disponible
 */
export async function encontrarCadete(orden) {
  const { data: cadetes, error } = await supabase
    .from('cadetes')
    .select('id, ubicacion_lat, ubicacion_lng, ultima_entrega_en')
    .eq('estado', 'disponible')
    .eq('zona', orden.zona)
    .eq('activo', true);

  if (error || !cadetes?.length) return null;

  // Excluir cadetes que ya rechazaron este pedido
  const rechazos = orden.rechazos || [];
  const candidatos = cadetes.filter((c) => !rechazos.includes(c.id));

  if (!candidatos.length) return null;

  return candidatos.sort((a, b) => {
    // Criterio 1: distancia al origen (si hay coordenadas disponibles)
    const tieneGpsOrden = orden.origen_lat != null && orden.origen_lng != null;
    const tieneGpsA = a.ubicacion_lat != null && a.ubicacion_lng != null;
    const tieneGpsB = b.ubicacion_lat != null && b.ubicacion_lng != null;

    if (tieneGpsOrden && tieneGpsA && tieneGpsB) {
      const dA = distanciaMetros(a.ubicacion_lat, a.ubicacion_lng, orden.origen_lat, orden.origen_lng);
      const dB = distanciaMetros(b.ubicacion_lat, b.ubicacion_lng, orden.origen_lat, orden.origen_lng);
      if (Math.abs(dA - dB) > 300) return dA - dB;
    }

    // Criterio 2: fairness — el que hace más tiempo no entregó va primero
    const tA = a.ultima_entrega_en ? new Date(a.ultima_entrega_en).getTime() : 0;
    const tB = b.ultima_entrega_en ? new Date(b.ultima_entrega_en).getTime() : 0;
    return tA - tB;
  })[0];
}

/**
 * Estima el tiempo de espera cuando no hay cadetes disponibles.
 * Busca el cadete en_viaje que va a terminar más pronto (heurística: 10 min por defecto).
 *
 * @param {string} zona
 * @returns {number} minutos estimados de espera
 */
export async function estimarEspera(zona) {
  const { data: enViaje } = await supabase
    .from('cadetes')
    .select('id')
    .eq('estado', 'en_viaje')
    .eq('zona', zona)
    .eq('activo', true);

  if (!enViaje?.length) return 20; // no hay nadie trabajando
  return 10; // hay cadetes en viaje, estimamos 10 min hasta que liberen
}
