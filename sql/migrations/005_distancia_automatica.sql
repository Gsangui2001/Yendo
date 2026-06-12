-- ============================================================================
-- MIGRACIÓN 005: Distancia automática (geocodificación origen/destino)
-- ============================================================================
-- El backend ahora geocodifica las direcciones y calcula la distancia de ruta
-- al cotizar y al crear pedidos. Estas columnas guardan el resultado:
--   destino_lat / destino_lng      coordenadas del punto de entrega
--   distancia_calculada_en         cuándo se calculó la distancia
--   distancia_calculada_por        'osrm' (ruta real) | 'haversine' (estimada)
--                                  | 'manual' (km cargados a mano, fallback)
-- origen_lat / origen_lng ya existían (GPS para matching); se asegura igual.
--
-- Cómo aplicar: pegar TODO este archivo en Supabase -> SQL Editor -> Run.
-- Es idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================================

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS origen_lat              DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS origen_lng              DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS destino_lat             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS destino_lng             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS distancia_calculada_en  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS distancia_calculada_por TEXT;

COMMENT ON COLUMN public.ordenes.destino_lat             IS 'Latitud del punto de entrega (geocodificada por el backend)';
COMMENT ON COLUMN public.ordenes.destino_lng             IS 'Longitud del punto de entrega (geocodificada por el backend)';
COMMENT ON COLUMN public.ordenes.distancia_calculada_en  IS 'Momento en que el backend calculó la distancia';
COMMENT ON COLUMN public.ordenes.distancia_calculada_por IS 'osrm = ruta real | haversine = estimada | manual = km a mano';

-- ── Zona como preferencia, no como muro ─────────────────────────────────────
-- El matching prefiere cadetes de la misma zona, pero si no hay, cualquier
-- cadete activo puede ver y tomar un pedido en broadcast (Colón es chico).
-- Se recrea la policy de lectura del cadete sin la condición de zona.
DROP POLICY IF EXISTS "cadete_ve_sus_ordenes" ON public.ordenes;
CREATE POLICY "cadete_ve_sus_ordenes" ON public.ordenes
  FOR SELECT USING (
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

-- ── Realtime: asegurar que ordenes emite cambios ────────────────────────────
-- Las ofertas al cadete y el panel admin escuchan postgres_changes; si la
-- tabla no está en la publicación, nunca llega nada (el polling lo cubre,
-- pero esto da la vía instantánea).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ordenes;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- ya estaba
  WHEN undefined_object THEN NULL;  -- la publicación no existe en este entorno
END $$;

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ordenes'
  AND column_name IN ('origen_lat','origen_lng','destino_lat','destino_lng',
                      'distancia_calculada_en','distancia_calculada_por')
ORDER BY column_name;
