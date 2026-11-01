-- Scenario tests for tenancy (RLS) and every workflow function.
-- Run against a freshly seeded database: bash scripts/test-db/test.sh
\set ON_ERROR_STOP 1
\pset footer off

create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = p_email), false);
  execute 'set role authenticated';
end;
$$;

create or replace function pg_temp.expect(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
  if not p_ok then raise exception 'FAIL: %', p_name; end if;
  raise notice 'ok  %', p_name;
end;
$$;

-- Runs SQL that must fail; passes if an error containing p_fragment is raised.
create or replace function pg_temp.expect_error(p_sql text, p_fragment text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_fragment) in lower(sqlerrm)) > 0 then
      raise notice 'ok  % (%)', p_name, sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % — wrong error: %', p_name, sqlerrm;
  end;
  raise exception 'FAIL: % — no error raised', p_name;
end;
$$;

-- Look up any user id from inside a role-switched test (test helper only).
create or replace function pg_temp.uid(p_email text) returns uuid language sql security definer as
  $$ select id from auth.users where email = p_email $$;

grant execute on all functions in schema pg_temp to authenticated;

-- ---------------------------------------------------------------------------
\echo '--- Tenancy and location scope'
select pg_temp.as_user('chai@stocksetu.demo');
select pg_temp.expect((select count(*) from organisations) = 2, 'Chai Corner sees itself + its supplier only');
select pg_temp.expect((select count(*) from locations) = 1, 'Chai Corner sees only its own location');
select pg_temp.expect(not exists (select 1 from stock_movements m join locations l on l.id = m.location_id where l.name like 'Outlet%'),
  'Chai Corner cannot see Tandoor stock');
select pg_temp.expect((select count(*) from shipments) = 2, 'Chai Corner sees its two shipments');
select pg_temp.expect((select count(*) from purchase_orders) = 0, 'Chai Corner sees no other company POs');
reset role;

select pg_temp.as_user('tandoor.outlet@stocksetu.demo');
select pg_temp.expect((select count(distinct location_id) from stock_balances) = 1, 'Outlet manager sees only Andheri stock');
select pg_temp.expect((select count(*) from stock_movements m join locations l on l.id = m.location_id where l.name = 'Central Warehouse') = 0,
  'Outlet manager cannot see warehouse movements');
select pg_temp.expect((select count(*) from transfers where code = 'TRF-BAN002') = 0, 'Andheri cannot see a Bandra-only transfer');
select pg_temp.expect((select count(*) from transfers where code = 'TRF-AND001') = 1, 'Andheri sees its incoming transfer');
reset role;

select pg_temp.as_user('tandoor@stocksetu.demo');
select pg_temp.expect((select count(distinct location_id) from stock_balances) = 3, 'Business admin sees all 3 Tandoor locations');
reset role;

select pg_temp.as_user('sharma.staff@stocksetu.demo');
select pg_temp.expect((select count(*) from purchase_orders where number = 'PO-0002') = 1, 'Supplier sees POs sent to it');
select pg_temp.expect((select count(*) from purchase_orders where number = 'PO-0003') = 0, 'Supplier cannot see another supplier''s draft PO');
select pg_temp.expect((select count(*) from stock_movements) = 0, 'Supplier cannot see the buyer''s stock');
select pg_temp.expect((select count(*) from po_lines l join purchase_orders p on p.id = l.po_id where p.number = 'PO-0002') = 4,
  'Supplier sees the PO lines');
reset role;

select pg_temp.as_user('spice@stocksetu.demo');
select pg_temp.expect((select count(*) from khata_entries) = 3, 'Buyer sees its own balance with Sharma (not Hotel Annapurna)');
reset role;

-- ---------------------------------------------------------------------------
\echo '--- Ledger rules'
-- Even the database owner (bypassing RLS) cannot rewrite history.
select pg_temp.expect_error($$update stock_movements set qty_base = 1 where true$$, 'append-only', 'Movements cannot be edited');
select pg_temp.expect_error($$delete from stock_movements where true$$, 'append-only', 'Movements cannot be deleted');
select pg_temp.expect_error($$update khata_entries set amount_paise = 1 where true$$, 'append-only', 'Khata cannot be edited');
select pg_temp.as_user('tandoor@stocksetu.demo');
select pg_temp.expect_error(
  $$insert into stock_movements (org_id, location_id, product_id, qty_base, reason, actor)
    select l.org_id, l.id, (select product_id from barcodes where code = '2000000000011'), -999999, 'scan_out', auth.uid()
    from locations l where l.name = 'Outlet Bandra'$$,
  'not enough stock', 'Stock cannot go negative');
