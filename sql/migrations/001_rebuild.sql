-- YENDO — MIGRACION OFICIAL 001
-- Auto-asignacion, GPS, broadcast, split 82/18 e indices de escala.
--
-- COPIAR Y PEGAR ESTE ARCHIVO COMPLETO EN:
-- Supabase Dashboard -> SQL Editor -> New query
--
-- No usar archivos viejos duplicados de esta migracion.
--
-- ALCANCE: esta es una MIGRACION SOBRE UNA DB EXISTENTE, no un schema
-- desde cero. Asume que ya existen las tablas base (perfiles, comercios,
-- clientes, cadetes, direcciones, ordenes) creadas por sql/schema.sql.
-- Lo que antes vivia suelto en fix-piloto.sql / schema_security_fix.sql
-- (tabla zonas, columnas comercios.plan y comercios.categoria, limpieza
-- de policies viejas de cadete) quedo consolidado aca abajo para que la
-- app no dependa de archivos sueltos ni de cambios hechos a mano.

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
-- COMERCIOS: columnas usadas por el panel admin
-- ============================================================
-- 'plan' define cómo se le cobra al comercio (suscripción).
-- 'categoria' es el rubro mostrado en el panel y formulario de alta.
ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS plan      TEXT DEFAULT 'sin_plan';
ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS categoria TEXT;

-- ============================================================
-- ZONAS: tarifas por zona (la lee el frontend, la administra el admin)
-- ============================================================
-- Columnas que usan frontend (Pedido.jsx, admin TablaPrecios) y
-- backend (routes/admin.js: POST/PATCH/DELETE /api/admin/zonas).
CREATE TABLE IF NOT EXISTS public.zonas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value      TEXT NOT NULL UNIQUE,          -- slug interno (ej: ciudad_colon)
  label      TEXT NOT NULL,                 -- nombre visible (ej: Ciudad de Colón)
  precio     NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_km  NUMERIC(12,2) NOT NULL DEFAULT 0,
  tiempo     TEXT,                          -- estimado visible (ej: "15 - 25 min")
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  orden      INT NOT NULL DEFAULT 0,
  creado_en  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.zonas ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer las zonas (info pública del servicio).
DROP POLICY IF EXISTS "zonas_select" ON public.zonas;
CREATE POLICY "zonas_select" ON public.zonas
  FOR SELECT USING (auth.role() = 'authenticated');

-- Solo admins escriben zonas (el backend usa service key y bypassea RLS igual).
DROP POLICY IF EXISTS "zonas_admin" ON public.zonas;
CREATE POLICY "zonas_admin" ON public.zonas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin')
  );

-- Seed de zonas piloto (Colón, Entre Ríos). No pisa lo ya cargado.
INSERT INTO public.zonas (value, label, precio, precio_km, tiempo, activo, orden) VALUES
  ('ciudad_colon',      'Ciudad de Colón',   3000, 0, '10 - 20 min', TRUE, 1),
  ('barrio_ombu',       'Barrio Ombú',       3500, 0, '15 - 25 min', TRUE, 2),
  ('barrio_artalaz',    'Barrio Artalaz',    5000, 0, '15 - 25 min', TRUE, 3),
  ('barrio_los_bretes', 'Barrio Los Bretes', 6000, 0, '20 - 30 min', TRUE, 4),
  ('san_jose',          'San José',          8500, 0, '25 - 35 min', TRUE, 5),
  ('el_brillante',      'El Brillante',      8500, 0, '25 - 35 min', TRUE, 6),
  ('pueblo_liebig',     'Pueblo Liebig',     8500, 0, '25 - 35 min', TRUE, 7)
ON CONFLICT (value) DO NOTHING;

-- ============================================================
-- RLS: políticas actualizadas para asignación directa
-- ============================================================

-- Limpieza de policies viejas que dejaban a CUALQUIER cadete ver/editar
-- TODOS los pendientes sin filtro de zona (de schema.sql y fix-piloto.sql).
-- Quedan reemplazadas por cadete_ve_sus_ordenes / cadete_actualiza_orden.
DROP POLICY IF EXISTS "orden_cadete_select" ON ordenes;
DROP POLICY IF EXISTS "orden_cadete_update" ON ordenes;

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

-- Columnas nuevas de comercios
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'comercios'
  AND column_name IN ('plan','categoria')
ORDER BY column_name;

-- Tabla zonas creada + cantidad de zonas cargadas
SELECT to_regclass('public.zonas') AS tabla_zonas;
SELECT count(*) AS zonas_cargadas FROM public.zonas;

-- Las policies viejas de cadete NO deben aparecer; sí las nuevas
SELECT policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'ordenes'
  AND policyname IN (
    'orden_cadete_select', 'orden_cadete_update',
    'cadete_ve_sus_ordenes', 'cadete_actualiza_orden'
  )
ORDER BY policyname;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('ordenes', 'cadetes')
  AND indexname IN (
    'idx_cadetes_matching',
    'idx_ordenes_asignacion_directa',
    'idx_ordenes_broadcast_zona',
    'idx_ordenes_cadete_estado'
  )
ORDER BY indexname;
