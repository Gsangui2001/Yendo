// Prueba en vivo de lib/geo.js contra Nominatim y OSRM, con los casos que
// fallaron en la prueba real (Concepción del Uruguay NO puede caer en Villa
// Elisa) y la validación de zona operativa.
// USO (desde Backend): node scripts/test-geo.js
import { geocodificar, distanciaRutaKm, haversineKm } from '../lib/geo.js';

const CDEL_URUGUAY = { lat: -32.4846, lng: -58.2317 };
const VILLA_ELISA  = { lat: -32.1632, lng: -58.4008 };
const COLON        = { lat: -32.2236, lng: -58.1444 };

let ok = 0, mal = 0;
const bien  = (msg) => { ok++;  console.log(`  ✓ ${msg}`); };
const falla = (msg) => { mal++; console.log(`  ✗ ${msg}`); };
const pausa = () => new Promise((r) => setTimeout(r, 1100)); // ritmo Nominatim

// ── 1. Dirección de Colón sin localidad: ancla a Colón ─────────────────────
console.log('COLÓN (ancla por defecto):');
const colon1 = await geocodificar('San Martín 441');
if (colon1 && !colon1.fuera_de_zona && haversineKm(colon1.lat, colon1.lng, COLON.lat, COLON.lng) < 5) {
  bien(`"San Martín 441" -> ${colon1.lat.toFixed(4)}, ${colon1.lng.toFixed(4)} (Colón)`);
} else {
  falla(`"San Martín 441" no resolvió en Colón: ${JSON.stringify(colon1)}`);
}
await pausa();

// ── 2. CRÍTICO: Concepción del Uruguay NO puede caer en Villa Elisa ────────
console.log('CONCEPCIÓN DEL URUGUAY (el bug de la prueba real):');
const cdelu = await geocodificar('Concepción del Uruguay, Entre Ríos');
if (cdelu && !cdelu.fuera_de_zona) {
  const dCdelU = haversineKm(cdelu.lat, cdelu.lng, CDEL_URUGUAY.lat, CDEL_URUGUAY.lng);
  const dVilla = haversineKm(cdelu.lat, cdelu.lng, VILLA_ELISA.lat, VILLA_ELISA.lng);
  if (dCdelU < 15) bien(`resolvió EN Concepción del Uruguay (a ${dCdelU.toFixed(1)} km del centro)`);
  else falla(`resolvió a ${dCdelU.toFixed(1)} km de C. del Uruguay: ${cdelu.display?.slice(0, 70)}`);
  if (dVilla > 10) bien(`lejos de Villa Elisa (${dVilla.toFixed(1)} km) — el bug no se repite`);
  else falla(`¡cayó cerca de Villa Elisa (${dVilla.toFixed(1)} km)! ${cdelu.display?.slice(0, 70)}`);
} else {
  falla(`no geocodificó C. del Uruguay: ${JSON.stringify(cdelu)}`);
}
await pausa();

// Una calle concreta de C. del Uruguay también tiene que caer ahí
const cdelu2 = await geocodificar('Galarza 1000, Concepción del Uruguay');
if (cdelu2 && !cdelu2.fuera_de_zona && haversineKm(cdelu2.lat, cdelu2.lng, CDEL_URUGUAY.lat, CDEL_URUGUAY.lng) < 15) {
  bien(`"Galarza 1000, Concepción del Uruguay" -> en C. del Uruguay`);
} else {
  falla(`calle de C. del Uruguay no resolvió ahí: ${JSON.stringify(cdelu2)?.slice(0, 100)}`);
}
await pausa();

// ── 3. San José: distancia razonable desde Colón ───────────────────────────
console.log('SAN JOSÉ:');
const sanjose = await geocodificar('San José, Entre Ríos');
if (sanjose && !sanjose.fuera_de_zona) {
  const ruta = await distanciaRutaKm(COLON, sanjose);
  if (ruta.km >= 5 && ruta.km <= 25) bien(`Colón -> San José: ${ruta.km} km (${ruta.metodo}) — razonable (~10)`);
  else falla(`Colón -> San José dio ${ruta.km} km: fuera de lo razonable`);
} else {
  falla(`no geocodificó San José: ${JSON.stringify(sanjose)}`);
}
await pausa();

// ── 4. Dirección ambigua / fuera de zona: pedir más detalle ────────────────
console.log('FUERA DE ZONA / AMBIGUA:');
const lejos = await geocodificar('Rosario, Santa Fe');
if (!lejos || lejos.fuera_de_zona) {
  bien(`"Rosario, Santa Fe" rechazada (${lejos ? 'fuera_de_zona' : 'sin resultado'}) — se pide ciudad/localidad`);
} else {
  falla(`"Rosario, Santa Fe" se aceptó dentro de la zona: ${JSON.stringify(lejos).slice(0, 100)}`);
}
await pausa();

const nada = await geocodificar('Direccion Que No Existe 99999 xyzz');
if (!nada || nada.fuera_de_zona) bien('dirección inexistente -> sin resultado válido');
else falla(`dirección inexistente devolvió algo: ${JSON.stringify(nada).slice(0, 100)}`);

console.log(`\n${mal === 0 ? 'GEO OK' : `${mal} problema(s)`} (${ok} checks OK)`);
process.exit(mal === 0 ? 0 : 1);
