-- Row-level security: every table is scoped to organisation membership,
-- stock is additionally scoped to the member's permitted locations.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies can read memberships
-- without recursive RLS; all are read-only and pinned to an empty search_path)
-- ---------------------------------------------------------------------------
create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function app.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid());
$$;

create or replace function app.has_role(p_org uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = auth.uid() and role = any (p_roles));
$$;

create or replace function app.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_role(p_org, array['admin', 'supplier_admin']::public.member_role[]);
$$;

-- Member of the location's organisation AND the location is inside their scope.
create or replace function app.can_location(p_location uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.locations l
    join public.org_members m on m.org_id = l.org_id and m.user_id = auth.uid()
    where l.id = p_location
      and (m.location_ids is null or l.id = any (m.location_ids)));
$$;

-- Organisations a user may see by name: their own, and trading partners.
create or replace function app.is_related_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_member(p_org)
    or exists (select 1 from public.suppliers s where s.linked_org_id = p_org and app.is_member(s.org_id))
    or exists (select 1 from public.customers c where c.linked_org_id = p_org and app.is_member(c.org_id))
    or exists (select 1 from public.suppliers s where s.org_id = p_org and s.linked_org_id is not null and app.is_member(s.linked_org_id))
    or exists (select 1 from public.customers c where c.org_id = p_org and c.linked_org_id is not null and app.is_member(c.linked_org_id));
$$;

create or replace function app.can_see_po(p_po uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.purchase_orders po
    where po.id = p_po
      and (app.is_member(po.buyer_org_id)
        or (po.status <> 'draft' and po.supplier_org_id is not null and app.is_member(po.supplier_org_id))));
$$;

create or replace function app.can_see_shipment(p_shipment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shipments s
    where s.id = p_shipment
      and (app.is_member(s.supplier_org_id) or (s.buyer_org_id is not null and app.is_member(s.buyer_org_id))));
$$;

-- The signed-in user belongs to the organisation behind a supplier's customer record.
create or replace function app.is_linked_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.customers c
    where c.id = p_customer and c.linked_org_id is not null and app.is_member(c.linked_org_id));
$$;

create or replace function app.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members a
    join public.org_members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = p_user);
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles are created from auth.users automatically
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Append-only ledgers: never edited or deleted, only corrected by new rows
-- ---------------------------------------------------------------------------
create or replace function app.reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only; post a correcting entry instead', tg_table_name
    using errcode = 'P0001';
end;
$$;

create trigger stock_movements_append_only
  before update or delete on public.stock_movements
  for each row execute function app.reject_mutation();

create trigger khata_entries_append_only
  before update or delete on public.khata_entries
  for each row execute function app.reject_mutation();

-- A movement must belong to its location's organisation, and stock may not go
-- below zero except through a physical count (which sets the true quantity).
create or replace function app.check_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_balance bigint;
begin
  select org_id into v_org from public.locations where id = new.location_id;
  if v_org is null or v_org <> new.org_id then
    raise exception 'Location does not belong to this organisation' using errcode = 'P0001';
  end if;

  if new.qty_base < 0 and new.reason <> 'count' then
    perform pg_advisory_xact_lock(hashtextextended(new.location_id::text || new.product_id::text, 0));
    select coalesce(sum(qty_base), 0) into v_balance
      from public.stock_movements
      where location_id = new.location_id and product_id = new.product_id;
    if v_balance + new.qty_base < 0 then
      raise exception 'Not enough stock: % available, % requested', v_balance, -new.qty_base
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger stock_movements_check
  before insert on public.stock_movements
  for each row execute function app.check_stock_movement();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organisations enable row level security;
alter table public.org_members enable row level security;
alter table public.locations enable row level security;
alter table public.items enable row level security;
alter table public.products enable row level security;
alter table public.barcodes enable row level security;
alter table public.stock_movements enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_lines enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.po_lines enable row level security;
alter table public.customers enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_lines enable row level security;
alter table public.khata_entries enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.counts enable row level security;
alter table public.count_lines enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_lines enable row level security;
alter table public.sales enable row level security;
alter table public.min_levels enable row level security;
alter table public.audit_log enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or app.shares_org_with(id) or app.is_platform_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Users may change their name, never their platform-admin flag.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- organisations
create policy orgs_select on public.organisations for select to authenticated
  using (app.is_related_org(id) or app.is_platform_admin());
create policy orgs_update on public.organisations for update to authenticated
  using (app.is_org_admin(id) or app.is_platform_admin())
  with check (app.is_org_admin(id) or app.is_platform_admin());

-- org_members
create policy members_select on public.org_members for select to authenticated
  using (app.is_member(org_id) or app.is_platform_admin());
create policy members_insert on public.org_members for insert to authenticated
  with check (app.is_org_admin(org_id) or app.is_platform_admin());
create policy members_update on public.org_members for update to authenticated
  using (app.is_org_admin(org_id) or app.is_platform_admin())
  with check (app.is_org_admin(org_id) or app.is_platform_admin());
