// Verifica contra Supabase (via service key) que las migraciones 002/003/004
// quedaron aplicadas de verdad. USO: node scripts/verificar-migraciones.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});
const anon = process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

let ok = 0, mal = 0;
const bien  = (msg) => { ok++;  console.log(`  ✓ ${msg}`); };
const falla = (msg) => { mal++; console.log(`  ✗ ${msg}`); };

// ── 002: signup con perfil='admin' debe quedar como 'privado' ───────────────
console.log('MIGRACIÓN 002 (roles):');
const mailPrueba = `test-seguridad-${Date.now()}@yendo-test.com`;
const { data: creado, error: errCrear } = await supabase.auth.admin.createUser({
  email: mailPrueba,
  password: 'Prueba-' + Date.now(),
  email_confirm: true,
  user_metadata: { nombre: 'Test Seguridad', perfil: 'admin' }, // intento de escalación
});
if (errCrear) {
  falla(`no se pudo crear usuario de prueba: ${errCrear.message}`);
} else {
  await new Promise((r) => setTimeout(r, 800)); // dar tiempo al trigger
  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', creado.user.id).maybeSingle();
  if (perfil?.rol === 'privado') bien(`signup con perfil='admin' quedó como '${perfil.rol}' (whitelist activa)`);
  else if (perfil?.rol === 'admin') falla(`¡VULNERABLE! el usuario de prueba quedó como ADMIN — la 002 NO está aplicada`);
  else falla(`perfil del usuario de prueba: ${perfil?.rol ?? 'no existe'}`);
  await supabase.auth.admin.deleteUser(creado.user.id); // limpiar
}

// ── 003: función atómica + policy eliminada ────────────────────────────────
console.log('MIGRACIÓN 003 (privacidad/atómica):');
const { error: errRpc } = await supabase.rpc('incrementar_stats_entrega', {
  p_cadete_id: '00000000-0000-0000-0000-000000000000',
  p_ganancia: 0,
});
if (errRpc && /could not find the function|does not exist/i.test(errRpc.message)) {
  falla('función incrementar_stats_entrega NO existe');
} else {
  bien('función incrementar_stats_entrega existe');
}
if (anon) {
  const { data: filas } = await anon.from('cadetes').select('id').eq('estado', 'disponible').limit(1);
  if (filas?.length) falla('un usuario sin login todavía puede leer cadetes disponibles');
  else bien('cadetes disponibles ya no se leen sin permiso');
} else {
  console.log('  - (sin SUPABASE_ANON_KEY en .env: salteo chequeo de policy)');
}

// ── 004: tabla de configuración + columnas financieras ─────────────────────
console.log('MIGRACIÓN 004 (finanzas):');
const { data: config, error: errCfg } = await supabase.from('configuracion_servicio').select('*').eq('id', 1).maybeSingle();
if (errCfg) falla(`tabla configuracion_servicio: ${errCfg.message}`);
else bien(`configuracion_servicio OK (lluvia=${config?.recargo_lluvia_activo}, feriado=${config?.recargo_feriado_activo}, monto=$${config?.recargo_monto})`);

const { error: errCols } = await supabase.from('ordenes').select('propina_cadete, total_cliente, efectivo_a_rendir').limit(1);
if (errCols) falla(`columnas financieras en ordenes: ${errCols.message}`);
else bien('columnas financieras en ordenes OK');

console.log(`\n${mal === 0 ? 'TODO APLICADO CORRECTAMENTE' : `${mal} problema(s) — revisá qué migración falta pegar`} (${ok} checks OK)`);
process.exit(mal === 0 ? 0 : 1);