select pg_temp.expect_error(
  $$insert into stock_movements (org_id, location_id, product_id, qty_base, reason, actor)
    select l.org_id, l.id, (select product_id from barcodes where code = '2000000000011'), 1000, 'receipt', auth.uid()
    from locations l where l.name = 'Outlet Bandra'$$,
  'row-level security', 'Receipts can only be posted through receive_goods');
reset role;

select pg_temp.as_user('tandoor.outlet@stocksetu.demo');
select pg_temp.expect_error(
  $$insert into stock_movements (org_id, location_id, product_id, qty_base, reason, actor)
    select l.org_id, l.id, (select product_id from barcodes where code = '2000000000011'), 1000, 'scan_in', auth.uid()
    from locations l where l.name = 'Central Warehouse'$$,
  'row-level security', 'Outlet user cannot post stock at the warehouse');
reset role;

-- ---------------------------------------------------------------------------
\echo '--- Offline scan queue is idempotent'
select pg_temp.as_user('chai@stocksetu.demo');
select pg_temp.expect((select (post_stock_events(jsonb_build_array(jsonb_build_object(
    'id', '11111111-1111-1111-1111-111111111111', 'location_id', (select id from locations limit 1),
    'product_id', (select product_id from barcodes where code = '2000000000226'), 'qty_base', 6, 'reason', 'scan_in'))) -> 0 ->> 'status')) = 'posted',
  'First sync posts the scan');
select pg_temp.expect((select (post_stock_events(jsonb_build_array(jsonb_build_object(
    'id', '11111111-1111-1111-1111-111111111111', 'location_id', (select id from locations limit 1),
    'product_id', (select product_id from barcodes where code = '2000000000226'), 'qty_base', 6, 'reason', 'scan_in'))) -> 0 ->> 'status')) = 'duplicate',
  'Re-sending the same scan is ignored');
select pg_temp.expect((select count(*) from stock_movements where id = '11111111-1111-1111-1111-111111111111') = 1, 'Exactly one movement stored');
reset role;

-- ---------------------------------------------------------------------------
\echo '--- Workflow 1: supplier shipment received at the warehouse (Mode A)'
select pg_temp.as_user('chai@stocksetu.demo');
select receive_goods(
  (select id from locations limit 1),
  null,
  (select id from shipments where code = 'SHP-CHAI01'),
  'Setu Central Warehouse', 'INV-2610-0002',
  (select jsonb_agg(jsonb_build_object('product_id', product_id, 'expected_packs', qty_packs,
     'received_packs', case when product_name like 'Amul%' then qty_packs - 2 else qty_packs end,
     'accepted_packs', case when product_name like 'Amul%' then qty_packs - 2 else qty_packs end,
     'resolution', case when product_name like 'Amul%' then 'short_disputed' else 'matched' end))
   from shipment_lines where shipment_id = (select id from shipments where code = 'SHP-CHAI01')),
  'Two milk packs missing');
select pg_temp.expect((select status from shipments where code = 'SHP-CHAI01') = 'discrepancy', 'Short shipment is flagged as a discrepancy');
select pg_temp.expect((select qty_base from stock_balances b join barcodes c on c.product_id = b.product_id where c.code = '2000000000097') = 14000 + 22000,
  'Only the 22 accepted milk packs were added');
select pg_temp.expect_error($$select receive_goods((select id from locations limit 1), null, (select id from shipments where code = 'SHP-CHAI01'),
  '', '', '[{"product_id":"00000000-0000-0000-0000-000000000000","received_packs":1,"resolution":"matched"}]', '')$$,
  'already received', 'A shipment cannot be received twice');
reset role;

-- ---------------------------------------------------------------------------
\echo '--- Workflow 2: warehouse -> outlet transfer (Mode B)'
select pg_temp.as_user('tandoor.outlet@stocksetu.demo');
select pg_temp.expect_error($$select dispatch_transfer((select id from transfers where code = 'TRF-AND001'))$$,
  'not found', 'Outlet cannot dispatch from the warehouse');
select pg_temp.expect((select receive_transfer(
  (select id from transfers where code = 'TRF-AND001'),
  (select jsonb_agg(jsonb_build_object('line_id', tl.id, 'qty_received',
     case when b.code = '2000000000080' then tl.qty_packs - 1 else tl.qty_packs end))
   from transfer_lines tl join barcodes b on b.product_id = tl.product_id
   where tl.transfer_id = (select id from transfers where code = 'TRF-AND001')))) = 'discrepancy',
  'Paneer 6 sent / 5 received is flagged');
