// Prueba en vivo de lib/geo.js contra Nominatim y OSRM.
// USO (desde Backend): node scripts/test-geo.js
import { geocodificar, distanciaRutaKm, haversineKm } from '../lib/geo.js';

const casos = [
  '12 de Abril 384',
  'San Martín 441',
  'Belgrano 200, San José',
  'Direccion Que No Existe 99999 xyzz',
];

const puntos = [];
for (const dir of casos) {
  try {
    const r = await geocodificar(dir);
    if (r) {
      console.log(`OK  "${dir}" -> ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}  (${r.display.slice(0, 70)})`);
      puntos.push(r);
    } else {
      console.log(`--  "${dir}" -> no encontrada (esperado en la última)`);
    }
  } catch (err) {
    console.log(`ERR "${dir}" -> ${err.message}`);
  }
  // Nominatim pide ritmo razonable: 1 req/seg
  await new Promise((r) => setTimeout(r, 1100));
}

if (puntos.length >= 2) {
  const [a, b] = puntos;
  const ruta = await distanciaRutaKm(a, b);
  const recta = haversineKm(a.lat, a.lng, b.lat, b.lng);
  console.log(`\nDistancia ${casos[0]} -> ${casos[1]}:`);
  console.log(`  ruta: ${ruta.km} km (metodo: ${ruta.metodo})  |  linea recta: ${recta.toFixed(2)} km`);
  if (ruta.km <= 0 || ruta.km > 50) {
    console.log('  ADVERTENCIA: distancia fuera de rango esperado para Colón');
    process.exit(1);
  }
  console.log('\nGEO OK');
} else {
  console.log('\nFALLO: no se pudieron geocodificar 2 direcciones de Colón');
  process.exit(1);
}
