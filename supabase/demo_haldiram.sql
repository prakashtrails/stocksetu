-- One-time, clearly labelled sample workspace for demonstrations.
-- Run with `supabase db query --linked --file supabase/demo_haldiram.sql`.
-- No login credentials are stored here. Create demo accounts separately with
-- unique generated passwords; never use the old seed files in production.
begin;

do $$
declare
  v_org uuid;
  v_wh uuid;
  v_cp uuid;
  v_noida uuid;
  v_item uuid;
  v_product uuid;
  v_supplier uuid;
  v_po uuid;
  v_transfer uuid;
  v_owner uuid;
  v_row record;
  v_day date;
begin
  if exists (select 1 from public.organisations where name = 'Haldiram (Demo)') then
    raise notice 'Haldiram (Demo) already exists; skipping sample data';
    return;
  end if;

  select id into v_owner from auth.users where lower(email) = 'prakashgovtportal@gmail.com';
  if v_owner is null then
    raise exception 'Verified platform owner account is required before demo seeding';
  end if;

  insert into public.organisations
    (name, kind, mode, modules, plan, max_users, max_locations, city, created_by)
  values
    ('Haldiram (Demo)', 'business', 'C',
      array['inventory', 'transfers', 'procurement', 'food_cost'],
      'demo', 10, 5, 'Delhi NCR', v_owner)
  returning id into v_org;

  insert into public.locations (org_id, name, kind)
  values (v_org, 'Central Warehouse Okhla', 'warehouse') returning id into v_wh;
  insert into public.locations (org_id, name, kind)
  values (v_org, 'Outlet Connaught Place', 'outlet') returning id into v_cp;
  insert into public.locations (org_id, name, kind)
  values (v_org, 'Outlet Noida Sector 18', 'outlet') returning id into v_noida;

  insert into public.suppliers (org_id, name) values
    (v_org, 'Agarwal Dairy (Demo)'),
    (v_org, 'Delhi Spice Traders (Demo)'),
    (v_org, 'Annapurna Grains (Demo)');

  -- Item, product and barcode stay inside the sample organisation.
  for v_row in
    select * from (values
      ('Kabuli Chana', 'काबुली चना', 'Pulses', 'g'::public.base_unit, 'Kabuli Chana 1 kg', 1000::bigint, '1 kg', 13000::bigint, 'HAL-DEMO-001', 75, 20, 18),
      ('Maida', 'मैदा', 'Grains', 'g'::public.base_unit, 'Maida 1 kg', 1000::bigint, '1 kg', 4500::bigint, 'HAL-DEMO-002', 90, 25, 22),
      ('Refined Oil', 'रिफाइंड तेल', 'Oils', 'ml'::public.base_unit, 'Sunflower Oil 1 L', 1000::bigint, '1 L', 15500::bigint, 'HAL-DEMO-003', 65, 22, 18),
      ('Onion', 'प्याज', 'Vegetables', 'g'::public.base_unit, 'Onion 1 kg', 1000::bigint, '1 kg', 3500::bigint, 'HAL-DEMO-004', 65, 18, 16),
      ('Tomato', 'टमाटर', 'Vegetables', 'g'::public.base_unit, 'Tomato 1 kg', 1000::bigint, '1 kg', 3000::bigint, 'HAL-DEMO-005', 60, 16, 14),
      ('Chaat Masala', 'चाट मसाला', 'Spices', 'g'::public.base_unit, 'Chaat Masala 100 g', 100::bigint, '100 g', 6800::bigint, 'HAL-DEMO-006', 60, 18, 15),
      ('Salt', 'नमक', 'Essentials', 'g'::public.base_unit, 'Salt 1 kg', 1000::bigint, '1 kg', 2800::bigint, 'HAL-DEMO-007', 45, 14, 12),
      ('Potato', 'आलू', 'Vegetables', 'g'::public.base_unit, 'Potato 1 kg', 1000::bigint, '1 kg', 2500::bigint, 'HAL-DEMO-008', 80, 24, 20),
      ('Curd', 'दही', 'Dairy', 'g'::public.base_unit, 'Curd 1 kg', 1000::bigint, '1 kg', 9800::bigint, 'HAL-DEMO-009', 55, 18, 16),
      ('Paneer', 'पनीर', 'Dairy', 'g'::public.base_unit, 'Paneer 1 kg', 1000::bigint, '1 kg', 42000::bigint, 'HAL-DEMO-010', 55, 22, 20),
      ('Garam Masala', 'गरम मसाला', 'Spices', 'g'::public.base_unit, 'Garam Masala 100 g', 100::bigint, '100 g', 8500::bigint, 'HAL-DEMO-011', 40, 12, 10),
      ('Milk', 'दूध', 'Dairy', 'ml'::public.base_unit, 'Milk 1 L', 1000::bigint, '1 L', 6800::bigint, 'HAL-DEMO-012', 85, 20, 18),
      ('Tea Leaves', 'चाय पत्ती', 'Beverages', 'g'::public.base_unit, 'Tea Leaves 500 g', 500::bigint, '500 g', 30000::bigint, 'HAL-DEMO-013', 38, 12, 10),
      ('Sugar', 'चीनी', 'Essentials', 'g'::public.base_unit, 'Sugar 1 kg', 1000::bigint, '1 kg', 4800::bigint, 'HAL-DEMO-014', 65, 18, 16),
      ('Besan', 'बेसन', 'Grains', 'g'::public.base_unit, 'Besan 1 kg', 1000::bigint, '1 kg', 9000::bigint, 'HAL-DEMO-015', 60, 18, 15)
    ) as x(item_name, item_hi, category, base_unit, product_name, pack_qty, pack_label, cost_paise, barcode, wh_packs, cp_packs, noida_packs)
  loop
    insert into public.items (org_id, name, name_hi, category, base_unit)
    values (v_org, v_row.item_name, v_row.item_hi, v_row.category, v_row.base_unit)
    returning id into v_item;
    insert into public.products (org_id, item_id, name, pack_qty, pack_label, cost_paise)
    values (v_org, v_item, v_row.product_name, v_row.pack_qty, v_row.pack_label, v_row.cost_paise)
    returning id into v_product;
    insert into public.barcodes (org_id, code, product_id)
    values (v_org, v_row.barcode, v_product);
    insert into public.stock_movements
      (org_id, location_id, product_id, qty_base, reason, unit_cost_paise, occurred_at)
    values
      (v_org, v_wh, v_product, v_row.wh_packs * v_row.pack_qty, 'opening', v_row.cost_paise, now() - interval '10 days'),
      (v_org, v_cp, v_product, v_row.cp_packs * v_row.pack_qty, 'opening', v_row.cost_paise, now() - interval '10 days'),
      (v_org, v_noida, v_product, v_row.noida_packs * v_row.pack_qty, 'opening', v_row.cost_paise, now() - interval '10 days');
  end loop;

  insert into public.recipes (org_id, name, sell_price_paise) values
    (v_org, 'Chole Bhature', 24000),
    (v_org, 'Raj Kachori', 18000),
    (v_org, 'Paneer Tikka', 32000),
    (v_org, 'Masala Chai', 6000);

  insert into public.recipe_lines (recipe_id, item_id, qty_base)
  select r.id, i.id, x.qty_base
  from (values
    ('Chole Bhature', 'Kabuli Chana', 160::bigint), ('Chole Bhature', 'Maida', 160::bigint),
    ('Chole Bhature', 'Refined Oil', 35::bigint), ('Chole Bhature', 'Onion', 60::bigint),
    ('Chole Bhature', 'Tomato', 60::bigint), ('Chole Bhature', 'Chaat Masala', 5::bigint),
    ('Raj Kachori', 'Maida', 90::bigint), ('Raj Kachori', 'Potato', 100::bigint),
    ('Raj Kachori', 'Curd', 100::bigint), ('Raj Kachori', 'Kabuli Chana', 70::bigint),
    ('Raj Kachori', 'Chaat Masala', 5::bigint),
    ('Paneer Tikka', 'Paneer', 180::bigint), ('Paneer Tikka', 'Curd', 80::bigint),
    ('Paneer Tikka', 'Onion', 50::bigint), ('Paneer Tikka', 'Refined Oil', 15::bigint),
    ('Paneer Tikka', 'Garam Masala', 4::bigint),
    ('Masala Chai', 'Milk', 150::bigint), ('Masala Chai', 'Tea Leaves', 8::bigint),
    ('Masala Chai', 'Sugar', 15::bigint)
  ) as x(recipe_name, item_name, qty_base)
  join public.recipes r on r.org_id = v_org and r.name = x.recipe_name
  join public.items i on i.org_id = v_org and i.name = x.item_name;

  -- Recent sales provide a genuine trend in the platform and recipe dashboards.
  for v_day in select generate_series(current_date - 9, current_date, interval '1 day')::date loop
    insert into public.sales (org_id, location_id, sale_date, recipe_id, qty)
    select v_org, l.id, v_day, r.id,
      (case r.name
        when 'Chole Bhature' then 22
        when 'Raj Kachori' then 18
        when 'Paneer Tikka' then 12
        else 36 end) + (extract(doy from v_day)::int % 5) +
        (case when l.id = v_cp then 4 else 0 end)
    from public.recipes r
    cross join public.locations l
    where r.org_id = v_org and l.org_id = v_org and l.id in (v_cp, v_noida);
  end loop;

  -- A small receipt and some wastage make stock activity recent as well.
  insert into public.stock_movements
    (org_id, location_id, product_id, qty_base, reason, unit_cost_paise, occurred_at)
  select v_org, v_wh, p.id, p.pack_qty * 12, 'receipt', p.cost_paise, now() - interval '2 days'
  from public.products p join public.items i on i.id = p.item_id
  where p.org_id = v_org and i.name in ('Paneer', 'Milk', 'Refined Oil');
  insert into public.stock_movements
    (org_id, location_id, product_id, qty_base, reason, unit_cost_paise, occurred_at)
  select v_org, v_cp, p.id, -p.pack_qty, 'wastage', p.cost_paise, now() - interval '1 day'
  from public.products p join public.items i on i.id = p.item_id
  where p.org_id = v_org and i.name in ('Paneer', 'Refined Oil');

  -- One purchase order and one transfer remain open for a live workflow demo.
  select id into v_supplier from public.suppliers
    where org_id = v_org and name = 'Agarwal Dairy (Demo)';
  insert into public.purchase_orders
    (number, buyer_org_id, supplier_id, location_id, status, expected_date, sent_at, note)
  values ('HAL-DEMO-PO-001', v_org, v_supplier, v_wh, 'sent', current_date + 2,
    now() - interval '1 day', 'Sample dairy replenishment')
  returning id into v_po;
  insert into public.po_lines
    (po_id, product_id, product_name, pack_label, qty_packs, rate_paise, gst_bp)
  select v_po, p.id, p.name, p.pack_label, 20, p.cost_paise, p.gst_bp
  from public.products p join public.items i on i.id = p.item_id
  where p.org_id = v_org and i.name in ('Paneer', 'Milk', 'Curd');

  insert into public.transfers
    (org_id, code, from_location_id, to_location_id, status, note, dispatched_at)
  values (v_org, 'HAL-DEMO-TR-001', v_wh, v_cp, 'in_transit',
    'Sample replenishment for Connaught Place', now() - interval '90 minutes')
  returning id into v_transfer;
  insert into public.transfer_lines (transfer_id, product_id, qty_packs)
  select v_transfer, p.id, 5 from public.products p
  join public.items i on i.id = p.item_id
  where p.org_id = v_org and i.name in ('Kabuli Chana', 'Maida', 'Paneer');
  insert into public.stock_movements
    (org_id, location_id, product_id, qty_base, reason, unit_cost_paise, ref_type, ref_id, occurred_at)
  select v_org, v_wh, tl.product_id, -tl.qty_packs * p.pack_qty,
    'transfer_out', p.cost_paise, 'transfer', v_transfer, now() - interval '90 minutes'
  from public.transfer_lines tl join public.products p on p.id = tl.product_id
  where tl.transfer_id = v_transfer;

  insert into public.min_levels (org_id, location_id, product_id, min_packs, reorder_packs)
  select v_org, v_cp, p.id, 25, 30 from public.products p
  join public.items i on i.id = p.item_id
  where p.org_id = v_org and i.name in ('Paneer', 'Milk');
end;
$$;

commit;
