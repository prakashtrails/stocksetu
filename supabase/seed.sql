-- Demo data: one organisation per customer mode, test logins for every role,
-- a shared bilingual catalogue and live workflows to click through.
-- Every demo password: Demo@1234
-- Barcodes use the 200-prefix (in-store range) so they never clash with real products.

create or replace function pg_temp.u(p_email text, p_name text, p_platform boolean default false)
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
  update public.profiles set full_name = p_name, is_platform_admin = p_platform where id = v_id;
  return v_id;
end;
$$;

create or replace function pg_temp.add(p_item text, p_hi text, p_cat text, p_unit public.base_unit,
  p_product text, p_brand text, p_pack bigint, p_label text, p_cost bigint, p_gst int, p_hsn text, p_code text)
returns uuid language plpgsql as $$
declare v_item uuid; v_product uuid;
begin
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

-- Usage posted by a count, in base units (negative = used).
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
  -- users
  u_platform uuid; u_setu uuid; u_sharma uuid; u_sharma_staff uuid; u_chai uuid;
  u_tandoor uuid; u_tandoor_wh uuid; u_tandoor_out uuid; u_spice uuid; u_spice_store uuid; u_spice_kitchen uuid;
  -- organisations
  o_setu uuid; o_sharma uuid; o_chai uuid; o_tandoor uuid; o_spice uuid;
  -- locations
  l_setu uuid; l_chai uuid; l_t_wh uuid; l_t_andheri uuid; l_t_bandra uuid; l_s_store uuid; l_s_kitchen uuid;
  -- relationships and documents
  c_setu_chai uuid; c_setu_tandoor uuid; c_sharma_spice uuid; c_sharma_annapurna uuid;
  s_sharma uuid; s_gupta uuid;
  v_po1 uuid; v_po2 uuid; v_po3 uuid; v_ship uuid; v_trf uuid; v_count uuid; v_rec uuid;
  r_dal uuid; r_pbm uuid; r_rice uuid; r_chai uuid;
  d int;
  t0 timestamptz := date_trunc('day', now()) - interval '8 days';
