/**
 * Script de migración: ejecuta 001_rebuild.sql en Supabase.
 * Uso: node sql/migrations/001_run.js
 * Requiere: Backend/.env con SUPABASE_URL y SUPABASE_SERVICE_KEY
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

// Statements DDL individuales (supabase-js no soporta DDL nativo,
// pero lo intentamos via rpc si existe, o informamos cómo correrlo)
const statements = [
  `ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS asignado_a_id UUID REFERENCES cadetes(id) ON DELETE SET NULL`,
  `ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS rechazos UUID[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS broadcast_en TIMESTAMPTZ`,
  `ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS ganancia_cadete NUMERIC(12,2)`,
  `ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS ganancia_yendo NUMERIC(12,2)`,
  `ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS origen_lat DOUBLE PRECISION`,
  `ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS origen_lng DOUBLE PRECISION`,
  `ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS es_particular BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE cadetes ADD COLUMN IF NOT EXISTS ultima_entrega_en TIMESTAMPTZ`,
  `DROP POLICY IF EXISTS "cadete_ve_sus_ordenes" ON ordenes`,
  `CREATE POLICY "cadete_ve_sus_ordenes" ON ordenes
    FOR SELECT USING (
      auth.uid() = cadete_id
      OR auth.uid() = asignado_a_id
      OR (
        broadcast_en IS NOT NULL
        AND estado = 'pendiente'
        AND zona IN (SELECT zona FROM cadetes WHERE id = auth.uid())
        AND NOT (auth.uid() = ANY(rechazos))
      )
      OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin')
    )`,
  `DROP POLICY IF EXISTS "cadete_actualiza_orden" ON ordenes`,
  `CREATE POLICY "cadete_actualiza_orden" ON ordenes
    FOR UPDATE USING (
      auth.uid() = cadete_id
      OR auth.uid() = asignado_a_id
      OR (broadcast_en IS NOT NULL AND estado = 'pendiente' AND NOT (auth.uid() = ANY(rechazos)))
      OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin')
    )`,
];

async function run() {
  console.log('Intentando migración via Supabase RPC...\n');

  // Intento 1: usar exec_sql RPC si existe
  const { error: rpcError } = await supabase.rpc('exec_sql', {
    sql: statements.join(';\n'),
  });

  if (!rpcError) {
    console.log('✓ Migración ejecutada via RPC exec_sql');
    return;
  }

  console.log('RPC exec_sql no disponible. Intentando statements individuales...\n');

  // Intento 2: ejecutar cada statement via rpc('query', ...)
  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql: stmt });
    const preview = stmt.trim().substring(0, 60);
    if (error) {
      console.log(`✗ ${preview}...\n  Error: ${error.message}`);
    } else {
      console.log(`✓ ${preview}...`);
    }
  }
}

run().catch(err => {
  console.error('\nError inesperado:', err.message);
  console.log('\n─────────────────────────────────────────────────');
  console.log('No se pudo ejecutar la migración automáticamente.');
  console.log('Correla manualmente en el SQL Editor de Supabase:');
  console.log('https://supabase.com/dashboard/project/gzcsvexfnfzwtmlayafb/sql');
  console.log('Archivo: sql/migrations/001_rebuild.sql');
  console.log('─────────────────────────────────────────────────');
});
