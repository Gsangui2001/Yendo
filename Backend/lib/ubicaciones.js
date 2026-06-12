// Coordenadas GUARDADAS por entidad (comercio / cliente / dirección privada).
// Regla: si la entidad ya tiene lat/lng para esa dirección, se usan directo
// (sin geocodificar). Si faltan, se geocodifica UNA vez y se persisten para
// la próxima. Nunca se confía en coordenadas que mande el frontend.
import { supabase } from './supabaseAdmin.js';
import { geocodificar } from './geo.js';

// Caja generosa alrededor de Argentina: descarta basura (0,0), GPS de otro
// hemisferio, lat/lng invertidos, etc.
export function coordsValidas(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -56 && lat <= -21 &&
    lng >= -74 && lng <= -53
  );
}

const norm = (d) => String(d ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Resuelve coordenadas para una dirección de texto, priorizando las que la
 * entidad ya tiene guardadas. Si hay que geocodificar y la dirección pedida
 * coincide con la de la entidad, persiste lat/lng en su tabla (best effort:
 * si la migración 006 no está aplicada, sigue sin guardar).
 *
 * @param {string} direccion - texto a resolver
 * @param {object|null} entidad - { tabla: 'comercios'|'clientes'|'direcciones', id, direccion, lat, lng }
 * @returns {Promise<{lat, lng, display}|null>} null si no se pudo geocodificar
 */
export async function resolverCoordenadas(direccion, entidad = null) {
  const coincide = entidad && norm(entidad.direccion) === norm(direccion);

  if (coincide && coordsValidas(Number(entidad.lat), Number(entidad.lng))) {
    return { lat: Number(entidad.lat), lng: Number(entidad.lng), display: entidad.direccion };
  }

  const geo = await geocodificar(direccion);

  // Resultado fuera de la zona operativa: se devuelve la señal tal cual para
  // que el endpoint pida más detalle; NUNCA se persisten esas coordenadas.
  if (geo && !geo.fuera_de_zona && coincide) {
    const { error } = await supabase
      .from(entidad.tabla)
      .update({ lat: geo.lat, lng: geo.lng })
      .eq('id', entidad.id);
    if (error && !/Could not find|does not exist/i.test(error.message)) {
      console.warn(`[ubicaciones] no se pudo guardar lat/lng en ${entidad.tabla}:`, error.message);
    }
  }

  return geo;
}

/**
 * Trae una fila por id pidiendo también lat/lng; si esas columnas todavía no
 * existen (migración 006 sin aplicar), reintenta sin ellas.
 */
export async function cargarConCoords(tabla, id, camposBase) {
  let { data, error } = await supabase
    .from(tabla)
    .select(`${camposBase}, lat, lng`)
    .eq('id', id)
    .maybeSingle();
  if (error && /Could not find|does not exist/i.test(error.message)) {
    ({ data, error } = await supabase.from(tabla).select(camposBase).eq('id', id).maybeSingle());
  }
  return { data, error };
}

/**
 * Geocodifica una dirección para un INSERT y devuelve { lat, lng } o {} si
 * no se pudo (nunca lanza: guardar la entidad importa más que la coordenada).
 */
export async function coordsParaInsert(direccion) {
  if (!direccion || !String(direccion).trim()) return {};
  try {
    const geo = await geocodificar(direccion);
    return geo && !geo.fuera_de_zona ? { lat: geo.lat, lng: geo.lng } : {};
  } catch {
    return {};
  }
}
