// Geocodificación y cálculo de distancia para Yendo (Colón, Entre Ríos).
// - Nominatim (OpenStreetMap) convierte direcciones en lat/lng. Gratis, sin
//   API key; pide User-Agent identificable y ritmo razonable (cacheamos 24h).
// - OSRM (router público) da la distancia de RUTA real en auto. Si falla o
//   tarda, caemos a Haversine * 1.3 (factor calle).
// El frontend NUNCA calcula distancia: siempre pasa por acá.
//
// Validación de zona: TODO resultado tiene que estar en Entre Ríos y a menos
// de RADIO_OPERATIVO_KM de Colón. Si el geocoder solo encuentra algo fuera
// de eso (p. ej. una calle homónima en otra provincia), NO se acepta en
// silencio: se devuelve { fuera_de_zona: true, display } para que el
// endpoint pida "agregá ciudad/localidad" en vez de cotizar mal.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM      = 'https://router.project-osrm.org/route/v1/driving';
const UA        = 'YendoBeta/1.0 (plataforma de envios, Colon Entre Rios AR)';

// Zona operativa: Colón ER y alrededores (San José, Villa Elisa, Liebig,
// Ubajay, El Brillante y también Concepción del Uruguay).
const COLON_CENTRO       = { lat: -32.2236, lng: -58.1444 };
const RADIO_OPERATIVO_KM = 80;

// Sesgo geográfico (no excluyente): caja que cubre toda la zona operativa,
// incluida Concepción del Uruguay al sur.
const VIEWBOX = '-58.45,-31.95,-57.95,-32.55';

// Localidades de la zona que el usuario puede mencionar en la dirección.
const RE_LOCALIDAD = /col[oó]n|san jos[eé]|liebig|brillante|ubajay|villa elisa|concepci[oó]n|uruguay|caseros|pronunciamiento|primero de mayo|1\s*de\s*mayo|arroyo bar[uú]/i;
const RE_PROVINCIA = /entre r[ií]os/i;

const TTL_MS = 24 * 60 * 60 * 1000;
const cacheGeo = new Map(); // direccion normalizada -> { lat, lng, display, ts }

const r2 = (n) => Math.round(n * 100) / 100;
const normalizar = (d) => String(d).trim().toLowerCase().replace(/\s+/g, ' ');

async function consultarNominatim(q) {
  const url = `${NOMINATIM}?format=json&limit=3&addressdetails=1&countrycodes=ar&viewbox=${VIEWBOX}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Geocoder respondió ${res.status}`);
  return res.json();
}

// ¿El resultado está dentro de la zona operativa? Provincia correcta + radio.
function dentroDeZona(item) {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const provincia = item.address?.state ?? item.address?.province ?? '';
  if (provincia && !RE_PROVINCIA.test(provincia)) return false;
  return haversineKm(lat, lng, COLON_CENTRO.lat, COLON_CENTRO.lng) <= RADIO_OPERATIVO_KM;
}

/**
 * Convierte una dirección en coordenadas. Devuelve:
 *   { lat, lng, display }            punto confirmado en la zona operativa
 *   { fuera_de_zona: true, display } solo hubo resultados lejos/ambiguos
 *   null                             no se encontró nada
 * Cachea 24h por dirección normalizada (solo resultados válidos).
 */
export async function geocodificar(direccion) {
  if (!direccion || !String(direccion).trim()) return null;

  const clave = normalizar(direccion);
  const hit = cacheGeo.get(clave);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit;

  // Siempre con contexto de provincia/país. Si no menciona localidad,
  // primero anclada a Colón; si eso no resuelve, suelta en Entre Ríos.
  const tieneProvincia = RE_PROVINCIA.test(direccion);
  const tieneLocalidad = RE_LOCALIDAD.test(direccion);
  const consultas = tieneLocalidad
    ? [tieneProvincia ? `${direccion}, Argentina` : `${direccion}, Entre Ríos, Argentina`]
    : [`${direccion}, Colón, Entre Ríos, Argentina`, `${direccion}, Entre Ríos, Argentina`];

  let lejano = null;
  for (const q of consultas) {
    const data = await consultarNominatim(q);
    if (!Array.isArray(data) || !data.length) continue;

    const valido = data.find(dentroDeZona);
    if (valido) {
      const resultado = {
        lat: Number(valido.lat),
        lng: Number(valido.lon),
        display: valido.display_name, // nombre normalizado del geocoder
        ts: Date.now(),
      };
      cacheGeo.set(clave, resultado);
      return resultado;
    }
    if (!lejano) lejano = data[0];
  }

  // Hubo resultados pero todos fuera de la zona operativa: ambiguo.
  if (lejano) return { fuera_de_zona: true, display: lejano.display_name };
  return null;
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