select pg_temp.expect((select qty_base from stock_balances b join barcodes c on c.product_id = b.product_id where c.code = '2000000000080') = 3000 + 3000 + 5000,
  'Andheri paneer = opening 3 + earlier 3 + 5 received');
reset role;

select pg_temp.as_user('tandoor.warehouse@stocksetu.demo');
select dispatch_transfer((select id from transfers where code = 'TRF-BAN002'));
select pg_temp.expect((select status from transfers where code = 'TRF-BAN002') = 'in_transit', 'Requested transfer dispatched by warehouse');
select pg_temp.expect_error($$select dispatch_transfer((select id from transfers where code = 'TRF-BAN002'))$$,
  'already dispatched', 'Cannot dispatch twice');
reset role;

select pg_temp.as_user('tandoor@stocksetu.demo');
select pg_temp.expect((select count(*) from stock_balances b join locations l on l.id = b.location_id
  where l.name = 'Outlet Bandra' and b.product_id = (select product_id from barcodes where code = '2000000000073')) = 0,
  'In-transit stock is not counted at the destination yet');
select pg_temp.expect_error($$select receive_transfer((select id from transfers where code = 'TRF-BAN002'),
  (select jsonb_agg(jsonb_build_object('line_id', id, 'qty_received', qty_packs + 1)) from transfer_lines
   where transfer_id = (select id from transfers where code = 'TRF-BAN002')))$$,
  'cannot be more', 'Cannot receive more than was sent');
reset role;

-- ---------------------------------------------------------------------------
\echo '--- Workflow 4: PO -> supplier accepts part -> dispatch -> receive (Mode C + D)'
select pg_temp.as_user('sharma.staff@stocksetu.demo');
select pg_temp.expect((select respond_po(
  (select id from purchase_orders where number = 'PO-0002'),
  (select jsonb_agg(jsonb_build_object('line_id', id, 'qty_accepted', case when product_name like 'Amul Ghee%' then 4 else qty_packs end))
   from po_lines where po_id = (select id from purchase_orders where number = 'PO-0002')),
  false, 'Only 4 ghee in stock')) = 'partially_accepted', 'Supplier partially accepts');
select dispatch_shipment(
  (select supplier_org_id from purchase_orders where number = 'PO-0002'),
  (select id from customers where name = 'Spice Route Kitchens'),
  null,
  (select id from purchase_orders where number = 'PO-0002'),
  (select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty_packs', qty_accepted, 'rate_paise', rate_paise, 'po_line_id', id))
   from po_lines where po_id = (select id from purchase_orders where number = 'PO-0002')),
  'Truck MH04 1234');
select pg_temp.expect((select status from purchase_orders where number = 'PO-0002') = 'dispatched', 'PO marked dispatched');
reset role;

select pg_temp.as_user('sharma@stocksetu.demo');
select pg_temp.expect((select sum(case when kind = 'debit' then amount_paise else -amount_paise end) from khata_entries k
  join customers c on c.id = k.customer_id where c.name = 'Spice Route Kitchens')
  = 1845000 - 1000000 + 2410380 + round(24*15200*1.05) + round(4*64000*1.12) + round(10*8800*1.05) + round(20*2700*1.0),
  'Dispatch posted the invoice (with GST) to the khata');
reset role;

select pg_temp.as_user('spice.kitchen@stocksetu.demo');
select pg_temp.expect_error($$select receive_goods((select id from locations where name = 'Main Store'), null, null, 'x', '',
  '[{"product_id":"00000000-0000-0000-0000-000000000000","received_packs":1,"resolution":"matched"}]', '')$$,
  'cannot receive at that location', 'Kitchen user cannot receive at the main store');
reset role;

select pg_temp.as_user('spice.store@stocksetu.demo');
select pg_temp.expect_error($$select receive_goods((select id from locations where name = 'Main Store'),
  (select id from purchase_orders where number = 'PO-0001'), (select id from shipments where code = 'SHP-SPICE1'), 'Sharma', '',
  (select jsonb_agg(jsonb_build_object('product_id', product_id, 'expected_packs', qty_packs, 'received_packs', qty_packs + 2,
     'accepted_packs', qty_packs + 2, 'resolution', 'extra_accepted')) from shipment_lines
   where shipment_id = (select id from shipments where code = 'SHP-SPICE1')), '')$$,
  'needs an admin', 'Warehouse staff cannot accept an over-delivery');
