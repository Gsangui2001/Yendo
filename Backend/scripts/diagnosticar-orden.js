// Diagnóstico completo de una orden: direcciones, coordenadas, distancia,
// método de cálculo, cadete, finanzas y la URL de Google Maps que ve el
// cadete. Además re-geocodifica los textos con la lógica ACTUAL para
// detectar coordenadas guardadas viejas/incorrectas.
//
// USO (desde Backend): node scripts/diagnosticar-orden.js <orden_id|prefijo>
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { geocodificar, haversineKm } from '../lib/geo.js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const arg = process.argv[2];
if (!arg) {
  console.error('USO: node scripts/diagnosticar-orden.js <orden_id|prefijo|"ultima">');
  process.exit(2);
}

// Buscar la orden (por id exacto, prefijo, o la última creada)
let orden = null;
if (arg === 'ultima') {
  ({ data: orden } = await s.from('ordenes').select('*').order('creado_en', { ascending: false }).limit(1).maybeSingle());
} else if (arg.length === 36) {
  ({ data: orden } = await s.from('ordenes').select('*').eq('id', arg).maybeSingle());
} else {
  const { data: todas } = await s.from('ordenes').select('*').order('creado_en', { ascending: false }).limit(200);
  orden = (todas ?? []).find((o) => o.id.startsWith(arg)) ?? null;
}
if (!orden) { console.error(`No se encontró la orden "${arg}"`); process.exit(1); }

const f = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'));
const coord = (lat, lng) => (lat == null || lng == null ? '— (sin coordenadas)' : `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`);

console.log('═'.repeat(70));
console.log(`ORDEN ${orden.id}`);
console.log('═'.repeat(70));
console.log(`tipo/estado:     ${orden.tipo} · ${orden.estado}  (creada ${orden.creado_en})`);
console.log(`zona (interna):  ${orden.zona ?? '—'} ${orden.zona_label ? `(${orden.zona_label})` : ''}`);
console.log('');
console.log('— DIRECCIONES Y COORDENADAS —');
console.log(`origen texto:    ${orden.origen ?? '(comercio)'}`);
console.log(`origen lat/lng:  ${coord(orden.origen_lat, orden.origen_lng)}`);
console.log(`destino texto:   ${orden.direccion ?? orden.destino ?? '—'}`);
console.log(`destino lat/lng: ${coord(orden.destino_lat, orden.destino_lng)}`);
console.log(`distancia_km:    ${orden.distancia_km ?? '—'} (calculada por: ${orden.distancia_calculada_por ?? '—'}, en: ${orden.distancia_calculada_en ?? '—'})`);

// URL que arma el botón "Abrir ruta" del cadete (misma lógica del frontend)
const destinoTexto = orden.direccion ?? orden.destino ?? orden.zona_label ?? 'Destino del pedido';
const urlRuta = orden.destino_lat != null && orden.destino_lng != null
  ? `https://www.google.com/maps/dir/?api=1&destination=${orden.destino_lat},${orden.destino_lng}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${destinoTexto}, Entre Ríos, Argentina`)}`;
console.log(`google_maps_url: ${urlRuta}`);

// Re-geocodificar el texto con la lógica ACTUAL y comparar
console.log('');
console.log('— VERIFICACIÓN CONTRA EL GEOCODER ACTUAL —');
const textoDestino = orden.direccion ?? orden.destino;
if (textoDestino) {
  try {
    const geo = await geocodificar(textoDestino);
    if (geo?.fuera_de_zona) {
      console.log(`geocoder dice:   FUERA DE ZONA (${geo.display?.slice(0, 70)})`);
    } else if (geo) {
      console.log(`geocoder dice:   ${coord(geo.lat, geo.lng)}`);
      console.log(`geocoder label:  ${geo.display?.slice(0, 90)}`);
      if (orden.destino_lat != null) {
        const drift = haversineKm(orden.destino_lat, orden.destino_lng, geo.lat, geo.lng);
        console.log(`diferencia:      ${drift.toFixed(2)} km ${drift > 1 ? '  ⚠️ COORDENADAS GUARDADAS DESVIADAS' : '(consistente)'}`);
      } else {
        console.log('diferencia:      la orden NO tiene coordenadas guardadas (usaría texto en Maps)');
      }
    } else {
      console.log('geocoder dice:   sin resultado para ese texto');
    }
  } catch (e) {
    console.log(`geocoder error:  ${e.message}`);
  }
}

console.log('');
console.log('— CADETE Y CÓDIGO —');
if (orden.cadete_id ?? orden.asignado_a_id) {
  const { data: cad } = await s.from('cadetes').select('nombre, estado, zona').eq('id', orden.cadete_id ?? orden.asignado_a_id).maybeSingle();
  console.log(`cadete:          ${cad?.nombre ?? orden.cadete_id} (${cad?.estado ?? '—'}) ${orden.cadete_id ? '[aceptado]' : '[asignado, sin aceptar]'}`);
} else {
  console.log(`cadete:          sin asignar ${orden.broadcast_en ? '(en broadcast)' : ''}`);
}
console.log(`codigo_entrega:  ${orden.codigo_entrega ?? '— (orden previa a la migración 007)'}`);
console.log(`verificado_en:   ${orden.codigo_entrega_verificado_en ?? '—'} · intentos fallidos: ${orden.codigo_entrega_intentos ?? 0}`);

console.log('');
console.log('— FINANZAS —');
console.log(`precio_envio:    $${f(orden.precio_envio ?? orden.precio)}  (base $${f(orden.precio_base)} + ${orden.km_extra ?? '—'} km extra + recargo $${f(orden.recargo_clima_feriado)})`);
console.log(`propina:         $${f(orden.propina_cadete)}`);
console.log(`total_cliente:   $${f(orden.total_cliente)}`);
console.log(`yendo 18%:       $${f(orden.ganancia_yendo)}  ·  cadete 82%: $${f(orden.ganancia_cadete)}  ·  total cadete: $${f(orden.total_cadete)}`);
console.log(`metodo_pago:     ${orden.metodo_pago ?? '—'}  ·  efectivo a rendir: $${f(orden.efectivo_a_rendir)}  ·  a depositar: $${f(orden.monto_a_depositar_cadete)}`);
console.log('═'.repeat(70));
