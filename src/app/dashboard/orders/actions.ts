"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendly, str, type ActionResult } from "@/lib/action";
import { requireModule } from "@/lib/context";
import { loadProducts } from "@/lib/data";

export async function createPo(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("procurement", ["admin", "warehouse"]);
  let lines: { product_id: string; qty_packs: number; rate_paise: number }[] = [];
  try {
    lines = JSON.parse(str(form, "lines") || "[]");
  } catch {
    /* empty */
  }
  if (!lines.length) return { error: "Add at least one product with a quantity." };
  const supplierId = str(form, "supplier_id");
  if (!supplierId) return { error: "Choose a supplier." };

  const products = await loadProducts(ctx.supabase, ctx.org.id);
  const byId = new Map(products.map((p) => [p.id, p]));
  const { data: po, error } = await ctx.supabase
    .from("purchase_orders")
    .insert({
      buyer_org_id: ctx.org.id,
      supplier_id: supplierId,
      location_id: str(form, "location_id"),
      expected_date: str(form, "expected_date") || null,
      note: str(form, "note") || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { error: friendly(error) };
  const { error: lErr } = await ctx.supabase.from("po_lines").insert(
    lines.map((l) => {
      const p = byId.get(l.product_id)!;
      return {
        po_id: po.id,
        product_id: p.id,
        product_name: p.name,
        pack_label: p.pack_label,
        qty_packs: l.qty_packs,
        rate_paise: l.rate_paise || 0,
        gst_bp: p.gst_bp,
      };
    }),
  );
  if (lErr) return { error: friendly(lErr) };
  revalidatePath("/dashboard/orders");
  redirect(`/dashboard/orders/${po.id}`);
}

export async function sendPo(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("procurement", ["admin", "warehouse"]);
  const { error } = await ctx.supabase.rpc("send_po", { p_po: str(form, "id") });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: "Released. On-platform suppliers see it in their inbox now; for others, share it on WhatsApp or as PDF." };
}

export async function cancelPo(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("procurement", ["admin", "warehouse"]);
  const { error } = await ctx.supabase.from("purchase_orders").update({ status: "cancelled" }).eq("id", str(form, "id"));
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard/orders");
  return { ok: "PO cancelled." };
}

export async function addSupplier(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("procurement", ["admin", "warehouse"]);
  const name = str(form, "name");
  if (!name) return { error: "Enter the supplier's name." };
  const { error } = await ctx.supabase.from("suppliers").insert({
    org_id: ctx.org.id,
    name,
    phone: str(form, "phone").replace(/\D/g, "") || null,
    email: str(form, "email") || null,
    gstin: str(form, "gstin").toUpperCase() || null,
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard/suppliers");
  return { ok: `${name} added.` };
}
