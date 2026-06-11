-- YENDO — MIGRACION OFICIAL 002: SEGURIDAD DE ROLES
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