begin
  -- -------------------------------------------------------------------------
  -- Shared catalogue
  -- -------------------------------------------------------------------------
  perform pg_temp.add('Toor Dal', 'तूर दाल', 'Pulses', 'g', 'Tata Sampann Toor Dal 1 kg', 'Tata Sampann', 1000, '1 kg', 16000, 500, '0713', '2000000000011');
  perform pg_temp.add('Basmati Rice', 'बासमती चावल', 'Grains', 'g', 'India Gate Basmati Rice 5 kg', 'India Gate', 5000, '5 kg', 62000, 500, '1006', '2000000000028');
  perform pg_temp.add('Atta', 'आटा', 'Grains', 'g', 'Aashirvaad Atta 10 kg', 'Aashirvaad', 10000, '10 kg', 45000, 500, '1101', '2000000000035');
  perform pg_temp.add('Maida', 'मैदा', 'Grains', 'g', 'Maida 1 kg', null, 1000, '1 kg', 4500, 500, '1101', '2000000000042');
  perform pg_temp.add('Refined Oil', 'रिफाइंड तेल', 'Oils', 'ml', 'Fortune Sunflower Oil 1 L', 'Fortune', 1000, '1 L', 15500, 500, '1512', '2000000000059');
  perform pg_temp.add('Ghee', 'घी', 'Oils', 'ml', 'Amul Ghee 1 L', 'Amul', 1000, '1 L', 65000, 1200, '0405', '2000000000066');
  perform pg_temp.add('Butter', 'मक्खन', 'Dairy', 'g', 'Amul Butter 500 g', 'Amul', 500, '500 g', 28500, 1200, '0405', '2000000000073');
  perform pg_temp.add('Paneer', 'पनीर', 'Dairy', 'g', 'Amul Paneer 1 kg', 'Amul', 1000, '1 kg', 42000, 500, '0406', '2000000000080');
  perform pg_temp.add('Milk', 'दूध', 'Dairy', 'ml', 'Amul Taaza Milk 1 L', 'Amul', 1000, '1 L', 6800, 0, '0401', '2000000000097');
  perform pg_temp.add('Fresh Cream', 'मलाई', 'Dairy', 'ml', 'Amul Fresh Cream 1 L', 'Amul', 1000, '1 L', 22000, 500, '0401', '2000000000103');
  perform pg_temp.add('Red Chilli Powder', 'लाल मिर्च', 'Spices', 'g', 'MDH Deggi Mirch 100 g', 'MDH', 100, '100 g', 9500, 500, '0904', '2000000000110');
  perform pg_temp.add('Red Chilli Powder', 'लाल मिर्च', 'Spices', 'g', 'Everest Red Chilli Powder 200 g', 'Everest', 200, '200 g', 9000, 500, '0904', '2000000000127');
  perform pg_temp.add('Turmeric', 'हल्दी', 'Spices', 'g', 'Everest Turmeric 200 g', 'Everest', 200, '200 g', 6200, 500, '0910', '2000000000134');
  perform pg_temp.add('Garam Masala', 'गरम मसाला', 'Spices', 'g', 'MDH Garam Masala 100 g', 'MDH', 100, '100 g', 8500, 500, '0910', '2000000000141');
  perform pg_temp.add('Cumin', 'जीरा', 'Spices', 'g', 'Cumin Seeds 200 g', null, 200, '200 g', 9000, 500, '0909', '2000000000158');
  perform pg_temp.add('Salt', 'नमक', 'Essentials', 'g', 'Tata Salt 1 kg', 'Tata', 1000, '1 kg', 2800, 0, '2501', '2000000000165');
  perform pg_temp.add('Sugar', 'चीनी', 'Essentials', 'g', 'Madhur Sugar 1 kg', 'Madhur', 1000, '1 kg', 4800, 500, '1701', '2000000000172');
  perform pg_temp.add('Tea Leaves', 'चाय पत्ती', 'Beverages', 'g', 'Tata Tea Gold 500 g', 'Tata Tea', 500, '500 g', 30000, 500, '0902', '2000000000189');
  perform pg_temp.add('Coffee Beans', 'कॉफ़ी बीन्स', 'Beverages', 'g', 'House Blend Coffee Beans 500 g', null, 500, '500 g', 65000, 500, '0901', '2000000000196');
  perform pg_temp.add('Onion', 'प्याज', 'Vegetables', 'g', 'Onion (loose) 1 kg', null, 1000, '1 kg', 3500, 0, '0703', '2000000000202');
  perform pg_temp.add('Tomato', 'टमाटर', 'Vegetables', 'g', 'Tomato (loose) 1 kg', null, 1000, '1 kg', 3000, 0, '0702', '2000000000219');
  perform pg_temp.add('Mineral Water', 'पानी', 'Beverages', 'pc', 'Bisleri 1 L bottle', 'Bisleri', 1, '1 bottle', 2000, 1800, '2201', '2000000000226');

  -- -------------------------------------------------------------------------
  -- Users (password Demo@1234)
  -- -------------------------------------------------------------------------
  u_platform      := pg_temp.u('admin@stocksetu.demo', 'Platform Admin', true);
  u_setu          := pg_temp.u('setu@stocksetu.demo', 'Rakesh Patil');
  u_sharma        := pg_temp.u('sharma@stocksetu.demo', 'Mahesh Sharma');
  u_sharma_staff  := pg_temp.u('sharma.staff@stocksetu.demo', 'Sunil (Sharma Traders)');
  u_chai          := pg_temp.u('chai@stocksetu.demo', 'Neha Iyer');
  u_tandoor       := pg_temp.u('tandoor@stocksetu.demo', 'Arjun Mehta');
  u_tandoor_wh    := pg_temp.u('tandoor.warehouse@stocksetu.demo', 'Vikram (Warehouse)');
  u_tandoor_out   := pg_temp.u('tandoor.outlet@stocksetu.demo', 'Pooja (Andheri Outlet)');
  u_spice         := pg_temp.u('spice@stocksetu.demo', 'Kabir Khanna');
  u_spice_store   := pg_temp.u('spice.store@stocksetu.demo', 'Ramesh (Store)');
  u_spice_kitchen := pg_temp.u('spice.kitchen@stocksetu.demo', 'Chef Anil (Kitchen)');

  -- -------------------------------------------------------------------------
  -- Organisations, locations, memberships
  -- -------------------------------------------------------------------------
  insert into public.organisations (name, kind, mode, modules, gstin, phone, city, created_by) values
    ('Setu Central Warehouse', 'supplier', 'D', array['supplier', 'khata', 'supplier_inventory'], '27AAACS1234F1Z5', '9820000001', 'Bhiwandi', u_setu)
    returning id into o_setu;
  insert into public.organisations (name, kind, mode, modules, gstin, phone, city, created_by) values
    ('Sharma Traders', 'supplier', 'D', array['supplier', 'khata'], '27AAPFS5678K1Z2', '9820000002', 'Mumbai', u_sharma)
    returning id into o_sharma;
  insert into public.organisations (name, kind, mode, modules, phone, city, created_by) values
    ('Chai Corner', 'business', 'A', array['inventory'], '9820000003', 'Mumbai', u_chai)
    returning id into o_chai;
  insert into public.organisations (name, kind, mode, modules, gstin, phone, city, created_by) values
    ('Tandoor House', 'business', 'B', array['inventory', 'transfers'], '27AAGFT9012M1Z8', '9820000004', 'Mumbai', u_tandoor)
    returning id into o_tandoor;
  insert into public.organisations (name, kind, mode, modules, gstin, phone, city, created_by) values
    ('Spice Route Kitchens', 'business', 'C', array['inventory', 'transfers', 'procurement', 'food_cost'], '27AAHCS3456P1Z1', '9820000005', 'Mumbai', u_spice)
    returning id into o_spice;

  insert into public.locations (org_id, name, kind) values (o_setu, 'Bhiwandi Warehouse', 'warehouse') returning id into l_setu;
  insert into public.locations (org_id, name, kind) values (o_chai, 'Chai Corner Powai', 'store') returning id into l_chai;
  insert into public.locations (org_id, name, kind) values (o_tandoor, 'Central Warehouse', 'warehouse') returning id into l_t_wh;
  insert into public.locations (org_id, name, kind) values (o_tandoor, 'Outlet Andheri', 'outlet') returning id into l_t_andheri;
  insert into public.locations (org_id, name, kind) values (o_tandoor, 'Outlet Bandra', 'outlet') returning id into l_t_bandra;
  insert into public.locations (org_id, name, kind) values (o_spice, 'Main Store', 'store') returning id into l_s_store;
  insert into public.locations (org_id, name, kind) values (o_spice, 'Kitchen', 'kitchen') returning id into l_s_kitchen;

  insert into public.org_members (org_id, user_id, role, location_ids) values
    (o_setu, u_setu, 'supplier_admin', null),
    (o_sharma, u_sharma, 'supplier_admin', null),
    (o_sharma, u_sharma_staff, 'supplier_staff', null),
    (o_chai, u_chai, 'admin', null),
    (o_tandoor, u_tandoor, 'admin', null),
    (o_tandoor, u_tandoor_wh, 'warehouse', array[l_t_wh]),
    (o_tandoor, u_tandoor_out, 'outlet', array[l_t_andheri]),
    (o_spice, u_spice, 'admin', null),
    (o_spice, u_spice_store, 'warehouse', array[l_s_store]),
    (o_spice, u_spice_kitchen, 'outlet', array[l_s_kitchen]);

  -- Trading relationships
  insert into public.customers (org_id, name, phone, linked_org_id, default_location_id) values
    (o_setu, 'Chai Corner', '9820000003', o_chai, l_chai) returning id into c_setu_chai;
  insert into public.customers (org_id, name, phone, gstin, linked_org_id, default_location_id) values
    (o_setu, 'Tandoor House', '9820000004', '27AAGFT9012M1Z8', o_tandoor, l_t_wh) returning id into c_setu_tandoor;
  insert into public.customers (org_id, name, phone, gstin, linked_org_id, default_location_id) values
    (o_sharma, 'Spice Route Kitchens', '9820000005', '27AAHCS3456P1Z1', o_spice, l_s_store) returning id into c_sharma_spice;
  insert into public.customers (org_id, name, phone) values
    (o_sharma, 'Hotel Annapurna', '9820000099') returning id into c_sharma_annapurna;

  insert into public.suppliers (org_id, name, phone, gstin, linked_org_id) values
    (o_spice, 'Sharma Traders', '9820000002', '27AAPFS5678K1Z2', o_sharma) returning id into s_sharma;
  insert into public.suppliers (org_id, name, phone) values
    (o_spice, 'Gupta Dairy', '9820000077') returning id into s_gupta;

  -- -------------------------------------------------------------------------
  -- Opening stock
  -- -------------------------------------------------------------------------
  perform pg_temp.mv(l_setu, '2000000000011', 120, 'opening', t0, null, null, u_setu);
  perform pg_temp.mv(l_setu, '2000000000028', 60, 'opening', t0, null, null, u_setu);
  perform pg_temp.mv(l_setu, '2000000000035', 40, 'opening', t0, null, null, u_setu);
  perform pg_temp.mv(l_setu, '2000000000059', 150, 'opening', t0, null, null, u_setu);
  perform pg_temp.mv(l_setu, '2000000000073', 80, 'opening', t0, null, null, u_setu);
  perform pg_temp.mv(l_setu, '2000000000097', 300, 'opening', t0, null, null, u_setu);
  perform pg_temp.mv(l_setu, '2000000000172', 100, 'opening', t0, null, null, u_setu);
  perform pg_temp.mv(l_setu, '2000000000189', 50, 'opening', t0, null, null, u_setu);
  perform pg_temp.mv(l_setu, '2000000000196', 30, 'opening', t0, null, null, u_setu);
  perform pg_temp.mv(l_setu, '2000000000226', 400, 'opening', t0, null, null, u_setu);

  perform pg_temp.mv(l_chai, '2000000000097', 12, 'opening', t0, null, null, u_chai);
  perform pg_temp.mv(l_chai, '2000000000189', 2, 'opening', t0, null, null, u_chai);
  perform pg_temp.mv(l_chai, '2000000000172', 3, 'opening', t0, null, null, u_chai);
  perform pg_temp.mv(l_chai, '2000000000196', 1, 'opening', t0, null, null, u_chai);
  perform pg_temp.mv(l_chai, '2000000000226', 24, 'opening', t0, null, null, u_chai);

  perform pg_temp.mv(l_t_wh, '2000000000011', 40, 'opening', t0, null, null, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000028', 20, 'opening', t0, null, null, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000035', 12, 'opening', t0, null, null, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000059', 30, 'opening', t0, null, null, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000073', 24, 'opening', t0, null, null, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000080', 20, 'opening', t0, null, null, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000127', 15, 'opening', t0, null, null, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000110', 10, 'opening', t0, null, null, u_tandoor_wh);
  perform pg_temp.mv(l_t_andheri, '2000000000011', 4, 'opening', t0, null, null, u_tandoor_out);
  perform pg_temp.mv(l_t_andheri, '2000000000073', 2, 'opening', t0, null, null, u_tandoor_out);
  perform pg_temp.mv(l_t_andheri, '2000000000080', 3, 'opening', t0, null, null, u_tandoor_out);
  perform pg_temp.mv(l_t_bandra, '2000000000011', 3, 'opening', t0, null, null, u_tandoor);
  perform pg_temp.mv(l_t_bandra, '2000000000059', 2, 'opening', t0, null, null, u_tandoor);

  perform pg_temp.mv(l_s_store, '2000000000011', 25, 'opening', t0, null, null, u_spice_store);
  perform pg_temp.mv(l_s_store, '2000000000028', 15, 'opening', t0, null, null, u_spice_store);
  perform pg_temp.mv(l_s_store, '2000000000059', 20, 'opening', t0, null, null, u_spice_store);
  perform pg_temp.mv(l_s_store, '2000000000066', 12, 'opening', t0, null, null, u_spice_store);
  perform pg_temp.mv(l_s_store, '2000000000073', 4, 'opening', t0, null, null, u_spice_store);
  perform pg_temp.mv(l_s_store, '2000000000080', 6, 'opening', t0, null, null, u_spice_store);
  perform pg_temp.mv(l_s_store, '2000000000127', 8, 'opening', t0, null, null, u_spice_store);
  perform pg_temp.mv(l_s_store, '2000000000165', 10, 'opening', t0, null, null, u_spice_store);
  perform pg_temp.mv(l_s_store, '2000000000158', 6, 'opening', t0, null, null, u_spice_store);

  -- Spice Route kitchen: stock for the week, then a count that reveals real usage
  perform pg_temp.mv(l_s_kitchen, '2000000000011', 14, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000028', 8, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000066', 9, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000073', 11, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000080', 26, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000097', 60, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000103', 6, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000127', 8, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000134', 3, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000141', 7, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000158', 9, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000165', 4, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000172', 6, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000189', 6, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000202', 22, 'opening', t0, null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000219', 32, 'opening', t0, null, null, u_spice_kitchen);

  -- -------------------------------------------------------------------------
  -- Mode A: Setu Central -> Chai Corner (one received earlier, one in transit)
  -- -------------------------------------------------------------------------
  insert into public.shipments (code, invoice_number, supplier_org_id, customer_id, buyer_org_id, buyer_location_id,
    from_location_id, status, dispatched_by, dispatched_at, received_at)
  values ('SHP-CHAI00', 'INV-2610-0001', o_setu, c_setu_chai, o_chai, l_chai, l_setu, 'received', u_setu, t0 + interval '1 day', t0 + interval '1 day 3 hours')
  returning id into v_ship;
  insert into public.shipment_lines (shipment_id, product_id, product_name, pack_label, hsn, qty_packs, rate_paise, gst_bp, qty_received)
  select v_ship, p.id, p.name, p.pack_label, p.hsn, x.q, p.cost_paise, p.gst_bp, x.q
  from (values ('2000000000097', 30), ('2000000000189', 4), ('2000000000172', 5)) x(code, q)
  join public.products p on p.id = pg_temp.p(x.code);
  perform pg_temp.mv(l_setu, '2000000000097', -30, 'dispatch', t0 + interval '1 day', 'shipment', v_ship, u_setu);
  perform pg_temp.mv(l_setu, '2000000000189', -4, 'dispatch', t0 + interval '1 day', 'shipment', v_ship, u_setu);
  perform pg_temp.mv(l_setu, '2000000000172', -5, 'dispatch', t0 + interval '1 day', 'shipment', v_ship, u_setu);
  insert into public.goods_receipts (org_id, location_id, shipment_id, supplier_name, bill_number, received_by, received_at)
  values (o_chai, l_chai, v_ship, 'Setu Central Warehouse', 'INV-2610-0001', u_chai, t0 + interval '1 day 3 hours') returning id into v_rec;
  insert into public.receipt_lines (receipt_id, product_id, expected_packs, received_packs, accepted_packs, resolution, rate_paise)
  select v_rec, product_id, qty_packs, qty_packs, qty_packs, 'matched', rate_paise from public.shipment_lines where shipment_id = v_ship;
  perform pg_temp.mv(l_chai, '2000000000097', 30, 'receipt', t0 + interval '1 day 3 hours', 'goods_receipt', v_rec, u_chai);
  perform pg_temp.mv(l_chai, '2000000000189', 4, 'receipt', t0 + interval '1 day 3 hours', 'goods_receipt', v_rec, u_chai);
  perform pg_temp.mv(l_chai, '2000000000172', 5, 'receipt', t0 + interval '1 day 3 hours', 'goods_receipt', v_rec, u_chai);
  insert into public.khata_entries (supplier_org_id, customer_id, kind, amount_paise, ref_type, ref_id, note, created_by, created_at)
  values (o_setu, c_setu_chai, 'debit', 355200, 'shipment', v_ship, 'Invoice INV-2610-0001', u_setu, t0 + interval '1 day'),
         (o_setu, c_setu_chai, 'credit', 200000, null, null, 'UPI payment', u_setu, t0 + interval '4 days');
  perform pg_temp.mv(l_chai, '2000000000097', -26, 'scan_out', t0 + interval '5 days', null, null, u_chai);
  perform pg_temp.mv(l_chai, '2000000000189', -3, 'scan_out', t0 + interval '5 days', null, null, u_chai);
  perform pg_temp.mv(l_chai, '2000000000097', -2, 'wastage', t0 + interval '6 days', null, null, u_chai);

  insert into public.shipments (code, invoice_number, supplier_org_id, customer_id, buyer_org_id, buyer_location_id,
    from_location_id, status, dispatched_by, dispatched_at)
  values ('SHP-CHAI01', 'INV-2610-0002', o_setu, c_setu_chai, o_chai, l_chai, l_setu, 'in_transit', u_setu, now() - interval '2 hours')
  returning id into v_ship;
  insert into public.shipment_lines (shipment_id, product_id, product_name, pack_label, hsn, qty_packs, rate_paise, gst_bp)
  select v_ship, p.id, p.name, p.pack_label, p.hsn, x.q, p.cost_paise, p.gst_bp
  from (values ('2000000000097', 24), ('2000000000189', 2), ('2000000000196', 2), ('2000000000226', 48)) x(code, q)
  join public.products p on p.id = pg_temp.p(x.code);
  perform pg_temp.mv(l_setu, '2000000000097', -24, 'dispatch', now() - interval '2 hours', 'shipment', v_ship, u_setu);
  perform pg_temp.mv(l_setu, '2000000000189', -2, 'dispatch', now() - interval '2 hours', 'shipment', v_ship, u_setu);
  perform pg_temp.mv(l_setu, '2000000000196', -2, 'dispatch', now() - interval '2 hours', 'shipment', v_ship, u_setu);
  perform pg_temp.mv(l_setu, '2000000000226', -48, 'dispatch', now() - interval '2 hours', 'shipment', v_ship, u_setu);
  insert into public.khata_entries (supplier_org_id, customer_id, kind, amount_paise, ref_type, ref_id, note, created_by)
  values (o_setu, c_setu_chai, 'debit', 475980, 'shipment', v_ship, 'Invoice INV-2610-0002', u_setu);

  -- -------------------------------------------------------------------------
  -- Mode B: Setu -> Tandoor central warehouse, then warehouse -> outlets
  -- -------------------------------------------------------------------------
  insert into public.shipments (code, invoice_number, supplier_org_id, customer_id, buyer_org_id, buyer_location_id,
    from_location_id, status, dispatched_by, dispatched_at)
  values ('SHP-TAND01', 'INV-2610-0003', o_setu, c_setu_tandoor, o_tandoor, l_t_wh, l_setu, 'in_transit', u_setu, now() - interval '5 hours')
  returning id into v_ship;
  insert into public.shipment_lines (shipment_id, product_id, product_name, pack_label, hsn, qty_packs, rate_paise, gst_bp)
  select v_ship, p.id, p.name, p.pack_label, p.hsn, x.q, p.cost_paise, p.gst_bp
  from (values ('2000000000011', 20), ('2000000000059', 12), ('2000000000073', 10)) x(code, q)
  join public.products p on p.id = pg_temp.p(x.code);
  perform pg_temp.mv(l_setu, '2000000000011', -20, 'dispatch', now() - interval '5 hours', 'shipment', v_ship, u_setu);
  perform pg_temp.mv(l_setu, '2000000000059', -12, 'dispatch', now() - interval '5 hours', 'shipment', v_ship, u_setu);
  perform pg_temp.mv(l_setu, '2000000000073', -10, 'dispatch', now() - interval '5 hours', 'shipment', v_ship, u_setu);
  insert into public.khata_entries (supplier_org_id, customer_id, kind, amount_paise, ref_type, ref_id, note, created_by, created_at)
  values (o_setu, c_setu_tandoor, 'debit', 4560000, null, null, 'Opening balance', u_setu, t0),
         (o_setu, c_setu_tandoor, 'credit', 3000000, null, null, 'NEFT received', u_setu, t0 + interval '3 days'),
         (o_setu, c_setu_tandoor, 'debit', 850500, 'shipment', v_ship, 'Invoice INV-2610-0003', u_setu, now());

  insert into public.transfers (org_id, code, from_location_id, to_location_id, status, created_by, dispatched_by, dispatched_at, note)
  values (o_tandoor, 'TRF-AND001', l_t_wh, l_t_andheri, 'in_transit', u_tandoor_wh, u_tandoor_wh, now() - interval '1 hour', 'Daily replenishment')
  returning id into v_trf;
  insert into public.transfer_lines (transfer_id, product_id, qty_packs)
  select v_trf, pg_temp.p(x.code), x.q
  from (values ('2000000000011', 5), ('2000000000073', 4), ('2000000000080', 6), ('2000000000059', 6)) x(code, q);
  perform pg_temp.mv(l_t_wh, '2000000000011', -5, 'transfer_out', now() - interval '1 hour', 'transfer', v_trf, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000073', -4, 'transfer_out', now() - interval '1 hour', 'transfer', v_trf, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000080', -6, 'transfer_out', now() - interval '1 hour', 'transfer', v_trf, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000059', -6, 'transfer_out', now() - interval '1 hour', 'transfer', v_trf, u_tandoor_wh);

  insert into public.transfers (org_id, code, from_location_id, to_location_id, status, created_by, note)
  values (o_tandoor, 'TRF-BAN002', l_t_wh, l_t_bandra, 'requested', u_tandoor, 'Bandra running low on dal and butter')
  returning id into v_trf;
  insert into public.transfer_lines (transfer_id, product_id, qty_packs)
  select v_trf, pg_temp.p(x.code), x.q from (values ('2000000000011', 4), ('2000000000073', 3)) x(code, q);

  insert into public.transfers (org_id, code, from_location_id, to_location_id, status, created_by, dispatched_by, dispatched_at,
    received_by, received_at, note)
  values (o_tandoor, 'TRF-AND000', l_t_wh, l_t_andheri, 'discrepancy', u_tandoor_wh, u_tandoor_wh, t0 + interval '2 days',
    u_tandoor_out, t0 + interval '2 days 2 hours', 'Weekly top-up')
  returning id into v_trf;
  insert into public.transfer_lines (transfer_id, product_id, qty_packs, qty_received)
  values (v_trf, pg_temp.p('2000000000011'), 6, 6), (v_trf, pg_temp.p('2000000000080'), 4, 3);
  perform pg_temp.mv(l_t_wh, '2000000000011', -6, 'transfer_out', t0 + interval '2 days', 'transfer', v_trf, u_tandoor_wh);
  perform pg_temp.mv(l_t_wh, '2000000000080', -4, 'transfer_out', t0 + interval '2 days', 'transfer', v_trf, u_tandoor_wh);
  perform pg_temp.mv(l_t_andheri, '2000000000011', 6, 'transfer_in', t0 + interval '2 days 2 hours', 'transfer', v_trf, u_tandoor_out);
  perform pg_temp.mv(l_t_andheri, '2000000000080', 3, 'transfer_in', t0 + interval '2 days 2 hours', 'transfer', v_trf, u_tandoor_out);

  insert into public.min_levels (org_id, location_id, product_id, min_packs, reorder_packs) values
    (o_tandoor, l_t_andheri, pg_temp.p('2000000000073'), 4, 6),
    (o_tandoor, l_t_andheri, pg_temp.p('2000000000080'), 5, 8),
    (o_tandoor, l_t_wh, pg_temp.p('2000000000110'), 12, 10);

  -- -------------------------------------------------------------------------
  -- Mode C: Spice Route procurement with Sharma Traders and Gupta Dairy
  -- -------------------------------------------------------------------------
  insert into public.purchase_orders (number, buyer_org_id, supplier_id, supplier_org_id, location_id, status, created_by,
    sent_at, responded_at, expected_date, note)
  values ('PO-0001', o_spice, s_sharma, o_sharma, l_s_store, 'dispatched', u_spice, now() - interval '2 days',
    now() - interval '1 day', current_date, 'Weekly dry stock')
  returning id into v_po1;
  insert into public.po_lines (po_id, product_id, product_name, pack_label, qty_packs, rate_paise, gst_bp, qty_accepted, qty_dispatched)
  select v_po1, p.id, p.name, p.pack_label, x.q, x.r, p.gst_bp, x.q, x.q
  from (values ('2000000000011', 100, 15800), ('2000000000028', 10, 61000), ('2000000000127', 12, 8800)) x(code, q, r)
  join public.products p on p.id = pg_temp.p(x.code);
  insert into public.shipments (code, invoice_number, supplier_org_id, customer_id, buyer_org_id, buyer_location_id,
    po_id, status, dispatched_by, dispatched_at)
  values ('SHP-SPICE1', 'INV-2610-0001', o_sharma, c_sharma_spice, o_spice, l_s_store, v_po1, 'in_transit', u_sharma, now() - interval '3 hours')
  returning id into v_ship;
  insert into public.shipment_lines (shipment_id, po_line_id, product_id, product_name, pack_label, hsn, qty_packs, rate_paise, gst_bp)
  select v_ship, l.id, l.product_id, l.product_name, l.pack_label, p.hsn, l.qty_packs, l.rate_paise, l.gst_bp
  from public.po_lines l join public.products p on p.id = l.product_id where l.po_id = v_po1;
  insert into public.khata_entries (supplier_org_id, customer_id, kind, amount_paise, ref_type, ref_id, note, created_by, created_at)
  values (o_sharma, c_sharma_spice, 'debit', 1845000, null, null, 'Opening balance', u_sharma, t0),
         (o_sharma, c_sharma_spice, 'credit', 1000000, null, null, 'Cheque 004512', u_sharma, t0 + interval '5 days'),
         (o_sharma, c_sharma_spice, 'debit', 2410380, 'shipment', v_ship, 'Invoice INV-2610-0001', u_sharma, now() - interval '3 hours'),
         (o_sharma, c_sharma_annapurna, 'debit', 1230000, null, null, 'Opening balance', u_sharma, t0);

  insert into public.purchase_orders (number, buyer_org_id, supplier_id, supplier_org_id, location_id, status, created_by, sent_at, note)
  values ('PO-0002', o_spice, s_sharma, o_sharma, l_s_store, 'sent', u_spice, now() - interval '30 minutes', 'Need by Friday')
  returning id into v_po2;
  insert into public.po_lines (po_id, product_id, product_name, pack_label, qty_packs, rate_paise, gst_bp)
  select v_po2, p.id, p.name, p.pack_label, x.q, x.r, p.gst_bp
  from (values ('2000000000059', 24, 15200), ('2000000000066', 6, 64000), ('2000000000158', 10, 8800), ('2000000000165', 20, 2700)) x(code, q, r)
  join public.products p on p.id = pg_temp.p(x.code);

  insert into public.purchase_orders (number, buyer_org_id, supplier_id, location_id, status, created_by, note)
  values ('PO-0003', o_spice, s_gupta, l_s_store, 'draft', u_spice, 'Dairy for the weekend')
  returning id into v_po3;
  insert into public.po_lines (po_id, product_id, product_name, pack_label, qty_packs, rate_paise, gst_bp)
  select v_po3, p.id, p.name, p.pack_label, x.q, x.r, p.gst_bp
  from (values ('2000000000073', 10, 28000), ('2000000000080', 8, 41000), ('2000000000103', 6, 21500)) x(code, q, r)
  join public.products p on p.id = pg_temp.p(x.code);

  insert into public.min_levels (org_id, location_id, product_id, min_packs, reorder_packs) values
    (o_spice, l_s_store, pg_temp.p('2000000000073'), 10, 12),
    (o_spice, l_s_store, pg_temp.p('2000000000080'), 8, 10),
    (o_spice, l_s_store, pg_temp.p('2000000000011'), 20, 50),
    (o_spice, l_s_store, pg_temp.p('2000000000103'), 4, 6);

  -- Recipes (quantities per plate, attached to items so brand switches don't matter)
  insert into public.recipes (org_id, name, sell_price_paise) values (o_spice, 'Dal Tadka', 22000) returning id into r_dal;
  insert into public.recipes (org_id, name, sell_price_paise) values (o_spice, 'Paneer Butter Masala', 34000) returning id into r_pbm;
  insert into public.recipes (org_id, name, sell_price_paise) values (o_spice, 'Jeera Rice', 16000) returning id into r_rice;
  insert into public.recipes (org_id, name, sell_price_paise) values (o_spice, 'Masala Chai', 4000) returning id into r_chai;
  insert into public.recipe_lines (recipe_id, item_id, qty_base)
  select r_dal, pg_temp.item(x.n), x.q from (values ('Toor Dal', 60), ('Ghee', 15), ('Onion', 50), ('Tomato', 50),
    ('Cumin', 3), ('Turmeric', 2), ('Red Chilli Powder', 3), ('Salt', 5)) x(n, q);
  insert into public.recipe_lines (recipe_id, item_id, qty_base)
  select r_pbm, pg_temp.item(x.n), x.q from (values ('Paneer', 150), ('Butter', 30), ('Fresh Cream', 30), ('Tomato', 120),
    ('Onion', 60), ('Garam Masala', 4), ('Red Chilli Powder', 4), ('Salt', 5)) x(n, q);
  insert into public.recipe_lines (recipe_id, item_id, qty_base)
  select r_rice, pg_temp.item(x.n), x.q from (values ('Basmati Rice', 150), ('Ghee', 10), ('Cumin', 4), ('Salt', 3)) x(n, q);
  insert into public.recipe_lines (recipe_id, item_id, qty_base)
  select r_chai, pg_temp.item(x.n), x.q from (values ('Milk', 120), ('Tea Leaves', 5), ('Sugar', 10)) x(n, q);

  -- 7 days of sales at the kitchen
  for d in 1..7 loop
    insert into public.sales (org_id, location_id, sale_date, recipe_id, qty, created_by) values
      (o_spice, l_s_kitchen, (t0 + make_interval(days => d))::date, r_dal, 25, u_spice_kitchen),
      (o_spice, l_s_kitchen, (t0 + make_interval(days => d))::date, r_pbm, 20, u_spice_kitchen),
      (o_spice, l_s_kitchen, (t0 + make_interval(days => d))::date, r_rice, 30, u_spice_kitchen),
      (o_spice, l_s_kitchen, (t0 + make_interval(days => d))::date, r_chai, 60, u_spice_kitchen);
  end loop;

  -- Recorded wastage
  perform pg_temp.mv(l_s_kitchen, '2000000000097', -2, 'wastage', t0 + interval '3 days', null, null, u_spice_kitchen);
  perform pg_temp.mv(l_s_kitchen, '2000000000219', -1.5, 'wastage', t0 + interval '5 days', null, null, u_spice_kitchen);

  -- Baseline count (no gap) and this morning's count (usage = theoretical + leaks)
  insert into public.counts (org_id, location_id, status, started_by, completed_by, started_at, completed_at)
  values (o_spice, l_s_kitchen, 'completed', u_spice_kitchen, u_spice_kitchen, t0 + interval '22 hours', t0 + interval '22 hours 10 minutes');
  insert into public.counts (org_id, location_id, status, started_by, completed_by, started_at, completed_at)
  values (o_spice, l_s_kitchen, 'completed', u_spice_kitchen, u_spice_kitchen, date_trunc('day', now()) + interval '8 hours',
    date_trunc('day', now()) + interval '8 hours 9 minutes')
  returning id into v_count;
  perform pg_temp.used(l_s_kitchen, '2000000000080', 22260, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000073', 4580, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000103', 4290, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000097', 51900, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000011', 10620, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000066', 4790, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000028', 31700, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000189', 2120, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000172', 4250, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000219', 25800, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000202', 17300, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000158', 1380, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000134', 352, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000127', 1100, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000165', 2230, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  perform pg_temp.used(l_s_kitchen, '2000000000141', 566, date_trunc('day', now()) + interval '8 hours 9 minutes', v_count, u_spice_kitchen);
  insert into public.count_lines (count_id, product_id, system_qty, counted_qty)
  select v_count, m.product_id, 0, 0 from public.stock_movements m where m.ref_id = v_count;
  update public.count_lines cl set
    counted_qty = (select coalesce(sum(qty_base), 0) from public.stock_movements where location_id = l_s_kitchen and product_id = cl.product_id),
    system_qty = (select coalesce(sum(qty_base), 0) from public.stock_movements where location_id = l_s_kitchen and product_id = cl.product_id)
      - (select sum(qty_base) from public.stock_movements where ref_id = v_count and product_id = cl.product_id)
  where count_id = v_count;

  insert into public.product_costs (org_id, product_id, cost_paise)
  select o_spice, pg_temp.p(x.code), x.r from (values ('2000000000011', 15800), ('2000000000028', 61000), ('2000000000127', 8800)) x(code, r);

  insert into public.audit_log (org_id, actor, action, entity, details) values
    (o_spice, u_spice, 'organisation.created', 'organisation', '{"mode":"C"}'),
    (o_tandoor, u_tandoor, 'organisation.created', 'organisation', '{"mode":"B"}'),
    (o_chai, u_chai, 'organisation.created', 'organisation', '{"mode":"A"}'),
    (o_setu, u_setu, 'organisation.created', 'organisation', '{"mode":"D"}'),
    (o_sharma, u_sharma, 'organisation.created', 'organisation', '{"mode":"D"}');
end;
$$;
