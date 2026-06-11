// Crea (o repara) la cuenta demo de administrador admin@yendo.com.
//
// USO (desde la carpeta Backend, requiere .env con SUPABASE_SERVICE_KEY):
//   ADMIN_PASSWORD=PasswordSegura123 node scripts/crear-admin.js
//   node scripts/crear-admin.js otra@cuenta.com OtraPassword123
//
// Idempotente: si el usuario ya existe, solo asegura el rol admin.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const EMAIL    = process.argv[2] ?? 'admin@yendo.com';
const PASSWORD = process.argv[3] ?? process.env.ADMIN_PASSWORD;

if (!PASSWORD) {
  console.error('Falta password. Usá ADMIN_PASSWORD=... o pasala como segundo argumento.');
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en Backend/.env');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  // ¿Existe ya?
  const { data: lista, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  let user = lista.users.find((u) => u.email === EMAIL);

  if (user) {
    console.log(`Usuario ${EMAIL} ya existe (${user.id}).`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { nombre: 'Admin Yendo', perfil: 'privado' }, // el trigger ya no acepta admin: lo subimos abajo
    });
    if (error) throw error;
    user = data.user;
    console.log(`Usuario ${EMAIL} creado (${user.id}).`);
  }

  // Asegurar perfil con rol admin (service key bypasea RLS y triggers de auth.uid)
  const { error: upsertError } = await supabase
    .from('perfiles')
    .upsert({ id: user.id, nombre: 'Admin Yendo', rol: 'admin' }, { onConflict: 'id' });
  if (upsertError) throw upsertError;

  console.log(`Perfil con rol admin asegurado para ${EMAIL}.`);
  console.log('Listo. Probá entrar con el botón "Admin" del login.');
}

main().catch((err) => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
