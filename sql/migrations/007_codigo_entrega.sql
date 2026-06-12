-- ============================================================================
-- MIGRACIÓN 007: Código de entrega
-- ============================================================================
-- El cadete ya no puede marcar entregado libremente: al crear el pedido el
-- backend genera un código corto que ve el comercio/privado (y el admin),
-- y el cadete tiene que ingresarlo al entregar. El backend lo valida.
--   codigo_entrega                código de 4 dígitos (texto, conserva ceros)
--   codigo_entrega_verificado_en cuándo se validó correctamente
--   codigo_entrega_intentos      intentos fallidos acumulados (auditoría)
--
-- Cómo aplicar: pegar TODO este archivo en Supabase -> SQL Editor -> Run.
-- Es idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================================

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS codigo_entrega                TEXT,
  ADD COLUMN IF NOT EXISTS codigo_entrega_verificado_en  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS codigo_entrega_intentos       INT DEFAULT 0;

COMMENT ON COLUMN public.ordenes.codigo_entrega               IS 'Código que el cliente/comercio le da al cadete al recibir (lo valida el backend)';
COMMENT ON COLUMN public.ordenes.codigo_entrega_verificado_en IS 'Momento en que el cadete ingresó el código correcto';
COMMENT ON COLUMN public.ordenes.codigo_entrega_intentos      IS 'Intentos fallidos de código (auditoría; sin bloqueo en beta)';

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ordenes'
  AND column_name LIKE 'codigo_entrega%'
ORDER BY column_name;
