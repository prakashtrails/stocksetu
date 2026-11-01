-- Workflow functions. Each runs as one transaction, checks the caller's
-- membership/role/location itself, and writes the audit trail.

-- Per-organisation last purchase cost (shared catalogue products must not share prices).
create table public.product_costs (
  org_id uuid not null references public.organisations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  cost_paise bigint not null check (cost_paise >= 0),
  updated_at timestamptz not null default now(),
  primary key (org_id, product_id)
);
alter table public.product_costs enable row level security;
create policy product_costs_select on public.product_costs for select to authenticated
  using (app.is_member(org_id) or app.is_platform_admin());
create policy product_costs_write on public.product_costs for all to authenticated
  using (app.has_role(org_id, array['admin', 'warehouse', 'supplier_admin']::public.member_role[]))
  with check (app.has_role(org_id, array['admin', 'warehouse', 'supplier_admin']::public.member_role[]));

alter table public.transfers alter column code
  set default 'TRF-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

create or replace function app.set_po_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null or new.number = '' then
    new.number := 'PO-' || lpad((
      select count(*) + 1 from public.purchase_orders where buyer_org_id = new.buyer_org_id)::text, 4, '0');
  end if;
  return new;
end;
$$;
alter table public.purchase_orders alter column number drop not null;
create trigger purchase_orders_number before insert on public.purchase_orders
  for each row execute function app.set_po_number();
