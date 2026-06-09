-- ============================================================
-- FIX PILOTO — correr UNA vez en el SQL Editor de Supabase
-- ============================================================

-- 1) BUG CRÍTICO: el cadete no podía ACEPTAR pedidos pendientes.
--    La política vieja solo permitía editar pedidos que ya eran suyos.
--    Esta nueva permite tomar un pendiente o actualizar uno propio.
drop policy if exists "orden_cadete_update" on public.ordenes;
create policy "orden_cadete_update" on public.ordenes for update
  using (estado = 'pendiente' or cadete_id = auth.uid())
  with check (cadete_id = auth.uid());

-- 2) Columna 'plan' para la suscripción de comercios (diario/mensual/anual)
alter table public.comercios add column if not exists plan text default 'sin_plan';
