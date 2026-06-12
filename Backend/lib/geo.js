// Geocodificación y cálculo de distancia para Yendo (Colón, Entre Ríos).
// - Nominatim (OpenStreetMap) convierte direcciones en lat/lng. Gratis, sin
//   API key; pide User-Agent identificable y ritmo razonable (cacheamos 24h).
// - OSRM (router público) da la distancia de RUTA real en auto. Si falla o
//   tarda, caemos a Haversine * 1.3 (factor calle).
// El frontend NUNCA calcula distancia: siempre pasa por acá.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM      = 'https://router.project-osrm.org/route/v1/driving';
const UA        = 'YendoBeta/1.0 (plataforma de envios, Colon Entre Rios AR)';

// Sesgo geográfico: caja alrededor de Colón ER y alrededores (San José,
// Liebig, El Brillante). No es excluyente (bounded=0), solo prioriza.
const VIEWBOX = '-58.35,-32.05,-58.00,-32.35';

const TTL_MS = 24 * 60 * 60 * 1000;
const cacheGeo = new Map(); // direccion normalizada -> { lat, lng, display, ts }

const r2 = (n) => Math.round(n * 100) / 100;
const normalizar = (d) => String(d).trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Convierte una dirección en coordenadas. Devuelve { lat, lng, display } o
 * null si no se encontró. Cachea 24h por dirección normalizada.
 */
export async function geocodificar(direccion) {
  if (!direccion || !String(direccion).trim()) return null;

  const clave = normalizar(direccion);
  const hit = cacheGeo.get(clave);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit;

  // Si la dirección no menciona localidad, anclarla a Colón ER
  const mencionaLugar = /col[oó]n|san jos[eé]|liebig|brillante|entre r[ií]os|ubajay|villa elisa/i.test(direccion);
  const q = mencionaLugar ? `${direccion}, Argentina` : `${direccion}, Colón, Entre Ríos, Argentina`;

  const url = `${NOMINATIM}?format=json&limit=1&countrycodes=ar&viewbox=${VIEWBOX}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Geocoder respondió ${res.status}`);

  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;

  const resultado = {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    display: data[0].display_name,
    ts: Date.now(),
  };
  cacheGeo.set(clave, resultado);
  return resultado;
}

/** Distancia en línea recta (km). */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Distancia de viaje entre dos puntos { lat, lng }.
 * Intenta ruta real (OSRM); si no, Haversine * 1.3 (aprox. trazado urbano).
 * Devuelve { km, metodo: 'osrm' | 'haversine' }.
 */
export async function distanciaRutaKm(origen, destino) {
  try {
    const url = `${OSRM}/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=false`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const metros = data?.routes?.[0]?.distance;
      if (Number.isFinite(metros) && metros >= 0) {
        return { km: r2(metros / 1000), metodo: 'osrm' };
      }
    }
  } catch {
    // OSRM caído o lento: seguimos con Haversine
  }
  const km = haversineKm(origen.lat, origen.lng, destino.lat, destino.lng) * 1.3;
  return { km: r2(km), metodo: 'haversine' };
}
