-- ============================================================
-- SECURITY FIX — ejecutar en Supabase SQL Editor
-- Fecha: 2026-06-06
-- ============================================================

-- FIX CRÍTICO: Evitar que usuarios cambien su propio rol
-- La política anterior no tenía WITH CHECK, permitiendo
-- que cualquier usuario se asignara rol = 'admin'
DROP POLICY IF EXISTS "perfil_update" ON public.perfiles;

CREATE POLICY "perfil_update" ON public.perfiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND rol = (SELECT rol FROM public.perfiles WHERE id = auth.uid())
  );

-- Función para que solo admins puedan cambiar el rol de otros usuarios
CREATE OR REPLACE FUNCTION public.admin_set_rol(target_id uuid, new_rol text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo admins pueden cambiar roles';
  END IF;
  UPDATE public.perfiles SET rol = new_rol WHERE id = target_id;
END;
$$;

-- FIX ZONAS: Activar RLS si existe la tabla
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zonas' AND table_schema = 'public') THEN
    ALTER TABLE public.zonas ENABLE ROW LEVEL SECURITY;

    -- Cualquier usuario autenticado puede ver zonas (son información pública del servicio)
    DROP POLICY IF EXISTS "zonas_select" ON public.zonas;
    CREATE POLICY "zonas_select" ON public.zonas
      FOR SELECT USING (auth.role() = 'authenticated');

    -- Solo admins pueden crear/editar/borrar zonas
    DROP POLICY IF EXISTS "zonas_admin" ON public.zonas;
    CREATE POLICY "zonas_admin" ON public.zonas
      FOR ALL
      USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin'));
  END IF;
END $$;
