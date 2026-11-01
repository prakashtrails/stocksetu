"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendly, str, type ActionResult } from "@/lib/action";
import { requireOrg } from "@/lib/context";
import { loadBalances, loadProducts } from "@/lib/data";
import { toBase } from "@/lib/format";

export async function startCount(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  const location = str(form, "location_id");
  if (!ctx.locations.some((l) => l.id === location)) return { error: "Pick one of your locations." };
  const scope = str(form, "scope");

  const [products, balances, { data: mins }] = await Promise.all([
    loadProducts(ctx.supabase, ctx.org.id),
    loadBalances(ctx.supabase, [location]),
    ctx.supabase.from("min_levels").select("product_id").eq("location_id", location),
  ]);
  const bal = new Map(balances.map((b) => [b.product_id, b.qty_base]));
  const minSet = new Set((mins ?? []).map((m) => m.product_id));
  const chosen =
    scope === "all"
      ? products
      : products.filter((p) => (bal.get(p.id) ?? 0) !== 0 || minSet.has(p.id));
  if (!chosen.length) return { error: "Nothing to count here yet — choose “All catalogue products”." };

  const { data: count, error } = await ctx.supabase
    .from("counts")
    .insert({ org_id: ctx.org.id, location_id: location, started_by: ctx.user.id })
    .select("id")
    .single();
  if (error) return { error: friendly(error) };

  const { error: lErr } = await ctx.supabase.from("count_lines").insert(
    chosen
      .sort((a, b) => a.item.category.localeCompare(b.item.category) || a.name.localeCompare(b.name))
      .map((p) => ({ count_id: count.id, product_id: p.id, system_qty: bal.get(p.id) ?? 0 })),
  );
  if (lErr) return { error: friendly(lErr) };
  redirect(`/dashboard/counts/${count.id}`);
}

async function saveLines(form: FormData) {
  const ctx = await requireOrg();
  const products = await loadProducts(ctx.supabase, ctx.org.id);
  const byId = new Map(products.map((p) => [p.id, p]));
  const updates: { id: string; counted: number | null }[] = [];
  for (const [key, raw] of form.entries()) {
    if (!key.startsWith("line_")) continue;
    const [, lineId, productId] = key.split("_");
    const value = String(raw).trim();
    const p = byId.get(productId);
    if (!p) continue;
    if (value === "") {
      updates.push({ id: lineId, counted: null });
      continue;
    }
    const unit = String(form.get(`unit_${lineId}`) ?? (p.item.base_unit === "g" ? "kg" : p.item.base_unit === "ml" ? "L" : "pc"));
    const base = toBase(value, unit as "kg", p.pack_qty);
    if (base === null) return { ctx, error: `“${value}” for ${p.name} isn't a valid number.` };
    updates.push({ id: lineId, counted: base });
  }
  for (const u of updates) {
    const { error } = await ctx.supabase.from("count_lines").update({ counted_qty: u.counted }).eq("id", u.id);
    if (error) return { ctx, error: friendly(error) };
  }
  return { ctx, saved: updates.filter((u) => u.counted !== null).length };
}

export async function saveCount(_: ActionResult, form: FormData): Promise<ActionResult> {
  const intent = str(form, "intent");
  const res = await saveLines(form);
  if (res.error) return { error: res.error };
  if (intent === "complete") {
    const { data, error } = await res.ctx.supabase.rpc("complete_count", { p_count: str(form, "count_id") });
    if (error) return { error: friendly(error) };
    revalidatePath("/dashboard", "layout");
    return { ok: `Count completed. ${data} item${data === 1 ? "" : "s"} adjusted to the counted quantity.` };
  }
  revalidatePath(`/dashboard/counts/${str(form, "count_id")}`);
  return { ok: `Progress saved (${res.saved} counted).` };
}
