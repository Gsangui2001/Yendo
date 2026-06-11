// Aplica las migraciones 002 + 003 + 004 en orden contra Postgres y verifica.
// Requiere DATABASE_URL en Backend/.env (connection string de Supabase).
//
// Dónde sacar la connection string:
//   Supabase Dashboard -> Project Settings -> Database -> Connection string
//   -> pestaña "URI" (formato postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres)
//   Pegala en Backend/.env como:  DATABASE_URL=postgresql://...
//
// USO (desde la carpeta Backend):
//   node scripts/aplicar-todo.js

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const conn = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.PG_CONNECTION_STRING;
if (!conn) {
  console.error('SIN_CONNECTION_STRING.');
  console.error('Agregá a Backend/.env la línea:  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.gzcsvexfnfzwtmlayafb.supabase.co:5432/postgres');
  console.error('(la sacás de Supabase -> Settings -> Database -> Connection string -> URI)');
  process.exit(2);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrDir = resolve(__dirname, '../../sql/migrations');
const archivos = [
  '002_seguridad_roles.sql',
  '003_privacidad_cadetes.sql',
  '004_finanzas_propinas_recargos.sql',
];

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('Conectado a la base.\n');
  for (const f of archivos) {
    const sql = readFileSync(resolve(migrDir, f), 'utf8');
    process.stdout.write(`Aplicando ${f} ... `);
    await client.query(sql);
    console.log('OK');
  }
  console.log('\nLas 3 migraciones se aplicaron. Verificando...\n');
} catch (err) {
  // Redacta la connection string / password si apareciera en el mensaje de error
  let msg = String(err.message ?? err);
  if (conn) msg = msg.split(conn).join('[DATABASE_URL]');
  msg = msg.replace(/postgresql:\/\/[^\s'"]+/gi, '[DATABASE_URL]');
  console.error('\nERROR aplicando SQL:', msg);
  process.exit(1);
} finally {
  await client.end();
}
