-- YENDO — MIGRACION OFICIAL 003: PRIVACIDAD DE CADETES + ENTREGA ATOMICA
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
