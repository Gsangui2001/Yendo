// E2E de distancia automática contra el backend local (:3001) y Supabase real.
//  1. comercio@yendo.com cotiza por dirección (origen = dirección del comercio)
//  2. privado@yendo.com cotiza por origen/destino
//  3. comercio crea un pedido real y se verifica qué quedó guardado
//     (distancia_km, destino_lat/lng, precio) — después se cancela.
// USO (desde Backend): node scripts/test-cotizar-e2e.js
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// La anon key vive en Frontend/.env (VITE_SUPABASE_ANON_KEY); leerla de ahí
// si el Backend no la tiene.
if (!process.env.SUPABASE_ANON_KEY) {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const envFront = readFileSync(resolve(__dirname, '../../Frontend/.env'), 'utf8');
    const m = envFront.match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m);
    if (m) process.env.SUPABASE_ANON_KEY = m[1].trim();
  } catch {}
}

const API = 'http://localhost:3001';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

let ok = 0, mal = 0;
const bien  = (msg) => { ok++;  console.log(`  ✓ ${msg}`); };
const falla = (msg) => { mal++; console.log(`  ✗ ${msg}`); };

async function login(email) {
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: 'Yendo2026!' });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { token: data.session.access_token, userId: data.user.id };
}

async function api(token, path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ── 1. Comercio cotiza por dirección ─────────────────────────────────────────
console.log('COMERCIO — cotización por dirección:');
const { token: tokenComercio, userId: comercioUserId } = await login('comercio@yendo.com');
const { data: comercios } = await admin.from('comercios').select('id, nombre, direccion, owner_id')
  .eq('owner_id', comercioUserId);
const comercio = comercios?.[0];
if (!comercio) { falla('no existe comercio demo'); process.exit(1); }

if (!comercio.direccion?.trim()) {
  await admin.from('comercios').update({ direccion: '12 de Abril 384, Colón' }).eq('id', comercio.id);
  console.log(`  - "${comercio.nombre}" no tenía dirección: se cargó "12 de Abril 384, Colón"`);
  comercio.direccion = '12 de Abril 384, Colón';
} else {
  console.log(`  - origen: "${comercio.direccion}" (${comercio.nombre})`);
}

const c1 = await api(tokenComercio, '/api/precios/cotizar-direcciones', {
  tipo: 'comercio', comercio_id: comercio.id, destino: 'San Martín 441', metodo_pago: 'efectivo',
});
if (c1.status === 200 && c1.data?.precio_envio > 0 && c1.data?.distancia_km > 0) {
  bien(`cotizó: ${c1.data.distancia_km} km (${c1.data.metodo_distancia}) -> envío $${c1.data.precio_envio}, total $${c1.data.total_cliente}`);
} else {
  falla(`cotización comercio: HTTP ${c1.status} ${JSON.stringify(c1.data)}`);
}

// Coordenadas del comercio persistidas tras la cotización (migración 006)
{
  const { data: cRow, error: eRow } = await admin.from('comercios').select('lat, lng').eq('id', comercio.id).single();
  if (eRow && /does not exist|Could not find/i.test(eRow.message)) {
    console.log('  - columnas 006 todavía no aplicadas: el comercio no guarda lat/lng (esperado hasta correr la migración)');
  } else if (cRow?.lat != null && cRow?.lng != null) {
    bien(`comercio guardó sus coordenadas: ${cRow.lat.toFixed(5)}, ${cRow.lng.toFixed(5)} (la próxima cotización no geocodifica)`);
  } else {
    falla('el comercio quedó sin lat/lng después de cotizar');
  }
}

// Cliente guardado: si la dirección pedida es la del cliente, persiste lat/lng
{
  const { data: cli } = await admin.from('clientes').select('id, nombre, direccion, lat, lng').eq('comercio_id', comercio.id).limit(1).maybeSingle();
  if (cli) {
    const original = { direccion: cli.direccion, lat: cli.lat ?? null, lng: cli.lng ?? null };
    await admin.from('clientes').update({ direccion: 'Belgrano 150', lat: null, lng: null }).eq('id', cli.id);
    const cq = await api(tokenComercio, '/api/precios/cotizar-direcciones', {
      tipo: 'comercio', comercio_id: comercio.id, cliente_id: cli.id, destino: 'Belgrano 150',
    });
    const { data: cli2 } = await admin.from('clientes').select('lat, lng').eq('id', cli.id).single();
    if (cq.status === 200 && cli2?.lat != null) bien(`cliente "${cli.nombre}" guardó sus coordenadas al cotizar (${cli2.lat.toFixed(5)}, ${cli2.lng.toFixed(5)})`);
    else falla(`cliente no persistió lat/lng (HTTP ${cq.status}, lat=${cli2?.lat})`);
    await admin.from('clientes').update(original).eq('id', cli.id); // restaurar
  }
}

const c2 = await api(tokenComercio, '/api/precios/cotizar-direcciones', {
  tipo: 'comercio', comercio_id: comercio.id, destino: 'Direccion Inexistente 99999 xyzz',
});
if (c2.status === 422 && /destino/i.test(c2.data?.campo ?? '')) bien(`dirección inválida -> 422 con campo=destino ("${c2.data.error.slice(0, 60)}...")`);
else falla(`dirección inválida devolvió HTTP ${c2.status} ${JSON.stringify(c2.data)}`);

// ── 2. Privado cotiza por origen/destino ────────────────────────────────────
console.log('PRIVADO — cotización por origen/destino:');
const { token: tokenPrivado } = await login('privado@yendo.com');
const p1 = await api(tokenPrivado, '/api/precios/cotizar-direcciones', {
  tipo: 'particular', origen: '12 de Abril 384', destino: 'Belgrano 200, San José', propina_cadete: 500,
});
if (p1.status === 200 && p1.data?.precio_envio >= 3500 && p1.data?.distancia_km > 3) {
  bien(`cotizó: ${p1.data.distancia_km} km (${p1.data.metodo_distancia}) -> envío $${p1.data.precio_envio}, total $${p1.data.total_cliente} (propina $${p1.data.propina_cadete})`);
} else {
  falla(`cotización particular: HTTP ${p1.status} ${JSON.stringify(p1.data)}`);
}

// Dirección guardada del privado: el POST geocodifica y guarda lat/lng
{
  const d = await api(tokenPrivado, '/api/direcciones', {
    nombre: 'Casa (test e2e)', direccion: 'San Martín 441',
  });
  if (d.status === 201 && d.data?.id) {
    if (d.data.lat != null && d.data.lng != null) {
      bien(`dirección privada guardada con coordenadas: ${Number(d.data.lat).toFixed(5)}, ${Number(d.data.lng).toFixed(5)}`);
    } else {
      falla('la dirección privada se guardó SIN lat/lng');
    }
    // cotizar usándola como origen guardado (debe salir sin geocodificar)
    const pq = await api(tokenPrivado, '/api/precios/cotizar-direcciones', {
      tipo: 'particular', origen: 'San Martín 441', origen_direccion_id: d.data.id, destino: '12 de Abril 384',
    });
    if (pq.status === 200 && pq.data?.distancia_km > 0) bien(`cotizó con dirección guardada como origen: ${pq.data.distancia_km} km -> $${pq.data.total_cliente}`);
    else falla(`cotización con dirección guardada: HTTP ${pq.status}`);
    await admin.from('direcciones').delete().eq('id', d.data.id); // limpiar
  } else {
    falla(`no se pudo crear dirección privada de prueba: HTTP ${d.status} ${JSON.stringify(d.data)}`);
  }
}

// ── 3. Pedido real de comercio: el backend calcula y guarda ────────────────
console.log('PEDIDO REAL — crea, verifica guardado y cancela:');
const { data: cliente } = await admin.from('clientes').select('id, nombre').eq('comercio_id', comercio.id).limit(1).maybeSingle();
if (!cliente) {
  falla('el comercio demo no tiene clientes para probar');
} else {
  const o = await api(tokenComercio, '/api/ordenes', {
    comercio_id: comercio.id,
    cliente_id: cliente.id,
    cliente_nombre: cliente.nombre,
    direccion: 'San Martín 441',
    zona: 'ciudad_colon',
    zona_label: 'Ciudad de Colón',
    metodo_pago: 'efectivo',
    propina_cadete: 0,
    // SIN distancia_km y SIN precio: el backend tiene que resolver solo
  });
  if (o.status !== 201 || !o.data?.id) {
    falla(`crear pedido: HTTP ${o.status} ${JSON.stringify(o.data)}`);
  } else {
    const { data: guardada } = await admin.from('ordenes').select('*').eq('id', o.data.id).single();
    if (Number(guardada?.distancia_km) > 0) bien(`distancia_km guardada: ${guardada.distancia_km} km`);
    else falla(`distancia_km no quedó guardada: ${guardada?.distancia_km}`);

    if (Number(guardada?.precio_envio) >= 3000 && guardada?.precio === guardada?.precio_envio) {
      bien(`precio correcto: envío $${guardada.precio_envio} (base comercio + km extra si hay)`);
    } else falla(`precio raro: precio=${guardada?.precio} precio_envio=${guardada?.precio_envio}`);

    if ('destino_lat' in (guardada ?? {})) {
      if (guardada.destino_lat != null && guardada.destino_lng != null) {
        bien(`destino geocodificado: ${guardada.destino_lat.toFixed(5)}, ${guardada.destino_lng.toFixed(5)} (por ${guardada.distancia_calculada_por})`);
      } else falla('columnas 005 existen pero destino_lat/lng quedaron null');
    } else {
      console.log('  - columnas 005 todavía no aplicadas en la DB: el insert usó el fallback (esperado hasta correr la migración)');
    }

    if (guardada?.origen_lat != null) bien(`origen geocodificado: ${guardada.origen_lat.toFixed(5)}, ${guardada.origen_lng.toFixed(5)}`);
    else falla('origen_lat quedó null');

    if ('codigo_entrega' in (guardada ?? {})) {
      if (/^\d{4}$/.test(String(guardada.codigo_entrega ?? ''))) bien(`código de entrega generado: ${guardada.codigo_entrega}`);
      else falla(`código de entrega inválido: ${guardada.codigo_entrega}`);
    } else {
      console.log('  - columnas 007 todavía no aplicadas: sin código de entrega (esperado hasta correr la migración)');
    }

    // Limpiar: cancelar el pedido de prueba y liberar al cadete si se asignó
    await admin.from('ordenes').update({ estado: 'cancelada' }).eq('id', o.data.id);
    if (guardada?.cadete_id) await admin.from('cadetes').update({ estado: 'disponible' }).eq('id', guardada.cadete_id);
    console.log(`  - pedido de prueba ${o.data.id.slice(0, 8)}... cancelado (asignación: ${o.data.asignado_a_id ? 'directa' : o.data.sin_cadetes ? 'broadcast' : guardada?.cadete_id ? 'aceptada' : '—'})`);
  }
}

console.log(`\n${mal === 0 ? 'E2E OK' : `${mal} problema(s)`} (${ok} checks OK)`);
process.exit(mal === 0 ? 0 : 1);
