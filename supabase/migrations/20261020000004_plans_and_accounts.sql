-- Plans and accounts: the platform team provisions a business with limits
-- (users, locations) and modules; the business admin creates its own users
-- inside those limits.

alter table public.organisations
  add column plan text not null default 'standard',
  add column max_users int not null default 10 check (max_users > 0),
  add column max_locations int not null default 5 check (max_locations > 0),
  add column active boolean not null default true;

-- Plan, limits, modules, mode and suspension are managed by platform admins only.
-- (Runs as the caller; SQL Editor / migrations have no auth.uid() and pass.)
create or replace function app.guard_org_update() returns trigger
language plpgsql as $$
begin
  if (new.plan, new.max_users, new.max_locations, new.active, new.modules, new.mode, new.kind)
       is distinct from (old.plan, old.max_users, old.max_locations, old.active, old.modules, old.mode, old.kind)
     and auth.uid() is not null and not app.is_platform_admin() then
    raise exception 'Plan, limits and modules are managed by the StockSetu team' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger organisations_guard before update on public.organisations
  for each row execute function app.guard_org_update();

-- Seat limit: counts members; updating an existing member's role never blocks.
create or replace function app.enforce_member_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_max int;
  v_count int;
begin
  if exists (select 1 from public.org_members where org_id = new.org_id and user_id = new.user_id) then
    return new;
  end if;
  select max_users into v_max from public.organisations where id = new.org_id for update;
  select count(*) into v_count from public.org_members where org_id = new.org_id;
  if v_count >= v_max then
    raise exception 'User limit reached (% of %). Ask StockSetu to upgrade your plan.', v_count, v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger org_members_limit before insert on public.org_members
  for each row execute function app.enforce_member_limit();

create or replace function app.enforce_location_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_max int;
  v_count int;
begin
  select max_locations into v_max from public.organisations where id = new.org_id for update;
  select count(*) into v_count from public.locations where org_id = new.org_id and not archived;
  if v_count >= v_max then
    raise exception 'Location limit reached (% of %). Ask StockSetu to upgrade your plan.', v_count, v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger locations_limit before insert on public.locations
  for each row execute function app.enforce_location_limit();

-- Platform admins manage any organisation's locations and write its audit trail.
drop policy locations_write on public.locations;
drop policy locations_update on public.locations;
create policy locations_write on public.locations for insert to authenticated
  with check (app.is_org_admin(org_id) or app.is_platform_admin());
create policy locations_update on public.locations for update to authenticated
  using (app.is_org_admin(org_id) or app.is_platform_admin())
  with check (app.is_org_admin(org_id) or app.is_platform_admin());
