"use server";

import { revalidatePath } from "next/cache";
import { friendly, str, type ActionResult } from "@/lib/action";
import { requireModule } from "@/lib/context";
import { similarity } from "@/lib/similar";

export async function saveSales(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("food_cost", ["admin", "outlet", "staff"]);
  const date = str(form, "sale_date");
  const location = str(form, "location_id");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };
  const rows = [...form.entries()]
    .filter(([k, v]) => k.startsWith("qty_") && /^\d+$/.test(String(v).trim()) && Number(v) > 0)
    .map(([k, v]) => ({
      org_id: ctx.org.id,
      location_id: location,
      sale_date: date,
      recipe_id: k.slice(4),
      qty: Number(v),
      source: "manual",
      created_by: ctx.user.id,
    }));
  if (!rows.length) return { error: "Enter how many of at least one dish were sold." };
  const { error } = await ctx.supabase.from("sales").insert(rows);
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard/sales");
  return { ok: `Saved ${rows.reduce((s, r) => s + r.qty, 0)} plates for ${date}.` };
}

// Paste or upload a POS "item-wise sales" export: date, dish, qty per line.
export async function importSalesCsv(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("food_cost", ["admin", "outlet", "staff"]);
  const location = str(form, "location_id");
  const file = form.get("file");
  let text = str(form, "csv");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2_000_000) return { error: "That file is too big (max 2 MB)." };
    text = await file.text();
  }
  if (!text) return { error: "Paste the CSV or choose a file." };

  const { data: recipes } = await ctx.supabase.from("recipes").select("id, name").eq("org_id", ctx.org.id);
  const rows: { org_id: string; location_id: string; sale_date: string; recipe_id: string; qty: number; source: string; created_by: string }[] = [];
  const unknown = new Set<string>();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const cells = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    if (i === 0 && /date/i.test(cells[0])) continue;
    if (cells.length < 3) continue;
    const [rawDate, dish, rawQty] = cells;
    const m = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!m) continue;
    const date = m[0].includes("-") && m[1].length === 4 ? rawDate : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    const qty = Number(rawQty);
    if (!Number.isInteger(qty) || qty <= 0) continue;
    const best = (recipes ?? [])
      .map((r) => ({ r, s: r.name.toLowerCase() === dish.toLowerCase() ? 1 : similarity(r.name, dish) }))
      .sort((a, b) => b.s - a.s)[0];
    if (!best || best.s < 0.75) {
      unknown.add(dish);
      continue;
    }
    rows.push({ org_id: ctx.org.id, location_id: location, sale_date: date, recipe_id: best.r.id, qty, source: "csv", created_by: ctx.user.id });
  }
  if (!rows.length) return { error: `No rows matched your recipes.${unknown.size ? ` Unknown dishes: ${[...unknown].slice(0, 5).join(", ")}` : ""}` };
  const { error } = await ctx.supabase.from("sales").insert(rows);
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard/sales");
  return {
    ok: `Imported ${rows.length} line${rows.length > 1 ? "s" : ""}.${unknown.size ? ` Skipped dishes without a recipe: ${[...unknown].slice(0, 5).join(", ")}.` : ""}`,
  };
}
