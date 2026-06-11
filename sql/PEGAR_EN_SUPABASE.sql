-- ============================================================================
-- YENDO — MIGRACIONES 002 + 003 + 004 COMBINADAS (en orden, idempotentes)
-- Pegar este archivo COMPLETO en Supabase Dashboard -> SQL Editor -> Run.
-- Generado automaticamente: no editar; los originales viven en sql/migrations/
-- ============================================================================

-- >>>>>>>>>> 002_seguridad_roles.sql <<<<<<<<<<

-- YENDO â€” MIGRACION OFICIAL 002: SEGURIDAD DE ROLES
--
-- COPIAR Y PEGAR ESTE ARCHIVO COMPLETO EN:
-- Supabase Dashboard -> SQL Editor -> New query
--
-- Cierra dos vulnerabilidades criticas de escalacion de privilegios:
--
--   1. SIGNUP COMO ADMIN: el trigger handle_new_user tomaba el rol del
--      metadata del signup sin validar. Como la anon key es publica,
--      cualquiera podia registrarse con perfil='admin' desde la consola
--      del navegador y volverse administrador.
--
--   2. UPDATE DEL PROPIO ROL: la policy perfil_update permite editar la
--      propia fila de perfiles SIN restringir columnas, asi que un usuario
--      podia hacer UPDATE perfiles SET rol='admin' WHERE id = su_id.
--
-- Despues de esta migracion los admin se crean SOLO a mano (dashboard de
-- Supabase o script de backend con service key).

-- ============================================================
-- 1) Trigger de alta: whitelist de roles (admin excluido)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_rol    text;
  v_nombre text;
begin
  v_rol    := coalesce(new.raw_user_meta_data->>'perfil', 'privado');
  v_nombre := coalesce(new.raw_user_meta_data->>'nombre', new.email);

  -- Whitelist: nadie se auto-registra como admin (ni con roles inventados)
  if v_rol not in ('comercio', 'cadete', 'privado') then
    v_rol := 'privado';
  end if;

  insert into public.perfiles (id, nombre, rol)
  values (new.id, v_nombre, v_rol)
  on conflict (id) do nothing;

  if v_rol = 'cadete' then
    insert into public.cadetes (id, nombre)
    values (new.id, v_nombre)
    on conflict (id) do nothing;
  end if;

  if v_rol = 'comercio' then
    insert into public.comercios (owner_id, nombre)
    values (new.id, v_nombre)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- ============================================================
-- 2) Bloquear cambio del propio rol via UPDATE directo
-- ============================================================
-- Trigger BEFORE UPDATE: solo un admin puede cambiar la columna rol.
create or replace function public.bloquear_cambio_rol()
returns trigger language plpgsql security definer as $$
begin
  if new.rol is distinct from old.rol then
    -- auth.uid() NULL = service key del backend o SQL editor (no es un
    -- usuario final; a los anonimos ya los frena RLS antes de llegar aca).
    if auth.uid() is not null and not exists (
      select 1 from public.perfiles
      where id = auth.uid() and rol = 'admin'
    ) then
      raise exception 'No tenes permisos para cambiar el rol';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_cambio_rol on public.perfiles;
create trigger trg_bloquear_cambio_rol
  before update on public.perfiles
  for each row execute procedure public.bloquear_cambio_rol();

-- ============================================================
-- 3) Verificacion
-- ============================================================
-- a) El trigger de alta existe y es la version nueva (debe contener la whitelist)
select prosrc like '%whitelist%' or prosrc like '%not in%' as trigger_alta_actualizado
from pg_proc where proname = 'handle_new_user';

-- b) El trigger anti-escalacion existe
select tgname from pg_trigger
where tgname = 'trg_bloquear_cambio_rol';

-- c) Cuantos admin hay hoy (revisar que sean solo los esperados)
select id, nombre, rol, creado_en from public.perfiles where rol = 'admin';


-- >>>>>>>>>> 003_privacidad_cadetes.sql <<<<<<<<<<

-- YENDO â€” MIGRACION OFICIAL 003: PRIVACIDAD DE CADETES + ENTREGA ATOMICA
--
-- COPIAR Y PEGAR ESTE ARCHIVO COMPLETO EN:
-- Supabase Dashboard -> SQL Editor -> New query
--
-- REQUIERE: haber actualizado el frontend/backend a la version que consume
-- GET /api/cadetes/activos y GET /api/cadetes/:id/contacto (este repo ya
-- la incluye). Si corres esto con un frontend viejo, los comercios dejan
-- de ver la lista de cadetes (leian la tabla directo).
--
-- 1) PRIVACIDAD: la policy "cadete_disponibles" dejaba que CUALQUIER
--    usuario autenticado leyera la fila completa de los cadetes
--    disponibles: telefono, ganancias_hoy/semana/mes y GPS exacto.
--    Se elimina; ahora comercios y privados obtienen los datos operativos
--    via backend (service key), que devuelve solo columnas seguras y
--    valida que el telefono se entregue unicamente a quien tiene un
--    pedido activo con ese cadete.
--
-- 2) ATOMICIDAD: /entregar hacia read-then-write de las ganancias del
--    cadete (dos entregas simultaneas podian perder un incremento).
--    Se agrega una funcion SQL atomica que usa el backend.

-- ============================================================
-- 1) Quitar lectura publica de cadetes disponibles
-- ============================================================
drop policy if exists "cadete_disponibles" on public.cadetes;
-- Quedan vigentes: "cadete_own" (cada cadete ve lo suyo) y
-- "cadete_admin_all" (admin ve todo).

-- ============================================================
-- 2) Funcion atomica para cerrar una entrega
-- ============================================================
create or replace function public.incrementar_stats_entrega(
  p_cadete_id uuid,
  p_ganancia  numeric
) returns void
language sql security definer as $$
  update public.cadetes set
    estado            = 'disponible',
    ultima_entrega_en = now(),
    ganancias_hoy     = coalesce(ganancias_hoy, 0)    + p_ganancia,
    ganancias_semana  = coalesce(ganancias_semana, 0) + p_ganancia,
    ganancias_mes     = coalesce(ganancias_mes, 0)    + p_ganancia,
    viajes_hoy        = coalesce(viajes_hoy, 0)       + 1,
    viajes_semana     = coalesce(viajes_semana, 0)    + 1,
    viajes_mes        = coalesce(viajes_mes, 0)       + 1
  where id = p_cadete_id;
$$;

-- Solo el backend (service role) puede ejecutarla:
revoke execute on function public.incrementar_stats_entrega(uuid, numeric) from public;
revoke execute on function public.incrementar_stats_entrega(uuid, numeric) from anon;
revoke execute on function public.incrementar_stats_entrega(uuid, numeric) from authenticated;

-- ============================================================
-- 3) Verificacion
-- ============================================================
-- a) La policy vieja NO debe aparecer
select policyname from pg_policies
where schemaname = 'public' and tablename = 'cadetes'
order by policyname;

-- b) La funcion existe
select proname from pg_proc where proname = 'incrementar_stats_entrega';


-- >>>>>>>>>> 004_finanzas_propinas_recargos.sql <<<<<<<<<<

-- YENDO â€” MIGRACION OFICIAL 004: FINANZAS, PROPINAS Y RECARGOS
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


