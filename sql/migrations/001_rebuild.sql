-- Migration 001: Rebuild Yendo — Auto-assignment, GPS, Revenue split
-- Ejecutar en Supabase SQL Editor

-- ============================================================
-- ORDENES: columnas nuevas
-- ============================================================

-- Cadete al que se le ofrece el pedido (antes de aceptar)
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS asignado_a_id UUID REFERENCES cadetes(id) ON DELETE SET NULL;

-- Array de cadete IDs que rechazaron este pedido
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS rechazos UUID[] NOT NULL DEFAULT '{}';

-- Cuando el pedido entra en modo broadcast (nadie disponible individualmente)
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS broadcast_en TIMESTAMPTZ;

-- Split de ganancia por pedido
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS ganancia_cadete NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ganancia_yendo  NUMERIC(12,2);

-- Coordenadas del origen (para calcular distancia a cadetes)
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS origen_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS origen_lng  DOUBLE PRECISION;

-- Flag para pedidos de particulares (aplica surcharge $500)
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS es_particular BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- CADETES: columnas nuevas
-- ============================================================

-- Timestamp de la última entrega completada (para el algoritmo de fairness)
ALTER TABLE cadetes
ADD COLUMN IF NOT EXISTS ultima_entrega_en TIMESTAMPTZ;

-- Índices para matching, asignación directa y broadcast.
-- Mantienen rápidas las pantallas del cadete y el motor de asignación.
CREATE INDEX IF NOT EXISTS idx_cadetes_matching
ON cadetes (zona, estado, activo, ultima_entrega_en);

CREATE INDEX IF NOT EXISTS idx_ordenes_asignacion_directa
ON ordenes (asignado_a_id, estado, creado_en DESC)
WHERE asignado_a_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ordenes_broadcast_zona
ON ordenes (zona, estado, broadcast_en, creado_en DESC)
WHERE broadcast_en IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ordenes_cadete_estado
ON ordenes (cadete_id, estado, creado_en DESC)
WHERE cadete_id IS NOT NULL;

-- ============================================================
-- RLS: políticas actualizadas para asignación directa
-- ============================================================

-- Cadete puede ver:
--   a) Sus propias órdenes (cadete_id = su id)
--   b) Órdenes pendientes asignadas a él (asignado_a_id = su id)
--   c) Órdenes en broadcast (broadcast_en IS NOT NULL) de su zona, donde no rechazó
DROP POLICY IF EXISTS "cadete_ve_sus_ordenes" ON ordenes;
CREATE POLICY "cadete_ve_sus_ordenes" ON ordenes
  FOR SELECT USING (
    auth.uid() = cadete_id
    OR auth.uid() = asignado_a_id
    OR (
      broadcast_en IS NOT NULL
      AND estado = 'pendiente'
      AND zona IN (
        SELECT zona FROM cadetes WHERE id = auth.uid()
      )
      AND NOT (auth.uid() = ANY(rechazos))
    )
    OR EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid() AND rol = 'admin'
    )
  );

-- Cadete puede actualizar órdenes donde está asignado o en broadcast
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
    OR EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid() AND rol = 'admin'
    )
  );

-- ============================================================
-- Verificar resultado
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ordenes'
  AND column_name IN ('asignado_a_id','rechazos','broadcast_en','ganancia_cadete','ganancia_yendo','origen_lat','origen_lng','es_particular')
ORDER BY column_name;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cadetes'
  AND column_name = 'ultima_entrega_en';
