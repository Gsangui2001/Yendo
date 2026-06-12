-- ============================================================================
-- MIGRACIÓN 006: Coordenadas guardadas en comercios, clientes y direcciones
-- ============================================================================
-- El presupuesto origen→destino sale más rápido y más preciso si las
-- entidades guardan su lat/lng una sola vez en lugar de geocodificar siempre:
--   comercios.lat/lng    origen de los pedidos del comercio
--   clientes.lat/lng     destino habitual de cada cliente del comercio
--   direcciones.lat/lng  direcciones guardadas del usuario privado
-- La "etiqueta" de las direcciones privadas (casa, trabajo...) YA existe:
-- es la columna direcciones.nombre — no se agrega otra.
--
-- El backend llena estas columnas solo: usa lat/lng si están, y si faltan
-- geocodifica una vez y las persiste (lib/ubicaciones.js).
--
-- Cómo aplicar: pegar TODO este archivo en Supabase -> SQL Editor -> Run.
-- Es idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================================

ALTER TABLE public.comercios
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

ALTER TABLE public.direcciones
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

COMMENT ON COLUMN public.comercios.lat   IS 'Latitud de la dirección del comercio (geocodificada por el backend; recalcular si cambia direccion)';
COMMENT ON COLUMN public.comercios.lng   IS 'Longitud de la dirección del comercio';
COMMENT ON COLUMN public.clientes.lat    IS 'Latitud de la dirección del cliente (geocodificada por el backend)';
COMMENT ON COLUMN public.clientes.lng    IS 'Longitud de la dirección del cliente';
COMMENT ON COLUMN public.direcciones.lat IS 'Latitud de la dirección guardada (geocodificada por el backend)';
COMMENT ON COLUMN public.direcciones.lng IS 'Longitud de la dirección guardada';

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('comercios', 'clientes', 'direcciones')
  AND column_name IN ('lat', 'lng')
ORDER BY table_name, column_name;
