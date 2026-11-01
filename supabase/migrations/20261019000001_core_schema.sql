-- StockSetu core schema: organisations, roles, locations, catalogue, stock ledger,
-- transfers, procurement, supplier fulfilment, counts, food cost, khata and audit.
-- Quantities are integers in base units (g / ml / pc). Money is integer paise.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.org_kind as enum ('business', 'supplier');
create type public.org_mode as enum ('A', 'B', 'C', 'D');
create type public.member_role as enum ('admin', 'warehouse', 'outlet', 'staff', 'supplier_admin', 'supplier_staff');
create type public.location_kind as enum ('warehouse', 'outlet', 'kitchen', 'store');
create type public.base_unit as enum ('g', 'ml', 'pc');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  kind public.org_kind not null,
  mode public.org_mode not null,
  -- inventory | transfers | procurement | food_cost | supplier | khata | supplier_inventory
  modules text[] not null default '{}',
  gstin text,
  phone text,
  city text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  -- null = every location in the organisation
  location_ids uuid[],
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.org_members (user_id);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  kind public.location_kind not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

-- ---------------------------------------------------------------------------
-- Catalogue: Item (concept) -> Product (brand + pack) -> Barcode
-- org_id null = shared platform catalogue
-- ---------------------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  name_hi text,
  category text not null default 'General',
  base_unit public.base_unit not null,
  created_at timestamptz not null default now()
);
create unique index items_name_unique on public.items (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index items_name_trgm on public.items using gin (name extensions.gin_trgm_ops);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete restrict,
  org_id uuid references public.organisations (id) on delete cascade,
  name text not null,
  brand text,
  pack_qty bigint not null check (pack_qty > 0),
  pack_label text not null,
  cost_paise bigint not null default 0 check (cost_paise >= 0),
  hsn text,
  gst_bp int not null default 500 check (gst_bp between 0 and 2800),
  created_at timestamptz not null default now()
);
create index on public.products (item_id);

create table public.barcodes (
  code text primary key check (length(code) between 3 and 64),
  product_id uuid not null references public.products (id) on delete cascade,
  org_id uuid references public.organisations (id) on delete cascade,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index on public.barcodes (product_id);

-- ---------------------------------------------------------------------------
-- Stock ledger (append-only)
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  product_id uuid not null references public.products (id),
  qty_base bigint not null check (qty_base <> 0),
  reason text not null check (reason in (
    'opening', 'receipt', 'scan_in', 'transfer_in', 'transfer_out', 'dispatch',
    'scan_out', 'consumption', 'sale', 'wastage', 'return', 'count', 'correction')),
  unit_cost_paise bigint,
  ref_type text,
  ref_id uuid,
  note text,
  reversal_of uuid references public.stock_movements (id),
  actor uuid default auth.uid() references auth.users (id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (location_id, product_id, occurred_at);
create index on public.stock_movements (org_id, occurred_at desc);

create view public.stock_balances with (security_invoker = true) as
  select org_id, location_id, product_id, sum(qty_base)::bigint as qty_base
  from public.stock_movements
  group by org_id, location_id, product_id;

-- ---------------------------------------------------------------------------
-- Internal transfers (warehouse -> outlet), with in-transit state
-- ---------------------------------------------------------------------------
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  code text not null unique,
  from_location_id uuid not null references public.locations (id),
  to_location_id uuid not null references public.locations (id),
  status text not null default 'draft'
    check (status in ('requested', 'draft', 'in_transit', 'received', 'discrepancy', 'cancelled')),
  note text,
  created_by uuid references auth.users (id),
  dispatched_by uuid references auth.users (id),
  dispatched_at timestamptz,
  received_by uuid references auth.users (id),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create table public.transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers (id) on delete cascade,
  product_id uuid not null references public.products (id),
  qty_packs int not null check (qty_packs > 0),
  qty_received int check (qty_received >= 0),
  note text
);

-- ---------------------------------------------------------------------------
-- Procurement (buyer side)
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  gstin text,
  linked_org_id uuid references public.organisations (id),
  created_at timestamptz not null default now()
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  buyer_org_id uuid not null references public.organisations (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id),
  supplier_org_id uuid references public.organisations (id),
  location_id uuid not null references public.locations (id),
  status text not null default 'draft' check (status in (
    'draft', 'sent', 'accepted', 'partially_accepted', 'rejected', 'dispatched',
    'partially_received', 'received', 'cancelled')),
  note text,
  supplier_note text,
  expected_date date,
  created_by uuid references auth.users (id),
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (buyer_org_id, number)
);

