import "server-only";
import type { AppContext } from "./context";
import type { BaseUnit } from "./format";

export type Product = {
  id: string;
  name: string;
  brand: string | null;
  pack_qty: number;
  pack_label: string;
  cost_paise: number;
  // true when cost_paise is this organisation's own last purchase price
  own_cost: boolean;
  gst_bp: number;
  hsn: string | null;
  org_id: string | null;
  item: { id: string; name: string; name_hi: string | null; category: string; base_unit: BaseUnit };
  barcodes: string[];
};

type Supabase = AppContext["supabase"];

// Every product this organisation can use (shared catalogue + its own), with
// its own last purchase cost when it has one.
export async function loadProducts(supabase: Supabase, orgId: string): Promise<Product[]> {
  const [{ data, error }, { data: costs }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, brand, pack_qty, pack_label, cost_paise, gst_bp, hsn, org_id, items!inner(id, name, name_hi, category, base_unit), barcodes(code)")
      .or(`org_id.is.null,org_id.eq.${orgId}`)
      .order("name"),
    supabase.from("product_costs").select("product_id, cost_paise").eq("org_id", orgId),
  ]);
  if (error) throw new Error(error.message);
  const costMap = new Map((costs ?? []).map((c) => [c.product_id as string, Number(c.cost_paise)]));
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    pack_qty: Number(p.pack_qty),
    pack_label: p.pack_label,
    cost_paise: costMap.get(p.id) ?? Number(p.cost_paise),
    own_cost: costMap.has(p.id),
    gst_bp: p.gst_bp,
    hsn: p.hsn,
    org_id: p.org_id,
    item: p.items as unknown as Product["item"],
    barcodes: ((p.barcodes as { code: string }[] | null) ?? []).map((b) => b.code),
  }));
}

export type Balance = { location_id: string; product_id: string; qty_base: number };

export async function loadBalances(supabase: Supabase, locationIds: string[]): Promise<Balance[]> {
  if (!locationIds.length) return [];
  const { data, error } = await supabase
    .from("stock_balances")
    .select("location_id, product_id, qty_base")
    .in("location_id", locationIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((b) => ({ ...b, qty_base: Number(b.qty_base) })) as Balance[];
}

// Product picker options that can be passed to client components.
export function productOptions(products: Product[]) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    item: p.item.name,
    item_hi: p.item.name_hi,
    pack_qty: p.pack_qty,
    pack_label: p.pack_label,
    unit: p.item.base_unit,
    cost_paise: p.cost_paise,
    barcodes: p.barcodes,
  }));
}

export type ProductOption = ReturnType<typeof productOptions>[number];

export async function audit(ctx: AppContext, action: string, entity: string, entityId: string | null, details: object = {}) {
  await ctx.supabase.from("audit_log").insert({
    org_id: ctx.org?.id ?? null,
    actor: ctx.user.id,
    action,
    entity,
    entity_id: entityId,
    details,
  });
}
