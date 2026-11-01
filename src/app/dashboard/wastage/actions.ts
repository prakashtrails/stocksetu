"use server";

import { revalidatePath } from "next/cache";
import { friendly, str, type ActionResult } from "@/lib/action";
import { requireOrg } from "@/lib/context";
import { loadProducts } from "@/lib/data";
import { toBase } from "@/lib/format";

export async function recordWastage(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  const products = await loadProducts(ctx.supabase, ctx.org.id);
  const p = products.find((x) => x.id === str(form, "product_id"));
  if (!p) return { error: "Pick a product." };
  const base = toBase(str(form, "qty"), str(form, "unit") as "kg", p.pack_qty);
  if (!base || base <= 0) return { error: "Enter a quantity." };
  const reason = str(form, "reason");
  const note = [reason, str(form, "note")].filter(Boolean).join(" — ");

  const { data, error } = await ctx.supabase.rpc("post_stock_events", {
    p_events: [
      {
        id: crypto.randomUUID(),
        location_id: str(form, "location_id"),
        product_id: p.id,
        qty_base: -base,
        reason: "wastage",
        note,
        occurred_at: new Date().toISOString(),
      },
    ],
  });
  if (error) return { error: friendly(error) };
  const result = (data as { status: string; message?: string }[])[0];
  if (result?.status === "error") return { error: result.message ?? "Couldn't record wastage." };
  revalidatePath("/dashboard/wastage");
  return { ok: `Recorded wastage of ${p.name}.` };
}