create table public.po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  product_name text not null,
  pack_label text not null,
  qty_packs int not null check (qty_packs > 0),
  rate_paise bigint not null default 0 check (rate_paise >= 0),
  gst_bp int not null default 500,
  qty_accepted int check (qty_accepted >= 0),
  qty_dispatched int not null default 0,
  qty_received int not null default 0
);

-- ---------------------------------------------------------------------------
-- Supplier side: customers, shipments (dispatch notes) and khata
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  phone text,
  gstin text,
  linked_org_id uuid references public.organisations (id),
  default_location_id uuid references public.locations (id),
  created_at timestamptz not null default now()
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  invoice_number text not null,
  supplier_org_id uuid not null references public.organisations (id) on delete cascade,
  customer_id uuid not null references public.customers (id),
  buyer_org_id uuid references public.organisations (id),
  buyer_location_id uuid references public.locations (id),
  from_location_id uuid references public.locations (id),
  po_id uuid references public.purchase_orders (id),
  status text not null default 'in_transit' check (status in ('in_transit', 'received', 'discrepancy', 'cancelled')),
  note text,
  dispatched_by uuid references auth.users (id),
  dispatched_at timestamptz not null default now(),
  received_at timestamptz
);

create table public.shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  po_line_id uuid references public.po_lines (id),
  product_id uuid not null references public.products (id),
  product_name text not null,
  pack_label text not null,
  hsn text,
  qty_packs int not null check (qty_packs > 0),
  rate_paise bigint not null default 0,
  gst_bp int not null default 500,
  qty_received int
);

create table public.khata_entries (
  id uuid primary key default gen_random_uuid(),
  supplier_org_id uuid not null references public.organisations (id) on delete cascade,
  customer_id uuid not null references public.customers (id),
  kind text not null check (kind in ('debit', 'credit')),
  amount_paise bigint not null check (amount_paise > 0),
  ref_type text,
  ref_id uuid,
  note text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index on public.khata_entries (supplier_org_id, customer_id);

-- ---------------------------------------------------------------------------
-- Goods receipt (buyer side)
-- ---------------------------------------------------------------------------
create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  po_id uuid references public.purchase_orders (id),
  shipment_id uuid references public.shipments (id),
  supplier_name text,
  bill_number text,
  has_discrepancy boolean not null default false,
  received_by uuid references auth.users (id),
  received_at timestamptz not null default now(),
  note text
);

create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.goods_receipts (id) on delete cascade,
  product_id uuid not null references public.products (id),
  expected_packs int not null default 0 check (expected_packs >= 0),
  received_packs int not null check (received_packs >= 0),
  accepted_packs int not null check (accepted_packs >= 0),
  rejected_packs int not null default 0 check (rejected_packs >= 0),
  resolution text not null check (resolution in (
    'matched', 'short_accepted', 'short_disputed', 'short_open', 'extra_accepted', 'extra_rejected', 'damaged_rejected', 'unplanned')),
  reason text,
  rate_paise bigint not null default 0
);

-- ---------------------------------------------------------------------------
-- Counts
-- ---------------------------------------------------------------------------
create table public.counts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  status text not null default 'open' check (status in ('open', 'completed')),
  started_by uuid references auth.users (id),
  completed_by uuid references auth.users (id),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.counts (id) on delete cascade,
  product_id uuid not null references public.products (id),
  system_qty bigint not null,
  counted_qty bigint check (counted_qty >= 0),
  unique (count_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Food cost: recipes, sales, minimum levels
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  sell_price_paise bigint not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  item_id uuid not null references public.items (id),
  qty_base bigint not null check (qty_base > 0),
  unique (recipe_id, item_id)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  sale_date date not null,
  recipe_id uuid not null references public.recipes (id),
  qty int not null check (qty > 0),
  source text not null default 'manual' check (source in ('manual', 'csv')),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create index on public.sales (location_id, sale_date);

create table public.min_levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  product_id uuid not null references public.products (id),
  min_packs int not null check (min_packs >= 0),
  reorder_packs int not null check (reorder_packs > 0),
  unique (location_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid references public.organisations (id) on delete cascade,
  actor uuid default auth.uid() references auth.users (id),
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_log (org_id, created_at desc);
