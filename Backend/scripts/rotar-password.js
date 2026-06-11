// Rota la contraseña de un usuario de Supabase y la imprime UNA vez.
//
// USO (desde la carpeta Backend):
//   node scripts/rotar-password.js usuario@email.com
//   node scripts/rotar-password.js usuario@email.com PasswordElegida123
//
// Si no pasás contraseña, genera una aleatoria segura.

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const EMAIL = process.argv[2];
if (!EMAIL) { console.error('Uso: node scripts/rotar-password.js <email> [password]'); process.exit(1); }

const PASSWORD = process.argv[3] ?? `Yendo-${randomBytes(6).toString('base64url')}`;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const { data: lista, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (listError) { console.error('Error listando usuarios:', listError.message); process.exit(1); }

const user = lista.users.find((u) => u.email === EMAIL);
if (!user) { console.error(`No existe el usuario ${EMAIL}`); process.exit(1); }

const { error } = await supabase.auth.admin.updateUserById(user.id, { password: PASSWORD });
if (error) { console.error('Error rotando password:', error.message); process.exit(1); }

console.log(`Password de ${EMAIL} rotada con éxito.`);
console.log(`NUEVA PASSWORD (guardala ahora, no queda registrada en ningún lado): ${PASSWORD}`);