drop policy audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor = auth.uid() and (org_id is null or app.is_member(org_id) or app.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- Create a login for a team member (business admin, within the seat limit)
-- ---------------------------------------------------------------------------
create or replace function public.create_user_account(
  p_org uuid, p_email text, p_name text, p_password text, p_role public.member_role, p_locations uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_kind public.org_kind;
begin
  perform app.require(app.is_org_admin(p_org) or app.is_platform_admin(), 'Only an admin can create users');
  select kind into v_kind from public.organisations where id = p_org and active;
  perform app.require(v_kind is not null, 'Organisation not found or suspended');
  perform app.require(v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'Enter a valid email address');
  perform app.require(length(trim(coalesce(p_name, ''))) > 0, 'Enter the person''s name');
  perform app.require((v_kind = 'supplier') = (p_role in ('supplier_admin', 'supplier_staff')),
    'That role does not fit this type of organisation');
  perform app.require(
    p_locations is null or not exists (
      select 1 from unnest(p_locations) l where not exists (
        select 1 from public.locations x where x.id = l and x.org_id = p_org)),
    'Pick locations from this organisation');

  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    perform app.require(length(coalesce(p_password, '')) >= 8, 'Password must be at least 8 characters');
    v_user := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', trim(p_name)), now(), now(),
      '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user, v_user::text,
      jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  end if;

  insert into public.profiles (id, full_name, email) values (v_user, trim(p_name), v_email)
  on conflict (id) do update set full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end;

  insert into public.org_members (org_id, user_id, role, location_ids)
  values (p_org, v_user, p_role, nullif(p_locations, '{}'))
  on conflict (org_id, user_id) do update set role = excluded.role, location_ids = excluded.location_ids;

  perform app.audit(p_org, 'user.created', 'user', v_user, jsonb_build_object('email', v_email, 'role', p_role));
  return v_user;
end;
$$;

-- Reset a team member's password. An org admin may only reset people who belong
-- solely to organisations they administer (never platform admins).
create or replace function public.set_user_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  perform app.require(length(coalesce(p_password, '')) >= 8, 'Password must be at least 8 characters');
  if not app.is_platform_admin() then
    perform app.require(
      exists (select 1 from public.org_members where user_id = p_user)
      and not exists (select 1 from public.org_members where user_id = p_user and not app.is_org_admin(org_id))
      and not coalesce((select is_platform_admin from public.profiles where id = p_user), false),
      'You can only reset passwords for your own team');
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
    where id = p_user;
  select org_id into v_org from public.org_members where user_id = p_user limit 1;
  perform app.audit(v_org, 'user.password_reset', 'user', p_user, '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform: provision a business (or supplier) with its plan and first admin
-- ---------------------------------------------------------------------------
create or replace function public.platform_create_org(
  p_name text, p_mode public.org_mode, p_modules text[], p_plan text, p_max_users int, p_max_locations int,
  p_locations jsonb, p_admin_email text, p_admin_name text, p_admin_password text, p_city text, p_gstin text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_kind public.org_kind := case when p_mode = 'D' then 'supplier' else 'business' end;
  v_loc jsonb;
begin
  perform app.require(app.is_platform_admin(), 'Platform admins only');
  perform app.require(length(trim(coalesce(p_name, ''))) between 1 and 120, 'Enter a business name');
  perform app.require(jsonb_array_length(coalesce(p_locations, '[]')) between 1 and coalesce(p_max_locations, 5),
    'Add between 1 and the location limit');

  insert into public.organisations (name, kind, mode, modules, plan, max_users, max_locations, city, gstin, created_by)
  values (trim(p_name), v_kind, p_mode, p_modules, coalesce(nullif(trim(p_plan), ''), 'standard'),
    greatest(coalesce(p_max_users, 10), 1), greatest(coalesce(p_max_locations, 5), 1),
    nullif(trim(p_city), ''), nullif(upper(trim(p_gstin)), ''), auth.uid())
  returning id into v_org;

  for v_loc in select * from jsonb_array_elements(p_locations) loop
    insert into public.locations (org_id, name, kind)
    values (v_org, trim(v_loc ->> 'name'), (v_loc ->> 'kind')::public.location_kind);
  end loop;

  perform public.create_user_account(v_org, p_admin_email, p_admin_name, p_admin_password,
    case when v_kind = 'supplier' then 'supplier_admin' else 'admin' end::public.member_role, null);
  perform app.audit(v_org, 'platform.org_created', 'organisation', v_org,
    jsonb_build_object('plan', p_plan, 'max_users', p_max_users, 'max_locations', p_max_locations));
  return v_org;
end;
$$;

-- Platform: connect a supplier to a business so POs, shipments and khata flow
-- between them (adds each to the other's directory).
create or replace function public.platform_link_supplier(p_business uuid, p_supplier uuid, p_location uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_b public.organisations;
  v_s public.organisations;
begin
  perform app.require(app.is_platform_admin(), 'Platform admins only');
  select * into v_b from public.organisations where id = p_business and kind = 'business';
  select * into v_s from public.organisations where id = p_supplier and kind = 'supplier';
  perform app.require(v_b.id is not null and v_s.id is not null, 'Pick a business and a supplier');
  perform app.require(p_location is null or exists (select 1 from public.locations where id = p_location and org_id = p_business),
    'Delivery location must belong to the business');

  if not exists (select 1 from public.suppliers where org_id = p_business and linked_org_id = p_supplier) then
    insert into public.suppliers (org_id, name, phone, gstin, linked_org_id) values (p_business, v_s.name, v_s.phone, v_s.gstin, p_supplier);
  end if;
  if not exists (select 1 from public.customers where org_id = p_supplier and linked_org_id = p_business) then
    insert into public.customers (org_id, name, phone, gstin, linked_org_id, default_location_id)
    values (p_supplier, v_b.name, v_b.phone, v_b.gstin, p_business, p_location);
  end if;
  perform app.audit(p_business, 'platform.supplier_linked', 'organisation', p_supplier, jsonb_build_object('supplier', v_s.name));
end;
$$;

revoke all on function public.create_user_account, public.set_user_password, public.platform_create_org,
  public.platform_link_supplier from public, anon;
grant execute on function public.create_user_account, public.set_user_password, public.platform_create_org,
  public.platform_link_supplier to authenticated;
revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated;
