"use server";

import { revalidatePath } from "next/cache";
import { friendly } from "@/lib/action";
import { requireOrg } from "@/lib/context";

export type StockEvent = {
  id: string;
  location_id: string;
  product_id: string;
  qty_base: number;
  reason: "scan_in" | "scan_out" | "wastage" | "consumption" | "opening";
  occurred_at: string;
  note?: string;
};

export type SyncResult = { id: string; status: "posted" | "duplicate" | "error"; message?: string }[];

// Posts queued scans. Each event carries a client-generated id, so a retry after
// a dropped connection is ignored by the database instead of double-counting.
export async function syncEvents(events: StockEvent[]): Promise<{ results?: SyncResult; error?: string }> {
  const ctx = await requireOrg();
  if (!events.length) return { results: [] };
  const { data, error } = await ctx.supabase.rpc("post_stock_events", { p_events: events });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard/stock");
  return { results: data as SyncResult };
}

export async function linkBarcode(code: string, productId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireOrg();
  if (!ctx.is("admin", "warehouse", "supplier_admin")) return { error: "Only an admin or warehouse manager can link barcodes." };
  const clean = code.trim();
  if (clean.length < 3) return { error: "That code looks too short." };
  const { data: product } = await ctx.supabase.from("products").select("id, org_id").eq("id", productId).maybeSingle();
  if (!product) return { error: "Product not found." };
  const { error } = await ctx.supabase
    .from("barcodes")
    .insert({ code: clean, product_id: productId, org_id: product.org_id, created_by: ctx.user.id });
  if (error) return { error: error.code === "23505" ? "This barcode is already linked to a product." : friendly(error) };
  await ctx.supabase.from("audit_log").insert({
    org_id: ctx.org.id,
    actor: ctx.user.id,
    action: "barcode.linked",
    entity: "product",
    entity_id: productId,
    details: { code: clean },
  });
  revalidatePath("/dashboard/scan");
  return { ok: true };
}