create policy members_delete on public.org_members for delete to authenticated
  using ((app.is_org_admin(org_id) and user_id <> auth.uid()) or app.is_platform_admin());

-- locations
create policy locations_select on public.locations for select to authenticated
  using (app.is_member(org_id) or app.is_platform_admin()
    or exists (select 1 from public.customers c where c.default_location_id = locations.id and app.is_member(c.org_id))
    or exists (select 1 from public.shipments s where s.buyer_location_id = locations.id and app.is_member(s.supplier_org_id))
    or exists (select 1 from public.purchase_orders po where po.location_id = locations.id and app.can_see_po(po.id)));
create policy locations_write on public.locations for insert to authenticated
  with check (app.is_org_admin(org_id));
create policy locations_update on public.locations for update to authenticated
  using (app.is_org_admin(org_id)) with check (app.is_org_admin(org_id));

-- catalogue (shared rows readable by every signed-in user)
create policy items_select on public.items for select to authenticated
  using (org_id is null or app.is_member(org_id) or app.is_platform_admin());
create policy items_insert on public.items for insert to authenticated
  with check ((org_id is null and app.is_platform_admin())
    or app.has_role(org_id, array['admin', 'warehouse', 'supplier_admin']::public.member_role[]));
create policy items_update on public.items for update to authenticated
  using ((org_id is null and app.is_platform_admin())
    or app.has_role(org_id, array['admin', 'warehouse', 'supplier_admin']::public.member_role[]));

create policy products_select on public.products for select to authenticated
  using (org_id is null or app.is_member(org_id) or app.is_platform_admin()
    or exists (select 1 from public.po_lines l where l.product_id = products.id and app.can_see_po(l.po_id))
    or exists (select 1 from public.shipment_lines l where l.product_id = products.id and app.can_see_shipment(l.shipment_id)));
create policy products_insert on public.products for insert to authenticated
  with check ((org_id is null and app.is_platform_admin())
    or app.has_role(org_id, array['admin', 'warehouse', 'supplier_admin']::public.member_role[]));
create policy products_update on public.products for update to authenticated
  using ((org_id is null and app.is_platform_admin())
    or app.has_role(org_id, array['admin', 'warehouse', 'supplier_admin']::public.member_role[]));

create policy barcodes_select on public.barcodes for select to authenticated
  using (org_id is null or app.is_member(org_id) or app.is_platform_admin());
-- Barcodes for shared products go into the shared map so every shop benefits.
create policy barcodes_insert on public.barcodes for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.products p
      where p.id = product_id
        and ((p.org_id is null and barcodes.org_id is null
              and exists (select 1 from public.org_members m where m.user_id = auth.uid()
                          and m.role in ('admin', 'warehouse', 'supplier_admin')))
          or (p.org_id is not null and barcodes.org_id = p.org_id
              and app.has_role(p.org_id, array['admin', 'warehouse', 'supplier_admin']::public.member_role[])))));

-- stock movements: location-scoped, insert only
create policy movements_select on public.stock_movements for select to authenticated
  using (app.can_location(location_id) or app.is_platform_admin());
create policy movements_insert on public.stock_movements for insert to authenticated
  with check (app.can_location(location_id) and actor = auth.uid()
    and reason in ('opening', 'scan_in', 'scan_out', 'consumption', 'sale', 'wastage', 'return', 'correction'));

-- transfers
create policy transfers_select on public.transfers for select to authenticated
  using (app.can_location(from_location_id) or app.can_location(to_location_id) or app.is_platform_admin());
create policy transfers_insert on public.transfers for insert to authenticated
  with check (app.is_member(org_id) and status in ('requested', 'draft')
    and (app.can_location(from_location_id) or app.can_location(to_location_id)));
create policy transfers_update on public.transfers for update to authenticated
  using (app.is_member(org_id) and status in ('requested', 'draft'))
  with check (app.is_member(org_id) and status in ('requested', 'draft', 'cancelled'));

create policy transfer_lines_all on public.transfer_lines for all to authenticated
  using (exists (select 1 from public.transfers t where t.id = transfer_id
    and (app.can_location(t.from_location_id) or app.can_location(t.to_location_id) or app.is_platform_admin())))
  with check (exists (select 1 from public.transfers t where t.id = transfer_id
    and t.status in ('requested', 'draft') and app.is_member(t.org_id)));

-- suppliers / customers directories
create policy suppliers_select on public.suppliers for select to authenticated
  using (app.is_member(org_id) or app.is_platform_admin());
create policy suppliers_write on public.suppliers for insert to authenticated
  with check (app.has_role(org_id, array['admin', 'warehouse']::public.member_role[]));
create policy suppliers_update on public.suppliers for update to authenticated
  using (app.has_role(org_id, array['admin', 'warehouse']::public.member_role[]));

create policy customers_select on public.customers for select to authenticated
  using (app.is_member(org_id) or app.is_platform_admin());
create policy customers_write on public.customers for insert to authenticated
  with check (app.is_org_admin(org_id));
create policy customers_update on public.customers for update to authenticated
  using (app.is_org_admin(org_id));