select receive_goods((select id from locations where name = 'Main Store'),
  (select id from purchase_orders where number = 'PO-0001'), (select id from shipments where code = 'SHP-SPICE1'), 'Sharma Traders', 'INV-2610-0001',
  (select jsonb_agg(jsonb_build_object('product_id', product_id, 'expected_packs', qty_packs,
     'received_packs', case when qty_packs = 100 then 98 else qty_packs end,
     'accepted_packs', case when qty_packs = 100 then 98 else qty_packs end,
     'rate_paise', rate_paise,
     'resolution', case when qty_packs = 100 then 'short_open' else 'matched' end)) from shipment_lines
   where shipment_id = (select id from shipments where code = 'SHP-SPICE1')), 'Dal 2 short');
select pg_temp.expect((select status from purchase_orders where number = 'PO-0001') = 'partially_received', '98 of 100 dal: PO stays partially received');
select pg_temp.expect((select qty_base from stock_balances b join locations l on l.id = b.location_id
  where l.name = 'Main Store' and b.product_id = (select product_id from barcodes where code = '2000000000011')) = (25 + 98) * 1000,
  'Main store dal = 25 opening + 98 accepted');
select pg_temp.expect((select cost_paise from product_costs where product_id = (select product_id from barcodes where code = '2000000000011')) = 15800,
  'Last purchase price recorded for the buyer');
reset role;

-- ---------------------------------------------------------------------------
\echo '--- Workflow 3: count turns the gap into actual usage'
select pg_temp.as_user('spice.kitchen@stocksetu.demo');
insert into counts (org_id, location_id, started_by)
  select org_id, id, auth.uid() from locations where name = 'Kitchen';
insert into count_lines (count_id, product_id, system_qty, counted_qty)
  select c.id, b.product_id, b.qty_base, b.qty_base - 500
  from counts c join stock_balances b on b.location_id = c.location_id
  where c.status = 'open' and b.product_id = (select product_id from barcodes where code = '2000000000080');
select pg_temp.expect((select complete_count((select id from counts where status = 'open'))) = 1, 'Completing a count posts one adjustment');
select pg_temp.expect((select qty_base from stock_movements where reason = 'count' order by created_at desc limit 1) = -500,
  'Paneer 500 g gap recorded as usage');
reset role;

-- ---------------------------------------------------------------------------
\echo '--- Admin powers'
select pg_temp.as_user('tandoor.warehouse@stocksetu.demo');
select pg_temp.expect_error($$select add_member_by_email((select id from organisations where name = 'Tandoor House'), 'chai@stocksetu.demo', 'staff', null)$$,
  'only an admin', 'Warehouse manager cannot add team members');
reset role;

-- ---------------------------------------------------------------------------
\echo '--- Plans, limits and accounts'
select pg_temp.as_user('tandoor@stocksetu.demo');
select pg_temp.expect_error($$update organisations set modules = array['inventory','transfers','procurement'] where name = 'Tandoor House'$$,
  'managed by the stocksetu team', 'Business admin cannot change their own modules');
select pg_temp.expect_error($$update organisations set max_users = 999 where name = 'Tandoor House'$$,
  'managed by the stocksetu team', 'Business admin cannot raise their own user limit');
update organisations set city = 'Navi Mumbai' where name = 'Tandoor House';
reset role;
select pg_temp.expect((select city from organisations where name = 'Tandoor House') = 'Navi Mumbai', 'Business admin can edit business details');

select pg_temp.as_user('admin@stocksetu.demo');
update organisations set modules = array['inventory', 'transfers', 'food_cost'], max_users = 4 where name = 'Tandoor House';
reset role;
select pg_temp.expect((select modules from organisations where name = 'Tandoor House') = array['inventory', 'transfers', 'food_cost'],
  'Platform admin can change modules');

select pg_temp.as_user('haldiram.admin@stocksetu.demo');
select pg_temp.expect((select count(*) from organisations where name = 'Haldiram') = 1, 'Haldiram admin sees Haldiram');
select create_user_account((select id from organisations where name = 'Haldiram'), 'new.cashier@stocksetu.demo', 'New Cashier',
  'Welcome@123', 'staff', array[(select id from locations where name = 'Outlet Noida Sector 18')]);
select pg_temp.expect((select count(*) from org_members m join profiles p on p.id = m.user_id where p.email = 'new.cashier@stocksetu.demo') = 1,
  'Business admin created a login for a cashier');
select pg_temp.expect_error($$select create_user_account((select id from organisations where name = 'Haldiram'), 'x@stocksetu.demo', 'X', 'short', 'staff', null)$$,
  'at least 8', 'New passwords must be 8+ characters');
select pg_temp.expect_error($$select create_user_account((select id from organisations where name = 'Haldiram'), 'y@stocksetu.demo', 'Y', 'Welcome@123', 'supplier_staff', null)$$,
  'does not fit', 'Supplier roles cannot be given in a business');
