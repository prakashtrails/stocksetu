"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendly, str, type ActionResult } from "@/lib/action";
import { requireModule } from "@/lib/context";
import { parseRupees } from "@/lib/format";

export async function saveRecipe(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("food_cost", ["admin", "outlet"]);
  const name = str(form, "name");
  if (!name) return { error: "Name the dish." };
  const price = parseRupees(str(form, "price") || "0");
  if (price === null) return { error: "Selling price must be a number." };
  let lines: { item_id: string; qty_base: number }[] = [];
  try {
    lines = JSON.parse(str(form, "lines") || "[]");
  } catch {
    /* empty */
  }
  lines = lines.filter((l) => l.item_id && l.qty_base > 0);
  if (!lines.length) return { error: "Add at least one ingredient with a quantity." };

  let id = str(form, "id");
  if (id) {
    const { error } = await ctx.supabase.from("recipes").update({ name, sell_price_paise: price }).eq("id", id);
    if (error) return { error: friendly(error) };
    const { error: dErr } = await ctx.supabase.from("recipe_lines").delete().eq("recipe_id", id);
    if (dErr) return { error: friendly(dErr) };
  } else {
    const { data, error } = await ctx.supabase
      .from("recipes")
      .insert({ org_id: ctx.org.id, name, sell_price_paise: price })
      .select("id")
      .single();
    if (error) return { error: friendly(error) };
    id = data.id;
  }
  const { error: lErr } = await ctx.supabase
    .from("recipe_lines")
    .insert(lines.map((l) => ({ recipe_id: id, item_id: l.item_id, qty_base: Math.round(l.qty_base) })));
  if (lErr) return { error: friendly(lErr) };
  revalidatePath("/dashboard/recipes");
  redirect("/dashboard/recipes");
}
