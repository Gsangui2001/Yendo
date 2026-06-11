-- YENDO — MIGRACION OFICIAL 004: FINANZAS, PROPINAS Y RECARGOS
--
-- COPIAR Y PEGAR ESTE ARCHIVO COMPLETO EN:
-- Supabase Dashboard -> SQL Editor -> New query
-- (Correr DESPUES de 002 y 003.)
--
-- Soporta el modelo financiero nuevo:
--   - Precio por kilometros (comercio $3.000 / particular $3.500 hasta 5 km,
--     luego $700 por km extra) calculado SIEMPRE en el backend.
--   - Propina opcional 100% del cadete (no paga el 18% de Yendo).
--   - Recargo fijo $500 por lluvia/feriado (una sola vez aunque esten ambos).
--   - Liquidacion por metodo de pago: efectivo => el cadete rinde el 18%;
--     online/transferencia => Yendo deposita al cadete su total.

-- ============================================================
-- ORDENES: campos financieros
-- ============================================================
ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS distancia_km             NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS precio_base              NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_minimo            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS precio_km_extra          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS km_incluidos             NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS recargo_clima_feriado    NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS propina_cadete           NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_envio             NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_cliente            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_cadete             NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS efectivo_a_rendir        NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_a_depositar_cadete NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_calculado_en      TIMESTAMPTZ;

-- ganancia_cadete / ganancia_yendo / metodo_pago ya existen (001 / schema base).

-- ============================================================
-- CONFIGURACION DEL SERVICIO (recargos lluvia/feriado)
-- ============================================================
-- Singleton: una sola fila con id = 1.
CREATE TABLE IF NOT EXISTS public.configuracion_servicio (
  id                      SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  recargo_feriado_activo  BOOLEAN NOT NULL DEFAULT FALSE,
  recargo_lluvia_activo   BOOLEAN NOT NULL DEFAULT FALSE,
  recargo_monto           NUMERIC(12,2) NOT NULL DEFAULT 500,
  actualizado_en          TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.configuracion_servicio (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.configuracion_servicio ENABLE ROW LEVEL SECURITY;

-- Cualquier autenticado puede LEER la config (el front muestra "recargo activo");
-- escribir, solo admin (el backend usa service key e ignora RLS igual).
DROP POLICY IF EXISTS "config_select" ON public.configuracion_servicio;
CREATE POLICY "config_select" ON public.configuracion_servicio
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "config_admin_write" ON public.configuracion_servicio;
CREATE POLICY "config_admin_write" ON public.configuracion_servicio
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin')
  );

-- ============================================================
-- Verificacion
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ordenes'
  AND column_name IN ('distancia_km','propina_cadete','precio_envio','total_cliente',
                      'total_cadete','efectivo_a_rendir','monto_a_depositar_cadete',
                      'recargo_clima_feriado','precio_calculado_en')
ORDER BY column_name;

SELECT * FROM public.configuracion_servicio;
