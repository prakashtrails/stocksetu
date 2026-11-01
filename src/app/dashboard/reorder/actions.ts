"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendly, int, str, type ActionResult } from "@/lib/action";
import { requireModule } from "@/lib/context";
import { loadProducts } from "@/lib/data";

export async function setMinimum(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("inventory", ["admin", "warehouse", "outlet"]);
  const min = int(form, "min_packs");
  const reorder = int(form, "reorder_packs");
  if (min === null || !reorder) return { error: "Enter whole numbers of packs." };
  const { error } = await ctx.supabase.from("min_levels").upsert(
    {
      org_id: ctx.org.id,
      location_id: str(form, "location_id"),
      product_id: str(form, "product_id"),
      min_packs: min,
      reorder_packs: reorder,
    },
    { onConflict: "location_id,product_id" },
  );
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard/reorder");
  return { ok: "Minimum saved." };
}

export async function removeMinimum(form: FormData) {
  const ctx = await requireModule("inventory", ["admin", "warehouse", "outlet"]);
  await ctx.supabase.from("min_levels").delete().eq("id", str(form, "id"));
  revalidatePath("/dashboard/reorder");
}

function picked(form: FormData) {
  const rows: { product_id: string; location_id: string; qty: number }[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("pick_")) continue;
    const [, productId, locationId] = k.split("_");
    const qty = Number(String(form.get(`qty_${productId}_${locationId}`) ?? v).replace(/\D/g, ""));
    if (qty > 0) rows.push({ product_id: productId, location_id: locationId, qty });
  }
  return rows;
}

export async function reorderSelected(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("inventory", ["admin", "warehouse", "outlet"]);
  const rows = picked(form);
  if (!rows.length) return { error: "Tick at least one item to reorder." };
  const locs = new Set(rows.map((r) => r.location_id));
  if (locs.size > 1) return { error: "Reorder one location at a time — the selected items are for different locations." };
  const location = rows[0].location_id;
  const intent = str(form, "intent");

  if (intent === "po") {
    if (!ctx.has("procurement") || !ctx.is("admin", "warehouse")) return { error: "Purchase orders aren't enabled for you." };
    const supplierId = str(form, "supplier_id");
    if (!supplierId) return { error: "Choose the supplier who should receive this PO." };
    const products = await loadProducts(ctx.supabase, ctx.org.id);
    const byId = new Map(products.map((p) => [p.id, p]));
    const { data: po, error } = await ctx.supabase
      .from("purchase_orders")
      .insert({ buyer_org_id: ctx.org.id, supplier_id: supplierId, location_id: location, created_by: ctx.user.id, note: "From reorder alerts" })
      .select("id")
      .single();
    if (error) return { error: friendly(error) };
    const { error: lErr } = await ctx.supabase.from("po_lines").insert(
      rows.map((r) => {
        const p = byId.get(r.product_id)!;
        return {
          po_id: po.id,
          product_id: p.id,
          product_name: p.name,
          pack_label: p.pack_label,
          qty_packs: r.qty,
          rate_paise: p.cost_paise,
          gst_bp: p.gst_bp,
        };
      }),
    );
    if (lErr) return { error: friendly(lErr) };
    redirect(`/dashboard/orders/${po.id}`);
  }

  if (!ctx.has("transfers")) return { error: "Transfers aren't enabled for your organisation." };
  const from = str(form, "from_location_id");
  if (!from || from === location) return { error: "Choose which location should send the stock." };
  const { data: t, error } = await ctx.supabase
    .from("transfers")
    .insert({
      org_id: ctx.org.id,
      from_location_id: from,
      to_location_id: location,
      status: "requested",
      created_by: ctx.user.id,
      note: "Replenishment request from reorder alerts",
    })
    .select("id")
    .single();
  if (error) return { error: friendly(error) };
  const { error: lErr } = await ctx.supabase
    .from("transfer_lines")
    .insert(rows.map((r) => ({ transfer_id: t.id, product_id: r.product_id, qty_packs: r.qty })));
  if (lErr) return { error: friendly(lErr) };
  redirect(`/dashboard/transfers/${t.id}`);
}
