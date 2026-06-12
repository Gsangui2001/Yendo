// Re-geocodifica TODAS las coordenadas guardadas (comercios, clientes,
// direcciones privadas) y las de las órdenes ACTIVAS, usando la lógica
// actual de geo.js (validación de provincia + radio operativo).
//
// Por qué: las coordenadas guardadas antes del fix de geocoding se
// calcularon con el geocoder viejo (sesgado a Colón) y pueden estar MAL
// (ej: Concepción del Uruguay cayendo en Villa Elisa). Como el sistema
// prioriza coordenadas guardadas, el error se repite hasta corregirlas.
//
// - Si la dirección re-geocodifica bien: actualiza lat/lng.
// - Si queda fuera de zona o no resuelve: deja lat/lng en NULL (mejor sin
//   coordenadas que con unas que mandan mal — se recalcula al cotizar).
// - NO toca montos ni estados, solo coordenadas.
//
// USO (desde Backend): node scripts/regeocodificar-guardados.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { geocodificar, haversineKm } from '../lib/geo.js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const pausa = () => new Promise((r) => setTimeout(r, 1100)); // ritmo Nominatim

let corregidas = 0, anuladas = 0, ok = 0, sinDireccion = 0;

async function procesar(tabla, fila, campoDir) {
  const direccion = fila[campoDir];
  if (!direccion?.trim()) { sinDireccion++; return; }

  let geo = null;
  try { geo = await geocodificar(direccion); } catch { /* geocoder caído: no tocar */ return; }
  await pausa();

  if (!geo || geo.fuera_de_zona) {
    if (fila.lat != null || fila.lng != null) {
      await s.from(tabla).update({ lat: null, lng: null }).eq('id', fila.id);
      anuladas++;
      console.log(`  ⚠ ${tabla} "${direccion.slice(0, 40)}": ${geo ? 'fuera de zona' : 'sin resultado'} -> lat/lng anuladas`);
    }
    return;
  }

  const drift = fila.lat != null ? haversineKm(fila.lat, fila.lng, geo.lat, geo.lng) : Infinity;
  if (drift > 0.3) {
    await s.from(tabla).update({ lat: geo.lat, lng: geo.lng }).eq('id', fila.id);
    corregidas++;
    console.log(`  ✔ ${tabla} "${direccion.slice(0, 40)}": corregida (${drift === Infinity ? 'no tenía' : drift.toFixed(1) + ' km de desvío'}) -> ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`);
  } else {
    ok++;
  }
}

console.log('COMERCIOS:');
const { data: comercios } = await s.from('comercios').select('id, direccion, lat, lng');
for (const c of comercios ?? []) await procesar('comercios', c, 'direccion');

console.log('CLIENTES:');
const { data: clientes } = await s.from('clientes').select('id, direccion, lat, lng');
for (const c of clientes ?? []) await procesar('clientes', c, 'direccion');

console.log('DIRECCIONES PRIVADAS:');
const { data: direcciones } = await s.from('direcciones').select('id, direccion, lat, lng');
for (const d of direcciones ?? []) await procesar('direcciones', d, 'direccion');

// Órdenes activas: refrescar coordenadas de destino (solo coordenadas, no montos)
console.log('ÓRDENES ACTIVAS (solo coordenadas de destino):');
const { data: activas } = await s.from('ordenes')
  .select('id, direccion, destino, destino_lat, destino_lng')
  .in('estado', ['pendiente', 'asignada', 'en_camino']);
for (const o of activas ?? []) {
  const texto = o.direccion ?? o.destino;
  if (!texto?.trim()) continue;
  let geo = null;
  try { geo = await geocodificar(texto); } catch { continue; }
  await pausa();
  if (!geo || geo.fuera_de_zona) {
    if (o.destino_lat != null) {
      await s.from('ordenes').update({ destino_lat: null, destino_lng: null }).eq('id', o.id);
      anuladas++;
      console.log(`  ⚠ orden ${o.id.slice(0, 8)} "${texto.slice(0, 40)}": destino anulado (${geo ? 'fuera de zona' : 'sin resultado'})`);
    }
    continue;
  }
  const drift = o.destino_lat != null ? haversineKm(o.destino_lat, o.destino_lng, geo.lat, geo.lng) : Infinity;
  if (drift > 0.3) {
    await s.from('ordenes').update({ destino_lat: geo.lat, destino_lng: geo.lng }).eq('id', o.id);
    corregidas++;
    console.log(`  ✔ orden ${o.id.slice(0, 8)} "${texto.slice(0, 40)}": destino corregido -> ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`);
  } else {
    ok++;
  }
}

console.log(`\nRESUMEN: ${corregidas} corregidas · ${anuladas} anuladas (se recalculan al cotizar) · ${ok} ya estaban bien · ${sinDireccion} sin dirección`);
