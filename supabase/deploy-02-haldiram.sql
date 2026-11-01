-- StockSetu upgrade: plans/limits/accounts + Haldiram demo. Paste into SQL Editor → Run.

-- ===== supabase/migrations/20261020000004_plans_and_accounts.sql =====
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

-- ===== supabase/seed_haldiram.sql =====
-- Demo business "Haldiram": 1 central warehouse, 2 outlets, 3 suppliers on the
-- platform (each with its own login) and 1 off-platform supplier.
-- Every demo password: Demo@1234. Requires the base seed (shared catalogue + admin@).

create or replace function pg_temp.u(p_email text, p_name text)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is not null then return v_id; end if;
  v_id := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('Demo@1234', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name), now(), now(),
    '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
  update public.profiles set full_name = p_name where id = v_id;
  return v_id;
end;
$$;

create or replace function pg_temp.add(p_item text, p_hi text, p_cat text, p_unit public.base_unit,
  p_product text, p_brand text, p_pack bigint, p_label text, p_cost bigint, p_gst int, p_hsn text, p_code text)
returns uuid language plpgsql as $$
declare v_item uuid; v_product uuid;
begin
  select product_id into v_product from public.barcodes where code = p_code;
  if v_product is not null then return v_product; end if;
  select id into v_item from public.items where org_id is null and lower(name) = lower(p_item);
  if v_item is null then
    insert into public.items (name, name_hi, category, base_unit) values (p_item, p_hi, p_cat, p_unit) returning id into v_item;
  end if;
  insert into public.products (item_id, name, brand, pack_qty, pack_label, cost_paise, gst_bp, hsn)
  values (v_item, p_product, p_brand, p_pack, p_label, p_cost, p_gst, p_hsn) returning id into v_product;
  insert into public.barcodes (code, product_id) values (p_code, v_product);
  return v_product;
end;
$$;

create or replace function pg_temp.p(p_code text) returns uuid language sql as $$
  select product_id from public.barcodes where code = p_code;
$$;

create or replace function pg_temp.item(p_name text) returns uuid language sql as $$
  select id from public.items where org_id is null and name = p_name;
$$;

create or replace function pg_temp.mv(p_loc uuid, p_code text, p_packs numeric, p_reason text, p_at timestamptz,
  p_ref_type text default null, p_ref uuid default null, p_actor uuid default null)
returns void language plpgsql as $$
declare v_prod public.products;
begin
  select * into v_prod from public.products where id = pg_temp.p(p_code);
  insert into public.stock_movements (org_id, location_id, product_id, qty_base, reason, unit_cost_paise, ref_type, ref_id, actor, occurred_at)
  values ((select org_id from public.locations where id = p_loc), p_loc, v_prod.id, round(p_packs * v_prod.pack_qty)::bigint,
    p_reason, v_prod.cost_paise, p_ref_type, p_ref, p_actor, p_at);
end;
$$;

create or replace function pg_temp.used(p_loc uuid, p_code text, p_base bigint, p_at timestamptz, p_count uuid, p_actor uuid)
returns void language plpgsql as $$
begin
  insert into public.stock_movements (org_id, location_id, product_id, qty_base, reason, unit_cost_paise, ref_type, ref_id, actor, occurred_at)
  select l.org_id, p_loc, p.id, -p_base, 'count', p.cost_paise, 'count', p_count, p_actor, p_at
  from public.locations l, public.products p where l.id = p_loc and p.id = pg_temp.p(p_code);
end;
$$;

do $$
declare
  u_admin uuid; u_wh uuid; u_cp uuid; u_noida uuid; u_staff uuid;
  u_agarwal uuid; u_agarwal_staff uuid; u_spice uuid; u_annapurna uuid;
  o_h uuid; o_agarwal uuid; o_spice uuid; o_annapurna uuid;
  l_wh uuid; l_cp uuid; l_noida uuid; l_agarwal uuid; l_annapurna uuid;
  s_agarwal uuid; s_spice uuid; s_annapurna uuid; s_fresh uuid;
  c_agarwal uuid; c_spice uuid; c_annapurna uuid; c_sweets uuid;
  v_po uuid; v_ship uuid; v_rec uuid; v_trf uuid; v_count uuid;
  r_cb uuid; r_rk uuid; r_pt uuid; r_mc uuid;
  d int;
  t0 timestamptz := date_trunc('day', now()) - interval '8 days';
  t_count timestamptz := date_trunc('day', now()) + interval '3 hours';