select set_user_password((select id from profiles where email = 'haldiram.cp@stocksetu.demo'), 'NewPass@123');
select pg_temp.expect_error($$select set_user_password(pg_temp.uid('chai@stocksetu.demo'), 'NewPass@123')$$,
  'own team', 'Cannot reset the password of someone outside your business');
select pg_temp.expect_error($$select platform_create_org('Fake Co', 'A', array['inventory'], 'standard', 5, 2, '[{"name":"Shop","kind":"store"}]',
  'boss@fake.demo', 'Boss', 'Welcome@123', null, null)$$, 'platform admins only', 'Only platform admins can provision a business');
reset role;
select set_config('request.jwt.claim.sub', '', false);
update organisations set max_users = (select count(*) from org_members m where m.org_id = organisations.id) where name = 'Haldiram';
select pg_temp.as_user('haldiram.admin@stocksetu.demo');
select pg_temp.expect_error($$select create_user_account((select id from organisations where name = 'Haldiram'), 'one.more@stocksetu.demo', 'One More', 'Welcome@123', 'staff', null)$$,
  'user limit reached', 'User limit is enforced');
select pg_temp.expect_error($t$do $q$ begin
    insert into locations (org_id, name, kind) select id, 'Outlet Gurgaon', 'outlet' from organisations where name = 'Haldiram';
    insert into locations (org_id, name, kind) select id, 'Outlet Dwarka', 'outlet' from organisations where name = 'Haldiram';
    insert into locations (org_id, name, kind) select id, 'Outlet Rohini', 'outlet' from organisations where name = 'Haldiram';
  end $q$$t$,
  'location limit reached', 'Location limit is enforced');
reset role;

select pg_temp.as_user('admin@stocksetu.demo');
select platform_create_org('Bikaner Bites', 'B', array['inventory', 'transfers'], 'starter', 5, 3,
  '[{"name":"Godown","kind":"warehouse"},{"name":"Outlet 1","kind":"outlet"}]', 'bikaner@stocksetu.demo', 'Bikaner Owner', 'Welcome@123', 'Jaipur', null);
reset role;
select pg_temp.expect((select count(*) from org_members m join organisations o on o.id = m.org_id where o.name = 'Bikaner Bites' and m.role = 'admin') = 1,
  'Platform admin provisioned a business with its admin');
select pg_temp.expect((select encrypted_password = extensions.crypt('Welcome@123', encrypted_password) from auth.users where email = 'bikaner@stocksetu.demo'),
  'Provisioned admin can log in with the chosen password');

select pg_temp.as_user('admin@stocksetu.demo');
select platform_link_supplier((select id from organisations where name = 'Bikaner Bites'), (select id from organisations where name = 'Agarwal Dairy'),
  (select id from locations where name = 'Godown'));
insert into locations (org_id, name, kind) select id, 'Outlet 2', 'outlet' from organisations where name = 'Bikaner Bites';
reset role;
select pg_temp.expect((select count(*) from suppliers s join organisations o on o.id = s.org_id where o.name = 'Bikaner Bites' and s.name = 'Agarwal Dairy') = 1
  and (select count(*) from customers c join organisations o on o.id = c.org_id where o.name = 'Agarwal Dairy' and c.name = 'Bikaner Bites') = 1,
  'Platform admin connected a supplier to a business (both directories)');
select pg_temp.expect((select count(*) from locations l join organisations o on o.id = l.org_id where o.name = 'Bikaner Bites') = 3,
  'Platform admin can add a location to any business');
select pg_temp.as_user('haldiram.admin@stocksetu.demo');
select pg_temp.expect_error($$select platform_link_supplier((select id from organisations where name = 'Haldiram'), null, null)$$,
  'platform admins only', 'Business admin cannot link suppliers');
reset role;

-- Haldiram supplier sees Haldiram's PO; Haldiram outlet can't see the warehouse
select pg_temp.as_user('agarwal.staff@stocksetu.demo');
select pg_temp.expect((select count(*) from purchase_orders where number = 'PO-0003') = 1, 'Agarwal Dairy staff sees PO-0003 from Haldiram');
select pg_temp.expect((select count(*) from purchase_orders) = 1, 'Agarwal Dairy sees only its own POs');
reset role;
select pg_temp.as_user('haldiram.noida@stocksetu.demo');
select pg_temp.expect((select count(distinct location_id) from stock_balances) = 1, 'Noida outlet manager sees only Noida stock');
reset role;
\echo '=== ALL CHECKS PASSED'
