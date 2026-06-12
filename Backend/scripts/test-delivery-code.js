// E2E del código de entrega contra el backend local (:3001) y Supabase real.
//  1. comercio crea un pedido -> el backend genera codigo_entrega
//  2. el comercio VE el código; el cadete NO lo ve en su lista
//  3. cadete intenta entregar SIN código -> 422
//  4. cadete intenta con código INCORRECTO -> 422 + intentos suma
//  5. cadete entrega con el código CORRECTO -> entregada + verificado_en
//  6. se restauran los stats del cadete y se cancela la orden (no ensucia demo)
// USO (desde Backend, con el server corriendo): node scripts/test-delivery-code.js
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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

async function api(token, path, body, method) {
  const res = await fetch(`${API}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ── Setup: comercio crea pedido ─────────────────────────────────────────────
console.log('CREAR PEDIDO (comercio):');
const { token: tokenComercio, userId: comercioUserId } = await login('comercio@yendo.com');
const { token: tokenCadete, userId: cadeteUserId }     = await login('cadete@yendo.com');

const { data: comercio } = await admin.from('comercios').select('id').eq('owner_id', comercioUserId).limit(1).single();
const { data: cliente }  = await admin.from('clientes').select('id, nombre').eq('comercio_id', comercio.id).limit(1).single();

const creada = await api(tokenComercio, '/api/ordenes', {
  comercio_id: comercio.id, cliente_id: cliente.id, cliente_nombre: cliente.nombre,
  direccion: 'San Martín 441', metodo_pago: 'efectivo', propina_cadete: 0,
});
if (creada.status !== 201) { falla(`no se pudo crear pedido: ${creada.status} ${JSON.stringify(creada.data)}`); process.exit(1); }
const ordenId = creada.data.id;

if (/^\d{4}$/.test(String(creada.data.codigo_entrega ?? ''))) bien(`el comercio recibe el código en la respuesta: ${creada.data.codigo_entrega}`);
else falla(`la respuesta al comercio no trae código de 4 dígitos: ${creada.data.codigo_entrega}`);

const { data: guardada } = await admin.from('ordenes').select('codigo_entrega').eq('id', ordenId).single();
const codigoReal = guardada.codigo_entrega;

// ── Snapshot de stats del cadete (para restaurar al final) ──────────────────
const { data: statsAntes } = await admin.from('cadetes')
  .select('estado, ultima_entrega_en, ganancias_hoy, ganancias_semana, ganancias_mes, viajes_hoy, viajes_semana, viajes_mes')
  .eq('id', cadeteUserId).single();

// Asignar el pedido al cadete demo (directo, como haría el admin)
await admin.from('ordenes').update({ estado: 'asignada', cadete_id: cadeteUserId, asignado_a_id: null, broadcast_en: null, asignada_en: new Date().toISOString() }).eq('id', ordenId);
await admin.from('cadetes').update({ estado: 'en_viaje' }).eq('id', cadeteUserId);

// ── El cadete NO ve el código ───────────────────────────────────────────────
console.log('PRIVACIDAD DEL CÓDIGO:');
const lista = await api(tokenCadete, '/api/ordenes');
const miOrden = (Array.isArray(lista.data) ? lista.data : []).find((o) => o.id === ordenId);
if (miOrden && !('codigo_entrega' in miOrden)) bien('GET /api/ordenes del cadete NO incluye codigo_entrega');
else falla(`el cadete ve el código en su lista: ${miOrden?.codigo_entrega}`);

// ── Entregar sin código / con código incorrecto / con el correcto ───────────
console.log('VALIDACIÓN DE ENTREGA:');
const sinCodigo = await api(tokenCadete, `/api/ordenes/${ordenId}/entregar`, { cadete_id: cadeteUserId }, 'PATCH');
if (sinCodigo.status === 422 && sinCodigo.data?.codigo_requerido) bien(`sin código -> 422 ("${sinCodigo.data.error.slice(0, 45)}...")`);
else falla(`sin código devolvió ${sinCodigo.status}: ${JSON.stringify(sinCodigo.data)}`);

const codigoMalo = codigoReal === '0000' ? '1111' : '0000';
const incorrecto = await api(tokenCadete, `/api/ordenes/${ordenId}/entregar`, { cadete_id: cadeteUserId, codigo: codigoMalo }, 'PATCH');
if (incorrecto.status === 422 && /incorrecto/i.test(incorrecto.data?.error ?? '')) bien(`código incorrecto -> 422 "Código incorrecto"`);
else falla(`código incorrecto devolvió ${incorrecto.status}: ${JSON.stringify(incorrecto.data)}`);

const { data: conIntentos } = await admin.from('ordenes').select('codigo_entrega_intentos').eq('id', ordenId).single();
if ((conIntentos?.codigo_entrega_intentos ?? 0) >= 1) bien(`intentos fallidos registrados: ${conIntentos.codigo_entrega_intentos}`);
else falla('no se registró el intento fallido');

const correcto = await api(tokenCadete, `/api/ordenes/${ordenId}/entregar`, { cadete_id: cadeteUserId, codigo: codigoReal }, 'PATCH');
if (correcto.status === 200 && correcto.data?.estado === 'entregada') bien('código correcto -> entregada');
else falla(`código correcto devolvió ${correcto.status}: ${JSON.stringify(correcto.data)}`);

const { data: final } = await admin.from('ordenes').select('codigo_entrega_verificado_en, ganancia_yendo, ganancia_cadete').eq('id', ordenId).single();
if (final?.codigo_entrega_verificado_en) bien(`verificado_en registrado + finanzas cerradas (yendo $${final.ganancia_yendo}, cadete $${final.ganancia_cadete})`);
else falla('no quedó registrado codigo_entrega_verificado_en');

// ── Limpieza: cancelar orden de prueba y restaurar stats del cadete ─────────
await admin.from('ordenes').update({ estado: 'cancelada' }).eq('id', ordenId);
await admin.from('cadetes').update(statsAntes).eq('id', cadeteUserId);
console.log(`  - orden de prueba ${ordenId.slice(0, 8)}... cancelada y stats del cadete restaurados`);

console.log(`\n${mal === 0 ? 'CÓDIGO DE ENTREGA OK' : `${mal} problema(s)`} (${ok} checks OK)`);
process.exit(mal === 0 ? 0 : 1);
