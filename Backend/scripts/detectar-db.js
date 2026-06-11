// Detecta si hay una vía de conexión directa a Postgres en el .env.
// Imprime SOLO los nombres de variables presentes, nunca los valores.
import 'dotenv/config';

const candidatas = [
  'DATABASE_URL', 'SUPABASE_DB_URL', 'PG_CONNECTION_STRING', 'POSTGRES_URL',
  'SUPABASE_DB_PASSWORD', 'DB_PASSWORD', 'POSTGRES_PASSWORD', 'PGPASSWORD',
];

const presentes = candidatas.filter((k) => process.env[k]);
console.log(presentes.length ? `PRESENTES: ${presentes.join(', ')}` : 'NINGUNA');
