// Aplica un archivo SQL contra la base de Supabase usando la conexión directa
// de Postgres. Requiere DATABASE_URL (o SUPABASE_DB_URL) en Backend/.env.
//
// USO (desde la carpeta Backend):
//   node scripts/aplicar-sql.js ../sql/migrations/002_seguridad_roles.sql
//
// Si no hay connection string, avisa y sale: en ese caso el SQL se pega a
// mano en el SQL Editor del dashboard de Supabase.

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: node scripts/aplicar-sql.js <ruta-al-sql>');
  process.exit(1);
}

const conn = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.PG_CONNECTION_STRING;
if (!conn) {
  console.error('SIN_CONNECTION_STRING: no hay DATABASE_URL en el .env — pegá el SQL a mano en Supabase.');
  process.exit(2);
}

const sql = readFileSync(resolve(archivo), 'utf8');
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const res = await client.query(sql);
  const resultados = Array.isArray(res) ? res : [res];
  for (const r of resultados) {
    if (r.command === 'SELECT' && r.rows?.length) console.table(r.rows);
  }
  console.log(`OK: ${archivo} aplicado (${resultados.length} sentencias con resultado).`);
} catch (err) {
  console.error('ERROR aplicando SQL:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
