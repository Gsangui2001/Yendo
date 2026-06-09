-- PASO 1: Borrar todo lo anterior
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.ordenes cascade;
drop table if exists public.clientes cascade;
drop table if exists public.direcciones cascade;
drop table if exists public.comercios cascade;
drop table if exists public.cadetes cascade;
drop table if exists public.perfiles cascade;

-- PASO 2: Crear tablas limpias

create table public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text,
  telefono   text,
  rol        text not null default 'privado' check (rol in ('comercio','cadete','privado','admin')),
  creado_en  timestamptz default now()
);
alter table public.perfiles enable row level security;
create policy "perfil_select" on public.perfiles for select using (auth.uid() = id);
create policy "perfil_update" on public.perfiles for update using (auth.uid() = id);
create policy "perfil_insert" on public.perfiles for insert with check (auth.uid() = id);

create table public.comercios (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references auth.users(id) on delete cascade,
  nombre     text not null,
  direccion  text,
  telefono   text,
  activo     boolean default true,
  creado_en  timestamptz default now()
);
alter table public.comercios enable row level security;
create policy "comercio_all" on public.comercios for all using (owner_id = auth.uid());

create table public.clientes (
  id          uuid primary key default gen_random_uuid(),
  comercio_id uuid references public.comercios(id) on delete cascade,
  nombre      text not null,
  telefono    text,
  direccion   text,
  zona        text,
  veces_usado int default 0,
  creado_en   timestamptz default now()
);
alter table public.clientes enable row level security;
create policy "clientes_all" on public.clientes for all using (
  comercio_id in (select id from public.comercios where owner_id = auth.uid())
);

create table public.cadetes (
  id               uuid primary key references auth.users(id) on delete cascade,
  nombre           text not null,
  telefono         text,
  zona             text default 'ciudad_colon',
  estado           text default 'offline' check (estado in ('disponible','en_viaje','offline')),
  ubicacion_lat    double precision,
  ubicacion_lng    double precision,
  viajes_hoy       int default 0,
  viajes_semana    int default 0,
  viajes_mes       int default 0,
  ganancias_hoy    numeric(12,2) default 0,
  ganancias_semana numeric(12,2) default 0,
  ganancias_mes    numeric(12,2) default 0,
  jornada_inicio   timestamptz,
  activo           boolean default true,
  creado_en        timestamptz default now()
);
alter table public.cadetes enable row level security;
create policy "cadete_own"        on public.cadetes for all    using (id = auth.uid());
create policy "cadete_disponibles" on public.cadetes for select using (estado = 'disponible');

create table public.direcciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete cascade,
  nombre     text not null,
  direccion  text not null,
  creado_en  timestamptz default now()
);
alter table public.direcciones enable row level security;
create policy "dir_all" on public.direcciones for all using (usuario_id = auth.uid());

create table public.ordenes (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('comercio','particular')),
  prioridad      text default 'baja' check (prioridad in ('alta','baja')),
  estado         text default 'pendiente' check (estado in ('pendiente','asignada','en_camino','entregada','cancelada')),
  comercio_id    uuid references public.comercios(id),
  cliente_id     uuid references public.clientes(id),
  cliente_nombre text,
  direccion      text,
  zona           text,
  zona_label     text,
  precio         numeric(12,2),
  solicitante_id uuid references auth.users(id),
  descripcion    text,
  origen         text,
  destino        text,
  metodo_pago    text,
  cadete_id      uuid references public.cadetes(id),
  asignada_en    timestamptz,
  entregada_en   timestamptz,
  creado_en      timestamptz default now()
);
alter table public.ordenes enable row level security;
create policy "orden_comercio_select" on public.ordenes for select using (
  comercio_id in (select id from public.comercios where owner_id = auth.uid())
);
create policy "orden_comercio_insert" on public.ordenes for insert with check (
  comercio_id in (select id from public.comercios where owner_id = auth.uid())
);
create policy "orden_privado_select" on public.ordenes for select using (solicitante_id = auth.uid());
create policy "orden_privado_insert" on public.ordenes for insert with check (solicitante_id = auth.uid());
create policy "orden_cadete_select"  on public.ordenes for select using (
  estado = 'pendiente' or cadete_id = auth.uid()
);
create policy "orden_cadete_update"  on public.ordenes for update using (cadete_id = auth.uid());

-- PASO 3: Realtime
alter publication supabase_realtime add table public.ordenes;
alter publication supabase_realtime add table public.cadetes;

-- PASO 4: Trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_rol    text;
  v_nombre text;
begin
  v_rol    := coalesce(new.raw_user_meta_data->>'perfil', 'privado');
  v_nombre := coalesce(new.raw_user_meta_data->>'nombre', new.email);

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- PASO 5: Políticas admin
create policy "orden_admin_all" on public.ordenes for all
  using (exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin'));

create policy "cadete_admin_all" on public.cadetes for all
  using (exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin'));

create policy "comercio_admin_all" on public.comercios for all
  using (exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin'));

create policy "perfil_admin_select" on public.perfiles for select
  using (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'admin'));
