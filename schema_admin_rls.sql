-- Ejecutar este script UNA VEZ en el SQL Editor de Supabase
-- Agrega las políticas que le faltan al rol admin

-- Admin: acceso total a órdenes
create policy "orden_admin_all" on public.ordenes for all
  using (
    exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin')
  )
  with check (
    exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin')
  );

-- Admin: acceso total a cadetes
create policy "cadete_admin_all" on public.cadetes for all
  using (
    exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin')
  )
  with check (
    exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin')
  );

-- Admin: acceso total a comercios
create policy "comercio_admin_all" on public.comercios for all
  using (
    exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin')
  )
  with check (
    exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin')
  );

-- Admin: ver todos los perfiles
create policy "perfil_admin_select" on public.perfiles for select
  using (
    exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'admin')
  );
