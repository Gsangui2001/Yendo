// Regresión de geocodificación: las localidades reales de la zona operativa
// tienen que resolver donde corresponde, y lo de afuera tiene que rechazarse.
// USO (desde Backend): node scripts/test-geo-regression.js
import { geocodificar, haversineKm } from '../lib/geo.js';

// Centros de referencia (OpenStreetMap)
const REF = {
  colon:         { lat: -32.2236, lng: -58.1444 },
  san_jose:      { lat: -32.2024, lng: -58.2125 },
  cdel_uruguay:  { lat: -32.4846, lng: -58.2317 },
  villa_elisa:   { lat: -32.1632, lng: -58.4008 },
};

let ok = 0, mal = 0;
const bien  = (msg) => { ok++;  console.log(`  ✓ ${msg}`); };
const falla = (msg) => { mal++; console.log(`  ✗ ${msg}`); };
const pausa = () => new Promise((r) => setTimeout(r, 1100));

// [direccion, centro esperado, tolerancia km, descripcion]
const casos = [
  ['Colón, Entre Ríos',                  'colon',        8,  'Colón centro'],
  ['12 de Abril 384',                    'colon',        5,  'calle de Colón sin localidad (ancla a Colón)'],
  ['San José, Entre Ríos',               'san_jose',     8,  'San José'],
  ['Centenario 1500, San José',          'san_jose',     8,  'calle de San José'],
  ['Concepción del Uruguay, Entre Ríos', 'cdel_uruguay', 10, 'Concepción del Uruguay'],
  ['Villa Elisa, Entre Ríos',            'villa_elisa',  8,  'Villa Elisa'],
];

for (const [direccion, centroKey, tolKm, desc] of casos) {
  let geo = null;
  try { geo = await geocodificar(direccion); } catch (e) { falla(`${desc}: geocoder error ${e.message}`); await pausa(); continue; }
  await pausa();

  if (!geo || geo.fuera_de_zona) {
    falla(`${desc}: no resolvió (${geo ? 'fuera_de_zona' : 'null'})`);
    continue;
  }
  const centro = REF[centroKey];
  const d = haversineKm(geo.lat, geo.lng, centro.lat, centro.lng);
  if (d <= tolKm) {
    bien(`${desc}: a ${d.toFixed(1)} km del centro esperado`);
  } else {
    falla(`${desc}: cayó a ${d.toFixed(1)} km del centro esperado — ${geo.display?.slice(0, 70)}`);
  }

  // Regla extra: NADA puede caer en Villa Elisa salvo Villa Elisa misma
  if (centroKey !== 'villa_elisa') {
    const dVE = haversineKm(geo.lat, geo.lng, REF.villa_elisa.lat, REF.villa_elisa.lng);
    if (dVE < 6) falla(`${desc}: ¡cayó EN Villa Elisa! (el bug de la prueba real)`);
  }
}

// Inválidas / fuera de zona: tienen que rechazarse, no inventarse
for (const direccion of ['Direccion Inexistente 99999 xyzz', 'Av. Corrientes 348, Buenos Aires, CABA']) {
  let geo = null;
  try { geo = await geocodificar(direccion); } catch { /* ok */ }
  await pausa();
  if (!geo || geo.fuera_de_zona) bien(`"${direccion.slice(0, 35)}" rechazada (${geo ? 'fuera_de_zona' : 'sin resultado'})`);
  else falla(`"${direccion.slice(0, 35)}" se aceptó: ${geo.display?.slice(0, 60)}`);
}

console.log(`\n${mal === 0 ? 'REGRESIÓN GEO OK' : `${mal} problema(s)`} (${ok} checks OK)`);
process.exit(mal === 0 ? 0 : 1);
