-- ════════════════════════════════════════════════════════
-- YENDO — Migración 001 (copiar y pegar en Supabase SQL Editor)
-- URL: https://supabase.com/dashboard/project/gzcsvexfnfzwtmlayafb/sql/new
-- ════════════════════════════════════════════════════════

-- 1. Nuevas columnas en ORDENES
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS asignado_a_id UUID REFERENCES cadetes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rechazos UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS broadcast_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ganancia_cadete NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ganancia_yendo  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS origen_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS origen_lng  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS es_particular BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Nueva columna en CADETES
ALTER TABLE cadetes
  ADD COLUMN IF NOT EXISTS ultima_entrega_en TIMESTAMPTZ;

-- 3. RLS — cadete puede ver su orden asignada, y órdenes en broadcast de su zona
DROP POLICY IF EXISTS "cadete_ve_sus_ordenes" ON ordenes;
CREATE POLICY "cadete_ve_sus_ordenes" ON ordenes
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
  );

DROP POLICY IF EXISTS "cadete_actualiza_orden" ON ordenes;
CREATE POLICY "cadete_actualiza_orden" ON ordenes
  FOR UPDATE USING (
    auth.uid() = cadete_id
    OR auth.uid() = asignado_a_id
    OR (
      broadcast_en IS NOT NULL
      AND estado = 'pendiente'
      AND NOT (auth.uid() = ANY(rechazos))
    )
    OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin')
  );

-- 4. Verificar resultado
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('ordenes','cadetes')
  AND column_name IN ('asignado_a_id','rechazos','broadcast_en','ganancia_cadete',
                      'ganancia_yendo','origen_lat','origen_lng','es_particular','ultima_entrega_en')
ORDER BY table_name, column_name;