alter table public.purchase_orders add constraint purchase_orders_number_present check (number is not null);

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function app.audit(p_org uuid, p_action text, p_entity text, p_id uuid, p_details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (org_id, actor, action, entity, entity_id, details)
  values (p_org, auth.uid(), p_action, p_entity, p_id, coalesce(p_details, '{}'));
$$;

create or replace function app.require(p_ok boolean, p_message text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception '%', p_message using errcode = 'P0001';
  end if;
end;
$$;

create or replace function app.balance(p_location uuid, p_product uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(qty_base), 0)::bigint from public.stock_movements
  where location_id = p_location and product_id = p_product;
$$;

create or replace function app.cost_of(p_org uuid, p_product uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select cost_paise from public.product_costs where org_id = p_org and product_id = p_product),
    (select cost_paise from public.products where id = p_product), 0);
$$;

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------
create or replace function public.create_organisation(p_name text, p_mode public.org_mode, p_locations jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_kind public.org_kind := case when p_mode = 'D' then 'supplier' else 'business' end;
  v_modules text[] := case p_mode
    when 'A' then array['inventory']
    when 'B' then array['inventory', 'transfers']
    when 'C' then array['inventory', 'transfers', 'procurement', 'food_cost']
    else array['supplier', 'khata', 'supplier_inventory'] end;
  v_loc jsonb;
begin
  perform app.require(auth.uid() is not null, 'Please log in first');
  perform app.require(length(trim(coalesce(p_name, ''))) between 1 and 120, 'Enter a business name');
  perform app.require(jsonb_array_length(coalesce(p_locations, '[]')) > 0, 'Add at least one location');

  insert into public.organisations (name, kind, mode, modules, created_by)
  values (trim(p_name), v_kind, p_mode, v_modules, auth.uid()) returning id into v_org;

  insert into public.org_members (org_id, user_id, role)
  values (v_org, auth.uid(), case when v_kind = 'supplier' then 'supplier_admin' else 'admin' end::public.member_role);

  for v_loc in select * from jsonb_array_elements(p_locations) loop
    insert into public.locations (org_id, name, kind)
    values (v_org, trim(v_loc ->> 'name'), (v_loc ->> 'kind')::public.location_kind);
  end loop;

  perform app.audit(v_org, 'organisation.created', 'organisation', v_org, jsonb_build_object('mode', p_mode));
  return v_org;
end;
$$;

create or replace function public.add_member_by_email(p_org uuid, p_email text, p_role public.member_role, p_locations uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_kind public.org_kind;
begin
  perform app.require(app.is_org_admin(p_org) or app.is_platform_admin(), 'Only an admin can add team members');
  select kind into v_kind from public.organisations where id = p_org;
  perform app.require(
    (v_kind = 'supplier') = (p_role in ('supplier_admin', 'supplier_staff')),
    'That role does not fit this type of organisation');
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  perform app.require(v_user is not null, 'No account with that email yet. Ask them to sign up first.');
  perform app.require(
    p_locations is null or not exists (
      select 1 from unnest(p_locations) l where not exists (
        select 1 from public.locations x where x.id = l and x.org_id = p_org)),
    'Pick locations from this organisation');

  insert into public.org_members (org_id, user_id, role, location_ids)
  values (p_org, v_user, p_role, nullif(p_locations, '{}'))
  on conflict (org_id, user_id) do update set role = excluded.role, location_ids = excluded.location_ids;

  perform app.audit(p_org, 'member.saved', 'user', v_user, jsonb_build_object('role', p_role, 'locations', p_locations));
  return v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Offline scan queue sync: idempotent by client-generated event id
-- ---------------------------------------------------------------------------
create or replace function public.post_stock_events(p_events jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event jsonb;
  v_result jsonb := '[]';
  v_org uuid;
  v_id uuid;
begin
  perform app.require(auth.uid() is not null, 'Please log in first');
  for v_event in select * from jsonb_array_elements(coalesce(p_events, '[]')) loop
    v_id := (v_event ->> 'id')::uuid;
    begin
      if exists (select 1 from public.stock_movements where id = v_id) then
        v_result := v_result || jsonb_build_object('id', v_id, 'status', 'duplicate');
        continue;
      end if;
      perform app.require(app.can_location((v_event ->> 'location_id')::uuid), 'You cannot post stock at that location');
      perform app.require(v_event ->> 'reason' in ('scan_in', 'scan_out', 'consumption', 'wastage', 'opening'), 'Unsupported reason');
      select org_id into v_org from public.locations where id = (v_event ->> 'location_id')::uuid;

      insert into public.stock_movements (id, org_id, location_id, product_id, qty_base, reason, note, unit_cost_paise, actor, occurred_at)
      values (v_id, v_org, (v_event ->> 'location_id')::uuid, (v_event ->> 'product_id')::uuid,
        (v_event ->> 'qty_base')::bigint, v_event ->> 'reason', nullif(v_event ->> 'note', ''),
        app.cost_of(v_org, (v_event ->> 'product_id')::uuid), auth.uid(),
        coalesce((v_event ->> 'occurred_at')::timestamptz, now()));
      v_result := v_result || jsonb_build_object('id', v_id, 'status', 'posted');
    exception when others then
      v_result := v_result || jsonb_build_object('id', v_id, 'status', 'error', 'message', sqlerrm);
    end;
  end loop;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Counts: the counted quantity becomes the truth; the gap is posted as 'count'
-- ---------------------------------------------------------------------------
create or replace function public.complete_count(p_count uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count public.counts;
  v_line record;
  v_diff bigint;
  v_posted int := 0;
begin
  select * into v_count from public.counts where id = p_count for update;
  perform app.require(v_count.id is not null and app.can_location(v_count.location_id), 'Count not found');
  perform app.require(v_count.status = 'open', 'This count is already completed');

  for v_line in select * from public.count_lines where count_id = p_count and counted_qty is not null loop
    v_diff := v_line.counted_qty - app.balance(v_count.location_id, v_line.product_id);
    if v_diff <> 0 then
      insert into public.stock_movements (org_id, location_id, product_id, qty_base, reason, ref_type, ref_id, unit_cost_paise, actor)
      values (v_count.org_id, v_count.location_id, v_line.product_id, v_diff, 'count', 'count', p_count,
        app.cost_of(v_count.org_id, v_line.product_id), auth.uid());
      v_posted := v_posted + 1;
    end if;
  end loop;

  update public.counts set status = 'completed', completed_by = auth.uid(), completed_at = now() where id = p_count;
  perform app.audit(v_count.org_id, 'count.completed', 'count', p_count, jsonb_build_object('adjusted_lines', v_posted));
  return v_posted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal transfers: dispatch moves stock into transit, receipt lands it
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_transfer(p_transfer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_t public.transfers;
  v_line record;
begin
  select * into v_t from public.transfers where id = p_transfer for update;
  perform app.require(v_t.id is not null and app.can_location(v_t.from_location_id), 'Transfer not found');
  perform app.require(app.has_role(v_t.org_id, array['admin', 'warehouse']::public.member_role[]), 'Only warehouse staff can dispatch');
  perform app.require(v_t.status in ('draft', 'requested'), 'This transfer was already dispatched');
  perform app.require(exists (select 1 from public.transfer_lines where transfer_id = p_transfer), 'Add at least one product');

  for v_line in
    select tl.*, p.pack_qty from public.transfer_lines tl join public.products p on p.id = tl.product_id
    where tl.transfer_id = p_transfer
  loop
    insert into public.stock_movements (org_id, location_id, product_id, qty_base, reason, ref_type, ref_id, unit_cost_paise, actor)
    values (v_t.org_id, v_t.from_location_id, v_line.product_id, -(v_line.qty_packs * v_line.pack_qty),
      'transfer_out', 'transfer', p_transfer, app.cost_of(v_t.org_id, v_line.product_id), auth.uid());
  end loop;

  update public.transfers set status = 'in_transit', dispatched_by = auth.uid(), dispatched_at = now() where id = p_transfer;
  perform app.audit(v_t.org_id, 'transfer.dispatched', 'transfer', p_transfer, jsonb_build_object('code', v_t.code));
end;
$$;

create or replace function public.receive_transfer(p_transfer uuid, p_lines jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_t public.transfers;
  v_line record;
  v_received int;
  v_mismatch boolean := false;
  v_status text;
begin
  select * into v_t from public.transfers where id = p_transfer for update;
  perform app.require(v_t.id is not null and app.can_location(v_t.to_location_id), 'Transfer not found at your location');
  perform app.require(v_t.status = 'in_transit', 'This transfer is not in transit');

  for v_line in
    select tl.*, p.pack_qty from public.transfer_lines tl join public.products p on p.id = tl.product_id
    where tl.transfer_id = p_transfer
  loop
    select (x ->> 'qty_received')::int into v_received
      from jsonb_array_elements(p_lines) x where (x ->> 'line_id')::uuid = v_line.id;
    v_received := coalesce(v_received, 0);
    perform app.require(v_received between 0 and v_line.qty_packs,
      'Received quantity cannot be more than what was sent');
    if v_received <> v_line.qty_packs then v_mismatch := true; end if;

    update public.transfer_lines set qty_received = v_received where id = v_line.id;
    if v_received > 0 then
      insert into public.stock_movements (org_id, location_id, product_id, qty_base, reason, ref_type, ref_id, unit_cost_paise, actor)
      values (v_t.org_id, v_t.to_location_id, v_line.product_id, v_received * v_line.pack_qty,
        'transfer_in', 'transfer', p_transfer, app.cost_of(v_t.org_id, v_line.product_id), auth.uid());
    end if;
  end loop;

  v_status := case when v_mismatch then 'discrepancy' else 'received' end;
  update public.transfers set status = v_status, received_by = auth.uid(), received_at = now() where id = p_transfer;
  perform app.audit(v_t.org_id, 'transfer.received', 'transfer', p_transfer, jsonb_build_object('status', v_status));
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------
create or replace function public.send_po(p_po uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_po public.purchase_orders;
begin
  select * into v_po from public.purchase_orders where id = p_po for update;
  perform app.require(v_po.id is not null and app.has_role(v_po.buyer_org_id, array['admin', 'warehouse']::public.member_role[]),
    'Only an admin or warehouse manager can release a PO');
  perform app.require(v_po.status = 'draft', 'This PO was already sent');
  perform app.require(exists (select 1 from public.po_lines where po_id = p_po), 'Add at least one product');

  update public.purchase_orders
    set status = 'sent', sent_at = now(),
        supplier_org_id = (select linked_org_id from public.suppliers where id = v_po.supplier_id)
    where id = p_po;
  perform app.audit(v_po.buyer_org_id, 'po.sent', 'purchase_order', p_po, jsonb_build_object('number', v_po.number));
end;
$$;

create or replace function public.respond_po(p_po uuid, p_lines jsonb, p_reject boolean, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_po public.purchase_orders;
  v_line record;
  v_acc int;
  v_full boolean := true;
  v_any boolean := false;
  v_status text;
begin
  select * into v_po from public.purchase_orders where id = p_po for update;
  perform app.require(v_po.id is not null and v_po.supplier_org_id is not null
    and app.has_role(v_po.supplier_org_id, array['supplier_admin', 'supplier_staff']::public.member_role[]), 'Order not found');
  perform app.require(v_po.status = 'sent', 'This order was already answered');

  if p_reject then
    v_status := 'rejected';
    update public.po_lines set qty_accepted = 0 where po_id = p_po;
  else
    for v_line in select * from public.po_lines where po_id = p_po loop
      select (x ->> 'qty_accepted')::int into v_acc
        from jsonb_array_elements(p_lines) x where (x ->> 'line_id')::uuid = v_line.id;
      v_acc := coalesce(v_acc, v_line.qty_packs);
      perform app.require(v_acc between 0 and v_line.qty_packs, 'Accepted quantity must be between 0 and the ordered quantity');
      update public.po_lines set qty_accepted = v_acc where id = v_line.id;
      if v_acc < v_line.qty_packs then v_full := false; end if;
      if v_acc > 0 then v_any := true; end if;
    end loop;
    perform app.require(v_any, 'Accept at least one line, or reject the order');
    v_status := case when v_full then 'accepted' else 'partially_accepted' end;
  end if;

  update public.purchase_orders set status = v_status, responded_at = now(), supplier_note = nullif(trim(p_note), '') where id = p_po;
  perform app.audit(v_po.supplier_org_id, 'po.' || v_status, 'purchase_order', p_po, jsonb_build_object('number', v_po.number));
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supplier dispatch: shipment + barcode, optional stock-out, khata debit
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_shipment(
  p_supplier_org uuid, p_customer uuid, p_from_location uuid, p_po uuid, p_lines jsonb, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_customer public.customers;
  v_po public.purchase_orders;
  v_shipment uuid;
  v_line jsonb;
  v_product public.products;
  v_qty int;
  v_rate bigint;
  v_total bigint := 0;
  v_buyer_org uuid;
  v_buyer_loc uuid;
  v_invoice text;
begin
  perform app.require(app.has_role(p_supplier_org, array['supplier_admin', 'supplier_staff']::public.member_role[]),
    'Only supplier staff can dispatch');
  select * into v_customer from public.customers where id = p_customer and org_id = p_supplier_org;
  perform app.require(v_customer.id is not null, 'Pick one of your customers');
  perform app.require(jsonb_array_length(coalesce(p_lines, '[]')) > 0, 'Add at least one product');
  if p_from_location is not null then
    perform app.require(exists (select 1 from public.locations where id = p_from_location and org_id = p_supplier_org)
      and app.can_location(p_from_location), 'Pick one of your locations');
  end if;

  v_buyer_org := v_customer.linked_org_id;
  v_buyer_loc := v_customer.default_location_id;
  if p_po is not null then
    select * into v_po from public.purchase_orders where id = p_po for update;
    perform app.require(v_po.id is not null and v_po.supplier_org_id = p_supplier_org
      and v_po.status in ('accepted', 'partially_accepted', 'dispatched'), 'That order is not ready to dispatch');
    perform app.require(v_customer.linked_org_id = v_po.buyer_org_id, 'That order belongs to another customer');
    v_buyer_org := v_po.buyer_org_id;
    v_buyer_loc := v_po.location_id;
  end if;

  select 'INV-' || to_char(now(), 'YYMM') || '-' || lpad((count(*) + 1)::text, 4, '0') into v_invoice
    from public.shipments where supplier_org_id = p_supplier_org;

  insert into public.shipments (code, invoice_number, supplier_org_id, customer_id, buyer_org_id, buyer_location_id,
    from_location_id, po_id, note, dispatched_by)
  values ('SHP-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)), v_invoice, p_supplier_org, p_customer,
    v_buyer_org, v_buyer_loc, p_from_location, p_po, nullif(trim(p_note), ''), auth.uid())
  returning id into v_shipment;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_product from public.products where id = (v_line ->> 'product_id')::uuid;
    perform app.require(v_product.id is not null, 'Unknown product');
    v_qty := (v_line ->> 'qty_packs')::int;
    perform app.require(v_qty > 0, 'Quantities must be more than zero');
    v_rate := coalesce((v_line ->> 'rate_paise')::bigint, 0);

    insert into public.shipment_lines (shipment_id, po_line_id, product_id, product_name, pack_label, hsn, qty_packs, rate_paise, gst_bp)
    values (v_shipment, nullif(v_line ->> 'po_line_id', '')::uuid, v_product.id, v_product.name, v_product.pack_label,
      v_product.hsn, v_qty, v_rate, v_product.gst_bp);

    if nullif(v_line ->> 'po_line_id', '') is not null then
      update public.po_lines set qty_dispatched = qty_dispatched + v_qty
        where id = (v_line ->> 'po_line_id')::uuid and po_id = p_po;
    end if;

    if p_from_location is not null then
      insert into public.stock_movements (org_id, location_id, product_id, qty_base, reason, ref_type, ref_id, unit_cost_paise, actor)
      values (p_supplier_org, p_from_location, v_product.id, -(v_qty * v_product.pack_qty), 'dispatch', 'shipment', v_shipment,
        app.cost_of(p_supplier_org, v_product.id), auth.uid());
    end if;

    v_total := v_total + round(v_qty * v_rate * (10000 + v_product.gst_bp) / 10000.0)::bigint;
  end loop;

  if p_po is not null then
    update public.purchase_orders set status = 'dispatched' where id = p_po;
  end if;

  if v_total > 0 then
    insert into public.khata_entries (supplier_org_id, customer_id, kind, amount_paise, ref_type, ref_id, note, created_by)
    values (p_supplier_org, p_customer, 'debit', v_total, 'shipment', v_shipment, 'Invoice ' || v_invoice, auth.uid());
  end if;

  perform app.audit(p_supplier_org, 'shipment.dispatched', 'shipment', v_shipment,
    jsonb_build_object('invoice', v_invoice, 'total_paise', v_total));
  return v_shipment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Goods receipt: expected vs received, permitted resolutions, stock-in
-- ---------------------------------------------------------------------------
create or replace function public.receive_goods(
  p_location uuid, p_po uuid, p_shipment uuid, p_supplier_name text, p_bill text, p_lines jsonb, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_receipt uuid;
  v_line jsonb;
  v_product public.products;
  v_exp int; v_rec int; v_acc int; v_rej int;
  v_res text;
  v_rate bigint;
  v_discrepancy boolean := false;
  v_shipment public.shipments;
  v_po public.purchase_orders;
begin
  perform app.require(app.can_location(p_location), 'You cannot receive at that location');
  select org_id into v_org from public.locations where id = p_location;
  perform app.require(jsonb_array_length(coalesce(p_lines, '[]')) > 0, 'Add at least one product');

  if p_shipment is not null then
    select * into v_shipment from public.shipments where id = p_shipment for update;
    perform app.require(v_shipment.id is not null and v_shipment.buyer_org_id = v_org, 'Shipment not found');
    perform app.require(v_shipment.status = 'in_transit', 'This shipment was already received');
  end if;
  if p_po is not null then
    select * into v_po from public.purchase_orders where id = p_po for update;
    perform app.require(v_po.id is not null and v_po.buyer_org_id = v_org, 'Purchase order not found');
    perform app.require(v_po.status not in ('draft', 'rejected', 'cancelled', 'received'), 'This PO is not open for receiving');
  end if;

  insert into public.goods_receipts (org_id, location_id, po_id, shipment_id, supplier_name, bill_number, received_by, note)
  values (v_org, p_location, p_po, p_shipment, nullif(trim(p_supplier_name), ''), nullif(trim(p_bill), ''), auth.uid(), nullif(trim(p_note), ''))
  returning id into v_receipt;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_product from public.products where id = (v_line ->> 'product_id')::uuid;
    perform app.require(v_product.id is not null, 'Unknown product');
    v_exp := coalesce((v_line ->> 'expected_packs')::int, 0);
    v_rec := coalesce((v_line ->> 'received_packs')::int, 0);
    v_acc := coalesce((v_line ->> 'accepted_packs')::int, v_rec);
    v_rej := v_rec - v_acc;
    v_res := v_line ->> 'resolution';
    v_rate := coalesce((v_line ->> 'rate_paise')::bigint, 0);

    perform app.require(v_rec >= 0 and v_acc >= 0 and v_acc <= v_rec, 'Accepted quantity cannot exceed what arrived');
    perform app.require(v_res in ('matched', 'short_accepted', 'short_disputed', 'short_open', 'extra_accepted',
      'extra_rejected', 'damaged_rejected', 'unplanned'), 'Choose what to do about the difference');
    if v_exp > 0 and v_acc > v_exp then
      perform app.require(app.is_org_admin(v_org), 'Accepting more than ordered needs an admin');
    end if;
    if v_res <> 'matched' and v_res <> 'unplanned' then v_discrepancy := true; end if;

    insert into public.receipt_lines (receipt_id, product_id, expected_packs, received_packs, accepted_packs, rejected_packs, resolution, reason, rate_paise)
    values (v_receipt, v_product.id, v_exp, v_rec, v_acc, greatest(v_rej, 0), v_res, nullif(trim(v_line ->> 'reason'), ''), v_rate);

    if v_acc > 0 then
      insert into public.stock_movements (org_id, location_id, product_id, qty_base, reason, ref_type, ref_id, unit_cost_paise, actor)
      values (v_org, p_location, v_product.id, v_acc * v_product.pack_qty, 'receipt', 'goods_receipt', v_receipt,
        case when v_rate > 0 then v_rate else app.cost_of(v_org, v_product.id) end, auth.uid());
    end if;
    if v_rate > 0 then
      insert into public.product_costs (org_id, product_id, cost_paise) values (v_org, v_product.id, v_rate)
      on conflict (org_id, product_id) do update set cost_paise = excluded.cost_paise, updated_at = now();
    end if;

    if p_po is not null then
      update public.po_lines set qty_received = qty_received + v_acc
        where id = (select id from public.po_lines where po_id = p_po and product_id = v_product.id order by id limit 1);
    end if;
    if p_shipment is not null then
      update public.shipment_lines set qty_received = coalesce(qty_received, 0) + v_rec
        where id = (select id from public.shipment_lines where shipment_id = p_shipment and product_id = v_product.id order by id limit 1);
    end if;
  end loop;

  update public.goods_receipts set has_discrepancy = v_discrepancy where id = v_receipt;

  if p_shipment is not null then
    update public.shipments
      set status = case when v_discrepancy or exists (
            select 1 from public.shipment_lines where shipment_id = p_shipment and coalesce(qty_received, 0) <> qty_packs)
          then 'discrepancy' else 'received' end,
          received_at = now()
      where id = p_shipment;
  end if;
  if p_po is not null then
    update public.purchase_orders
      set status = case when exists (
            select 1 from public.po_lines where po_id = p_po and qty_received < coalesce(qty_accepted, qty_packs))
          then 'partially_received' else 'received' end
      where id = p_po;
  end if;

  perform app.audit(v_org, 'goods.received', 'goods_receipt', v_receipt, jsonb_build_object('discrepancy', v_discrepancy));
  return v_receipt;
end;
$$;

revoke all on function public.create_organisation, public.add_member_by_email, public.post_stock_events,
  public.complete_count, public.dispatch_transfer, public.receive_transfer, public.send_po, public.respond_po,
  public.dispatch_shipment, public.receive_goods from public, anon;
grant execute on function public.create_organisation, public.add_member_by_email, public.post_stock_events,
  public.complete_count, public.dispatch_transfer, public.receive_transfer, public.send_po, public.respond_po,
  public.dispatch_shipment, public.receive_goods to authenticated;
revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated;