-- purchase orders: buyer edits drafts; supplier sees them once sent
create policy po_select on public.purchase_orders for select to authenticated
  using (app.can_see_po(id) or app.is_platform_admin());
create policy po_insert on public.purchase_orders for insert to authenticated
  with check (status = 'draft' and app.has_role(buyer_org_id, array['admin', 'warehouse']::public.member_role[]));
create policy po_update on public.purchase_orders for update to authenticated
  using (status = 'draft' and app.has_role(buyer_org_id, array['admin', 'warehouse']::public.member_role[]))
  with check (status in ('draft', 'cancelled'));

create policy po_lines_select on public.po_lines for select to authenticated
  using (app.can_see_po(po_id) or app.is_platform_admin());
create policy po_lines_write on public.po_lines for all to authenticated
  using (exists (select 1 from public.purchase_orders po where po.id = po_id and po.status = 'draft'
    and app.has_role(po.buyer_org_id, array['admin', 'warehouse']::public.member_role[])))
  with check (exists (select 1 from public.purchase_orders po where po.id = po_id and po.status = 'draft'
    and app.has_role(po.buyer_org_id, array['admin', 'warehouse']::public.member_role[])));

-- shipments: written only through dispatch/receive functions
create policy shipments_select on public.shipments for select to authenticated
  using (app.can_see_shipment(id) or app.is_platform_admin());
create policy shipment_lines_select on public.shipment_lines for select to authenticated
  using (app.can_see_shipment(shipment_id) or app.is_platform_admin());

-- khata: supplier writes payments; the linked customer can read its own balance
create policy khata_select on public.khata_entries for select to authenticated
  using (app.is_member(supplier_org_id) or app.is_platform_admin() or app.is_linked_customer(customer_id));
create policy khata_insert_payment on public.khata_entries for insert to authenticated
  with check (kind = 'credit' and created_by = auth.uid() and app.is_org_admin(supplier_org_id)
    and exists (select 1 from public.customers c where c.id = customer_id and c.org_id = supplier_org_id));

-- goods receipts: written through receive_goods()
create policy receipts_select on public.goods_receipts for select to authenticated
  using (app.can_location(location_id) or app.is_platform_admin());
create policy receipt_lines_select on public.receipt_lines for select to authenticated
  using (exists (select 1 from public.goods_receipts r where r.id = receipt_id
    and (app.can_location(r.location_id) or app.is_platform_admin())));

-- counts
create policy counts_select on public.counts for select to authenticated
  using (app.can_location(location_id) or app.is_platform_admin());
create policy counts_insert on public.counts for insert to authenticated
  with check (app.can_location(location_id) and status = 'open' and started_by = auth.uid());
create policy count_lines_select on public.count_lines for select to authenticated
  using (exists (select 1 from public.counts c where c.id = count_id
    and (app.can_location(c.location_id) or app.is_platform_admin())));
create policy count_lines_write on public.count_lines for all to authenticated
  using (exists (select 1 from public.counts c where c.id = count_id and c.status = 'open' and app.can_location(c.location_id)))
  with check (exists (select 1 from public.counts c where c.id = count_id and c.status = 'open' and app.can_location(c.location_id)));

-- recipes, sales, minimum levels
create policy recipes_select on public.recipes for select to authenticated
  using (app.is_member(org_id) or app.is_platform_admin());
create policy recipes_write on public.recipes for all to authenticated
  using (app.has_role(org_id, array['admin', 'outlet']::public.member_role[]))
  with check (app.has_role(org_id, array['admin', 'outlet']::public.member_role[]));
create policy recipe_lines_select on public.recipe_lines for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and (app.is_member(r.org_id) or app.is_platform_admin())));
create policy recipe_lines_write on public.recipe_lines for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id
    and app.has_role(r.org_id, array['admin', 'outlet']::public.member_role[])))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id
    and app.has_role(r.org_id, array['admin', 'outlet']::public.member_role[])));

create policy sales_select on public.sales for select to authenticated
  using (app.can_location(location_id) or app.is_platform_admin());
create policy sales_insert on public.sales for insert to authenticated
  with check (app.can_location(location_id) and created_by = auth.uid()
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.org_id = sales.org_id));
create policy sales_delete on public.sales for delete to authenticated
  using (app.can_location(location_id) and app.has_role(org_id, array['admin', 'outlet']::public.member_role[]));

create policy min_levels_select on public.min_levels for select to authenticated
  using (app.can_location(location_id) or app.is_platform_admin());
create policy min_levels_write on public.min_levels for all to authenticated
  using (app.can_location(location_id) and app.has_role(org_id, array['admin', 'warehouse', 'outlet', 'supplier_admin']::public.member_role[]))
  with check (app.can_location(location_id) and app.has_role(org_id, array['admin', 'warehouse', 'outlet', 'supplier_admin']::public.member_role[]));

-- audit
create policy audit_select on public.audit_log for select to authenticated
  using (app.is_org_admin(org_id) or app.is_platform_admin());
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor = auth.uid() and (org_id is null or app.is_member(org_id)));