begin
  if exists (select 1 from public.organisations where name = 'Haldiram') then
    raise notice 'Haldiram demo already exists — skipping';
    return;
  end if;

  -- Extra catalogue items for a north-Indian snacks menu
  perform pg_temp.add('Kabuli Chana', 'काबुली चना', 'Pulses', 'g', 'Kabuli Chana 1 kg', null, 1000, '1 kg', 13000, 500, '0713', '2000000000233');
  perform pg_temp.add('Besan', 'बेसन', 'Grains', 'g', 'Besan 1 kg', null, 1000, '1 kg', 9000, 500, '1106', '2000000000240');
  perform pg_temp.add('Potato', 'आलू', 'Vegetables', 'g', 'Potato (loose) 1 kg', null, 1000, '1 kg', 2500, 0, '0701', '2000000000257');
  perform pg_temp.add('Curd', 'दही', 'Dairy', 'g', 'Amul Masti Dahi 1 kg', 'Amul', 1000, '1 kg', 9800, 500, '0403', '2000000000264');
  perform pg_temp.add('Chaat Masala', 'चाट मसाला', 'Spices', 'g', 'MDH Chaat Masala 100 g', 'MDH', 100, '100 g', 6800, 500, '0910', '2000000000271');

  -- Users
  u_admin         := pg_temp.u('haldiram.admin@stocksetu.demo', 'Manish Gupta (Owner)');
  u_wh            := pg_temp.u('haldiram.warehouse@stocksetu.demo', 'Suresh (Warehouse)');
  u_cp            := pg_temp.u('haldiram.cp@stocksetu.demo', 'Priya (CP Outlet)');
  u_noida         := pg_temp.u('haldiram.noida@stocksetu.demo', 'Aman (Noida Outlet)');
  u_staff         := pg_temp.u('haldiram.staff@stocksetu.demo', 'Ravi (CP Staff)');
  u_agarwal       := pg_temp.u('agarwal@stocksetu.demo', 'Rajesh Agarwal');
  u_agarwal_staff := pg_temp.u('agarwal.staff@stocksetu.demo', 'Deepak (Agarwal Dairy)');
  u_spice         := pg_temp.u('delhispice@stocksetu.demo', 'Imran (Delhi Spice Traders)');
  u_annapurna     := pg_temp.u('annapurna@stocksetu.demo', 'Kavita Jain (Annapurna Grains)');

  -- Organisations (Haldiram: business plan, all business modules)
  insert into public.organisations (name, kind, mode, modules, plan, max_users, max_locations, gstin, phone, city, created_by)
  values ('Haldiram', 'business', 'C', array['inventory', 'transfers', 'procurement', 'food_cost'], 'business', 15, 5,
    '07AAACH1234R1Z9', '9810000001', 'New Delhi', u_admin) returning id into o_h;
  insert into public.organisations (name, kind, mode, modules, plan, max_users, max_locations, gstin, phone, city, created_by)
  values ('Agarwal Dairy', 'supplier', 'D', array['supplier', 'khata', 'supplier_inventory'], 'supplier', 5, 2,
    '07AAFFA2345D1Z3', '9810000011', 'Ghaziabad', u_agarwal) returning id into o_agarwal;
  insert into public.organisations (name, kind, mode, modules, plan, max_users, max_locations, gstin, phone, city, created_by)
  values ('Delhi Spice Traders', 'supplier', 'D', array['supplier', 'khata'], 'supplier', 3, 1,
    '07AAEFD3456S1Z7', '9810000012', 'Khari Baoli, Delhi', u_spice) returning id into o_spice;
  insert into public.organisations (name, kind, mode, modules, plan, max_users, max_locations, gstin, phone, city, created_by)
  values ('Annapurna Grains', 'supplier', 'D', array['supplier', 'khata', 'supplier_inventory'], 'supplier', 5, 2,
    '07AAGFA4567G1Z1', '9810000013', 'Narela, Delhi', u_annapurna) returning id into o_annapurna;

  insert into public.locations (org_id, name, kind) values (o_h, 'Central Warehouse Okhla', 'warehouse') returning id into l_wh;
  insert into public.locations (org_id, name, kind) values (o_h, 'Outlet Connaught Place', 'outlet') returning id into l_cp;
  insert into public.locations (org_id, name, kind) values (o_h, 'Outlet Noida Sector 18', 'outlet') returning id into l_noida;
  insert into public.locations (org_id, name, kind) values (o_agarwal, 'Agarwal Dairy Plant', 'warehouse') returning id into l_agarwal;
  insert into public.locations (org_id, name, kind) values (o_annapurna, 'Annapurna Godown', 'warehouse') returning id into l_annapurna;

  insert into public.org_members (org_id, user_id, role, location_ids) values
    (o_h, u_admin, 'admin', null),
    (o_h, u_wh, 'warehouse', array[l_wh]),
    (o_h, u_cp, 'outlet', array[l_cp]),
    (o_h, u_noida, 'outlet', array[l_noida]),
    (o_h, u_staff, 'staff', array[l_cp]),
    (o_agarwal, u_agarwal, 'supplier_admin', null),
    (o_agarwal, u_agarwal_staff, 'supplier_staff', null),
    (o_spice, u_spice, 'supplier_admin', null),
    (o_annapurna, u_annapurna, 'supplier_admin', null);

  -- Supplier directory (Haldiram's view) and customer lists (suppliers' view)
  insert into public.suppliers (org_id, name, phone, gstin, linked_org_id) values
    (o_h, 'Agarwal Dairy', '9810000011', '07AAFFA2345D1Z3', o_agarwal) returning id into s_agarwal;
  insert into public.suppliers (org_id, name, phone, gstin, linked_org_id) values
    (o_h, 'Delhi Spice Traders', '9810000012', '07AAEFD3456S1Z7', o_spice) returning id into s_spice;
  insert into public.suppliers (org_id, name, phone, gstin, linked_org_id) values
    (o_h, 'Annapurna Grains', '9810000013', '07AAGFA4567G1Z1', o_annapurna) returning id into s_annapurna;
  insert into public.suppliers (org_id, name, phone) values
    (o_h, 'Fresh Farms Mandi (Azadpur)', '9810000014') returning id into s_fresh;

  insert into public.customers (org_id, name, phone, gstin, linked_org_id, default_location_id) values
    (o_agarwal, 'Haldiram', '9810000001', '07AAACH1234R1Z9', o_h, l_wh) returning id into c_agarwal;
  insert into public.customers (org_id, name, phone) values
    (o_agarwal, 'Sweets Corner (Laxmi Nagar)', '9810000099') returning id into c_sweets;
  insert into public.customers (org_id, name, phone, gstin, linked_org_id, default_location_id) values
    (o_spice, 'Haldiram', '9810000001', '07AAACH1234R1Z9', o_h, l_wh) returning id into c_spice;
  insert into public.customers (org_id, name, phone, gstin, linked_org_id, default_location_id) values
    (o_annapurna, 'Haldiram', '9810000001', '07AAACH1234R1Z9', o_h, l_wh) returning id into c_annapurna;

  -- Opening stock: suppliers
  perform pg_temp.mv(l_agarwal, '2000000000097', 400, 'opening', t0, null, null, u_agarwal);
  perform pg_temp.mv(l_agarwal, '2000000000080', 150, 'opening', t0, null, null, u_agarwal);
  perform pg_temp.mv(l_agarwal, '2000000000073', 100, 'opening', t0, null, null, u_agarwal);
  perform pg_temp.mv(l_agarwal, '2000000000066', 60, 'opening', t0, null, null, u_agarwal);
  perform pg_temp.mv(l_agarwal, '2000000000103', 50, 'opening', t0, null, null, u_agarwal);
  perform pg_temp.mv(l_agarwal, '2000000000264', 200, 'opening', t0, null, null, u_agarwal);
  perform pg_temp.mv(l_annapurna, '2000000000011', 300, 'opening', t0, null, null, u_annapurna);
  perform pg_temp.mv(l_annapurna, '2000000000233', 300, 'opening', t0, null, null, u_annapurna);
  perform pg_temp.mv(l_annapurna, '2000000000240', 200, 'opening', t0, null, null, u_annapurna);
  perform pg_temp.mv(l_annapurna, '2000000000042', 400, 'opening', t0, null, null, u_annapurna);
  perform pg_temp.mv(l_annapurna, '2000000000028', 100, 'opening', t0, null, null, u_annapurna);
  perform pg_temp.mv(l_annapurna, '2000000000035', 100, 'opening', t0, null, null, u_annapurna);
  perform pg_temp.mv(l_annapurna, '2000000000059', 300, 'opening', t0, null, null, u_annapurna);

  -- Opening stock: Haldiram warehouse and outlets
  perform pg_temp.mv(l_wh, '2000000000011', 40, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000233', 30, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000240', 25, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000042', 40, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000028', 20, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000059', 40, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000066', 15, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000080', 30, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000073', 12, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000172', 40, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000165', 30, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000189', 20, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000141', 25, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000127', 25, 'opening', t0, null, null, u_wh);
  perform pg_temp.mv(l_wh, '2000000000271', 15, 'opening', t0, null, null, u_wh);

  perform pg_temp.mv(l_cp, '2000000000233', 20, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000042', 30, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000059', 30, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000202', 15, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000219', 15, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000141', 12, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000165', 3, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000264', 26, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000257', 15, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000271', 8, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000127', 5, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000080', 20, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000097', 75, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000189', 7, 'opening', t0, null, null, u_cp);
  perform pg_temp.mv(l_cp, '2000000000172', 7, 'opening', t0, null, null, u_cp);

  perform pg_temp.mv(l_noida, '2000000000233', 6, 'opening', t0, null, null, u_noida);
  perform pg_temp.mv(l_noida, '2000000000042', 15, 'opening', t0, null, null, u_noida);
  perform pg_temp.mv(l_noida, '2000000000059', 10, 'opening', t0, null, null, u_noida);
  perform pg_temp.mv(l_noida, '2000000000080', 4, 'opening', t0, null, null, u_noida);
  perform pg_temp.mv(l_noida, '2000000000264', 10, 'opening', t0, null, null, u_noida);
  perform pg_temp.mv(l_noida, '2000000000097', 40, 'opening', t0, null, null, u_noida);
  perform pg_temp.mv(l_noida, '2000000000189', 4, 'opening', t0, null, null, u_noida);
  perform pg_temp.mv(l_noida, '2000000000172', 4, 'opening', t0, null, null, u_noida);

  -- PO-0001 Annapurna Grains: delivered and received in full last week
  insert into public.purchase_orders (number, buyer_org_id, supplier_id, supplier_org_id, location_id, status, created_by, sent_at, responded_at, note)
  values ('PO-0001', o_h, s_annapurna, o_annapurna, l_wh, 'received', u_wh, t0 + interval '1 day', t0 + interval '1 day 2 hours', 'Weekly dry stock')
  returning id into v_po;
  insert into public.po_lines (po_id, product_id, product_name, pack_label, qty_packs, rate_paise, gst_bp, qty_accepted, qty_dispatched, qty_received)
  select v_po, p.id, p.name, p.pack_label, x.q, x.r, p.gst_bp, x.q, x.q, x.q
  from (values ('2000000000233', 60, 13000), ('2000000000042', 100, 4400), ('2000000000059', 60, 15200)) x(code, q, r)
  join public.products p on p.id = pg_temp.p(x.code);
  insert into public.shipments (code, invoice_number, supplier_org_id, customer_id, buyer_org_id, buyer_location_id, from_location_id,
    po_id, status, dispatched_by, dispatched_at, received_at)
  values ('SHP-HAN001', 'INV-2610-0001', o_annapurna, c_annapurna, o_h, l_wh, l_annapurna, v_po, 'received', u_annapurna,
    t0 + interval '2 days', t0 + interval '2 days 4 hours') returning id into v_ship;
  insert into public.shipment_lines (shipment_id, po_line_id, product_id, product_name, pack_label, hsn, qty_packs, rate_paise, gst_bp, qty_received)
  select v_ship, l.id, l.product_id, l.product_name, l.pack_label, p.hsn, l.qty_packs, l.rate_paise, l.gst_bp, l.qty_packs
  from public.po_lines l join public.products p on p.id = l.product_id where l.po_id = v_po;
  perform pg_temp.mv(l_annapurna, '2000000000233', -60, 'dispatch', t0 + interval '2 days', 'shipment', v_ship, u_annapurna);
  perform pg_temp.mv(l_annapurna, '2000000000042', -100, 'dispatch', t0 + interval '2 days', 'shipment', v_ship, u_annapurna);
  perform pg_temp.mv(l_annapurna, '2000000000059', -60, 'dispatch', t0 + interval '2 days', 'shipment', v_ship, u_annapurna);
  insert into public.goods_receipts (org_id, location_id, po_id, shipment_id, supplier_name, bill_number, received_by, received_at)
  values (o_h, l_wh, v_po, v_ship, 'Annapurna Grains', 'INV-2610-0001', u_wh, t0 + interval '2 days 4 hours') returning id into v_rec;
  insert into public.receipt_lines (receipt_id, product_id, expected_packs, received_packs, accepted_packs, resolution, rate_paise)
  select v_rec, product_id, qty_packs, qty_packs, qty_packs, 'matched', rate_paise from public.shipment_lines where shipment_id = v_ship;
  perform pg_temp.mv(l_wh, '2000000000233', 60, 'receipt', t0 + interval '2 days 4 hours', 'goods_receipt', v_rec, u_wh);
  perform pg_temp.mv(l_wh, '2000000000042', 100, 'receipt', t0 + interval '2 days 4 hours', 'goods_receipt', v_rec, u_wh);
  perform pg_temp.mv(l_wh, '2000000000059', 60, 'receipt', t0 + interval '2 days 4 hours', 'goods_receipt', v_rec, u_wh);
  insert into public.product_costs (org_id, product_id, cost_paise) values
    (o_h, pg_temp.p('2000000000233'), 13000), (o_h, pg_temp.p('2000000000042'), 4400), (o_h, pg_temp.p('2000000000059'), 15200);
  insert into public.khata_entries (supplier_org_id, customer_id, kind, amount_paise, ref_type, ref_id, note, created_by, created_at) values
    (o_annapurna, c_annapurna, 'debit', 2238600, 'shipment', v_ship, 'Invoice INV-2610-0001', u_annapurna, t0 + interval '2 days'),
    (o_annapurna, c_annapurna, 'credit', 1500000, null, null, 'NEFT — part payment', u_annapurna, t0 + interval '6 days');

  -- PO-0002 Delhi Spice Traders: accepted (chaat masala part-filled) and on the way
  insert into public.purchase_orders (number, buyer_org_id, supplier_id, supplier_org_id, location_id, status, created_by, sent_at, responded_at,
    expected_date, note, supplier_note)
  values ('PO-0002', o_h, s_spice, o_spice, l_wh, 'dispatched', u_wh, now() - interval '1 day', now() - interval '20 hours',
    current_date, 'Masala for the week', 'Chaat masala only 20 in stock') returning id into v_po;
  insert into public.po_lines (po_id, product_id, product_name, pack_label, qty_packs, rate_paise, gst_bp, qty_accepted, qty_dispatched)
  select v_po, p.id, p.name, p.pack_label, x.q, x.r, p.gst_bp, x.a, x.a
  from (values ('2000000000141', 30, 8200, 30), ('2000000000127', 40, 8600, 40), ('2000000000271', 30, 6500, 20), ('2000000000165', 50, 2600, 50)) x(code, q, r, a)
  join public.products p on p.id = pg_temp.p(x.code);
  insert into public.shipments (code, invoice_number, supplier_org_id, customer_id, buyer_org_id, buyer_location_id, po_id, status, dispatched_by, dispatched_at, note)
  values ('SHP-HDS001', 'INV-2610-0001', o_spice, c_spice, o_h, l_wh, v_po, 'in_transit', u_spice, now() - interval '4 hours', 'Tempo DL1L 4521')
  returning id into v_ship;
  insert into public.shipment_lines (shipment_id, po_line_id, product_id, product_name, pack_label, hsn, qty_packs, rate_paise, gst_bp)
  select v_ship, l.id, l.product_id, l.product_name, l.pack_label, p.hsn, l.qty_accepted, l.rate_paise, l.gst_bp
  from public.po_lines l join public.products p on p.id = l.product_id where l.po_id = v_po;
  insert into public.khata_entries (supplier_org_id, customer_id, kind, amount_paise, ref_type, ref_id, note, created_by, created_at) values
    (o_spice, c_spice, 'debit', 886000, 'shipment', v_ship, 'Invoice INV-2610-0001', u_spice, now() - interval '4 hours');

  -- PO-0003 Agarwal Dairy: sent, waiting for the dairy to answer in its inbox
  insert into public.purchase_orders (number, buyer_org_id, supplier_id, supplier_org_id, location_id, status, created_by, sent_at, expected_date, note)
  values ('PO-0003', o_h, s_agarwal, o_agarwal, l_wh, 'sent', u_admin, now() - interval '40 minutes', current_date + 1, 'Weekend dairy')
  returning id into v_po;
  insert into public.po_lines (po_id, product_id, product_name, pack_label, qty_packs, rate_paise, gst_bp)
  select v_po, p.id, p.name, p.pack_label, x.q, x.r, p.gst_bp
  from (values ('2000000000080', 40, 41000), ('2000000000073', 20, 28000), ('2000000000264', 30, 9500), ('2000000000097', 100, 6600)) x(code, q, r)
  join public.products p on p.id = pg_temp.p(x.code);

  -- PO-0004 Fresh Farms Mandi: off-platform, sent on WhatsApp
  insert into public.purchase_orders (number, buyer_org_id, supplier_id, location_id, status, created_by, sent_at, expected_date, note)
  values ('PO-0004', o_h, s_fresh, l_wh, 'sent', u_wh, now() - interval '2 hours', current_date, 'Morning mandi run')
  returning id into v_po;
  insert into public.po_lines (po_id, product_id, product_name, pack_label, qty_packs, rate_paise, gst_bp)
  select v_po, p.id, p.name, p.pack_label, x.q, x.r, p.gst_bp
  from (values ('2000000000202', 50, 3000), ('2000000000219', 50, 2800), ('2000000000257', 60, 2400)) x(code, q, r)
  join public.products p on p.id = pg_temp.p(x.code);

  -- Supplier-side history with other customers
  insert into public.khata_entries (supplier_org_id, customer_id, kind, amount_paise, note, created_by, created_at) values
    (o_agarwal, c_agarwal, 'debit', 3120000, 'Opening balance', u_agarwal, t0),
    (o_agarwal, c_agarwal, 'credit', 2000000, 'UPI', u_agarwal, t0 + interval '4 days'),
    (o_agarwal, c_sweets, 'debit', 845000, 'Opening balance', u_agarwal, t0);

  -- Transfers: one received last week, one on the way to CP, one requested by Noida
  insert into public.transfers (org_id, code, from_location_id, to_location_id, status, created_by, dispatched_by, dispatched_at, received_by, received_at, note)
  values (o_h, 'TRF-HCP000', l_wh, l_cp, 'received', u_wh, u_wh, t0 + interval '3 days', u_cp, t0 + interval '3 days 2 hours', 'Weekly top-up')
  returning id into v_trf;
  insert into public.transfer_lines (transfer_id, product_id, qty_packs, qty_received)
  values (v_trf, pg_temp.p('2000000000233'), 15, 15), (v_trf, pg_temp.p('2000000000042'), 20, 20);
  perform pg_temp.mv(l_wh, '2000000000233', -15, 'transfer_out', t0 + interval '3 days', 'transfer', v_trf, u_wh);
  perform pg_temp.mv(l_wh, '2000000000042', -20, 'transfer_out', t0 + interval '3 days', 'transfer', v_trf, u_wh);
  perform pg_temp.mv(l_cp, '2000000000233', 15, 'transfer_in', t0 + interval '3 days 2 hours', 'transfer', v_trf, u_cp);
  perform pg_temp.mv(l_cp, '2000000000042', 20, 'transfer_in', t0 + interval '3 days 2 hours', 'transfer', v_trf, u_cp);

  insert into public.transfers (org_id, code, from_location_id, to_location_id, status, created_by, dispatched_by, dispatched_at, note)
  values (o_h, 'TRF-HCP001', l_wh, l_cp, 'in_transit', u_wh, u_wh, now() - interval '90 minutes', 'Evening rush stock')
  returning id into v_trf;
  insert into public.transfer_lines (transfer_id, product_id, qty_packs)
  values (v_trf, pg_temp.p('2000000000233'), 10), (v_trf, pg_temp.p('2000000000042'), 20),
         (v_trf, pg_temp.p('2000000000059'), 12), (v_trf, pg_temp.p('2000000000080'), 8);
  perform pg_temp.mv(l_wh, '2000000000233', -10, 'transfer_out', now() - interval '90 minutes', 'transfer', v_trf, u_wh);
  perform pg_temp.mv(l_wh, '2000000000042', -20, 'transfer_out', now() - interval '90 minutes', 'transfer', v_trf, u_wh);
  perform pg_temp.mv(l_wh, '2000000000059', -12, 'transfer_out', now() - interval '90 minutes', 'transfer', v_trf, u_wh);
  perform pg_temp.mv(l_wh, '2000000000080', -8, 'transfer_out', now() - interval '90 minutes', 'transfer', v_trf, u_wh);

  insert into public.transfers (org_id, code, from_location_id, to_location_id, status, created_by, note)
  values (o_h, 'TRF-HNO002', l_wh, l_noida, 'requested', u_noida, 'Chana and besan running low')
  returning id into v_trf;
  insert into public.transfer_lines (transfer_id, product_id, qty_packs)
  values (v_trf, pg_temp.p('2000000000233'), 8), (v_trf, pg_temp.p('2000000000240'), 5), (v_trf, pg_temp.p('2000000000059'), 6);

  -- Minimum levels (projected stock below these raises a reorder alert)
  insert into public.min_levels (org_id, location_id, product_id, min_packs, reorder_packs) values
    (o_h, l_wh, pg_temp.p('2000000000080'), 40, 40),
    (o_h, l_wh, pg_temp.p('2000000000073'), 25, 20),
    (o_h, l_wh, pg_temp.p('2000000000233'), 50, 60),
    (o_h, l_wh, pg_temp.p('2000000000202'), 30, 50),
    (o_h, l_cp, pg_temp.p('2000000000080'), 10, 8),
    (o_h, l_cp, pg_temp.p('2000000000059'), 15, 12),
    (o_h, l_noida, pg_temp.p('2000000000233'), 10, 8),
    (o_h, l_noida, pg_temp.p('2000000000080'), 6, 5);

  -- Menu
  insert into public.recipes (org_id, name, sell_price_paise) values (o_h, 'Chole Bhature', 24000) returning id into r_cb;
  insert into public.recipes (org_id, name, sell_price_paise) values (o_h, 'Raj Kachori', 18000) returning id into r_rk;
  insert into public.recipes (org_id, name, sell_price_paise) values (o_h, 'Paneer Tikka', 32000) returning id into r_pt;
  insert into public.recipes (org_id, name, sell_price_paise) values (o_h, 'Masala Chai', 6000) returning id into r_mc;
  insert into public.recipe_lines (recipe_id, item_id, qty_base)
  select r_cb, pg_temp.item(x.n), x.q from (values ('Kabuli Chana', 100), ('Maida', 120), ('Refined Oil', 60), ('Onion', 40),
    ('Tomato', 40), ('Garam Masala', 3), ('Salt', 4)) x(n, q);
  insert into public.recipe_lines (recipe_id, item_id, qty_base)
  select r_rk, pg_temp.item(x.n), x.q from (values ('Maida', 40), ('Curd', 80), ('Potato', 60), ('Chaat Masala', 3),
    ('Red Chilli Powder', 2), ('Refined Oil', 25), ('Salt', 2)) x(n, q);
  insert into public.recipe_lines (recipe_id, item_id, qty_base)
  select r_pt, pg_temp.item(x.n), x.q from (values ('Paneer', 150), ('Curd', 50), ('Refined Oil', 15), ('Red Chilli Powder', 3),
    ('Garam Masala', 2), ('Salt', 3)) x(n, q);
  insert into public.recipe_lines (recipe_id, item_id, qty_base)
  select r_mc, pg_temp.item(x.n), x.q from (values ('Milk', 120), ('Tea Leaves', 5), ('Sugar', 10)) x(n, q);

  -- A week of sales at both outlets
  for d in 1..7 loop
    insert into public.sales (org_id, location_id, sale_date, recipe_id, qty, created_by) values
      (o_h, l_cp, (t0 + make_interval(days => d))::date, r_cb, 40, u_cp),
      (o_h, l_cp, (t0 + make_interval(days => d))::date, r_rk, 30, u_cp),
      (o_h, l_cp, (t0 + make_interval(days => d))::date, r_pt, 15, u_cp),
      (o_h, l_cp, (t0 + make_interval(days => d))::date, r_mc, 80, u_cp),
      (o_h, l_noida, (t0 + make_interval(days => d))::date, r_cb, 25, u_noida),
      (o_h, l_noida, (t0 + make_interval(days => d))::date, r_rk, 20, u_noida),
      (o_h, l_noida, (t0 + make_interval(days => d))::date, r_pt, 10, u_noida),
      (o_h, l_noida, (t0 + make_interval(days => d))::date, r_mc, 60, u_noida);
  end loop;

  -- Recorded wastage at CP
  perform pg_temp.mv(l_cp, '2000000000097', -2, 'wastage', t0 + interval '4 days', null, null, u_staff);
  perform pg_temp.mv(l_cp, '2000000000080', -0.5, 'wastage', t0 + interval '5 days', null, null, u_staff);

  -- This morning's count at CP: usage = theoretical + leaks (oil and paneer stand out)
  insert into public.counts (org_id, location_id, status, started_by, completed_by, started_at, completed_at)
  values (o_h, l_cp, 'completed', u_cp, u_cp, t_count - interval '12 minutes', t_count) returning id into v_count;
  perform pg_temp.used(l_cp, '2000000000233', 28400, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000042', 42500, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000059', 25800, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000202', 11500, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000219', 11300, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000141', 1080, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000165', 1900, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000264', 22300, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000257', 12900, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000271', 650, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000127', 760, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000080', 17100, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000097', 69000, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000189', 2850, t_count, v_count, u_cp);
  perform pg_temp.used(l_cp, '2000000000172', 5700, t_count, v_count, u_cp);
  insert into public.count_lines (count_id, product_id, system_qty, counted_qty)
  select v_count, m.product_id, 0, 0 from public.stock_movements m where m.ref_id = v_count;
  update public.count_lines cl set
    counted_qty = (select coalesce(sum(qty_base), 0) from public.stock_movements where location_id = l_cp and product_id = cl.product_id),
    system_qty = (select coalesce(sum(qty_base), 0) from public.stock_movements where location_id = l_cp and product_id = cl.product_id)
      - (select sum(qty_base) from public.stock_movements where ref_id = v_count and product_id = cl.product_id)
  where count_id = v_count;

  insert into public.audit_log (org_id, actor, action, entity, entity_id, details) values
    (o_h, (select id from auth.users where email = 'admin@stocksetu.demo'), 'platform.org_created', 'organisation', o_h,
      '{"plan":"business","max_users":15,"max_locations":5}'),
    (o_agarwal, u_agarwal, 'organisation.created', 'organisation', o_agarwal, '{"mode":"D"}'),
    (o_spice, u_spice, 'organisation.created', 'organisation', o_spice, '{"mode":"D"}'),
    (o_annapurna, u_annapurna, 'organisation.created', 'organisation', o_annapurna, '{"mode":"D"}');
end;
$$;
