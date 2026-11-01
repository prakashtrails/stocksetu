import type { Metadata } from "next";
import Link from "next/link";
import { ChefHat } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { itemUnitCosts, recipeCost } from "@/lib/costing";
import { loadProducts } from "@/lib/data";
import { rupees } from "@/lib/format";
import { RecipeEditor } from "./recipe-editor";

export const metadata: Metadata = { title: "Recipes" };

export default async function RecipesPage({ searchParams }: PageProps<"/dashboard/recipes">) {
  const ctx = await requireModule("food_cost", ["admin", "outlet"]);
  const { edit = "" } = (await searchParams) as { edit?: string };
  const [products, { data: recipes }, { data: items }] = await Promise.all([
    loadProducts(ctx.supabase, ctx.org.id),
    ctx.supabase.from("recipes").select("id, name, sell_price_paise, recipe_lines(item_id, qty_base)").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("items").select("id, name, name_hi, base_unit").or(`org_id.is.null,org_id.eq.${ctx.org.id}`).order("name"),
  ]);
  const costs = itemUnitCosts(products);
  const editing = recipes?.find((r) => r.id === edit);
  const itemOptions = (items ?? []).map((i) => ({ id: i.id, name: i.name, name_hi: i.name_hi, unit: i.base_unit as "g" | "ml" | "pc", cost: costs.get(i.id) ?? null }));

  return (
    <div>
      <PageHeader
        title="Recipes & food cost"
        description="Recipes are attached to items (not brands), so they keep working when you switch brands. Costs use your latest purchase prices."
      />
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Menu" />
          {recipes?.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Dish</Th>
                  <Th className="text-right">Cost</Th>
                  <Th className="text-right">Price</Th>
                  <Th className="text-right">Food cost</Th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((r) => {
                  const c = recipeCost(r.recipe_lines as { item_id: string; qty_base: number }[], costs);
                  const pct = r.sell_price_paise ? (c.paise / Number(r.sell_price_paise)) * 100 : 0;
                  return (
                    <tr key={r.id} className={r.id === edit ? "bg-brand-50/50" : "hover:bg-paper/50"}>
                      <Td>
                        <Link href={`?edit=${r.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.name}
                        </Link>
                        {c.missing > 0 && <p className="text-xs text-saffron-600">{c.missing} ingredient without a price</p>}
                      </Td>
                      <Td className="text-right font-mono">{rupees(c.paise, { exact: true })}</Td>
                      <Td className="text-right font-mono">{rupees(Number(r.sell_price_paise))}</Td>
                      <Td className="text-right">
                        <Badge tone={pct > 35 ? "red" : pct > 28 ? "amber" : "green"}>{pct.toFixed(1)}%</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<ChefHat className="size-5" />} title="No recipes yet">
              Add your first dish on the right.
            </EmptyState>
          )}
        </Card>
        <div className="xl:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : "New recipe"}</h2>
            {editing && (
              <Link href="/dashboard/recipes" className="text-sm text-muted hover:text-ink">
                + New instead
              </Link>
            )}
          </div>
          <RecipeEditor
            key={editing?.id ?? "new"}
            items={itemOptions}
            initial={
              editing
                ? {
                    id: editing.id,
                    name: editing.name,
                    price: Number(editing.sell_price_paise),
                    lines: (editing.recipe_lines as { item_id: string; qty_base: number }[]).map((l) => ({ item_id: l.item_id, qty_base: Number(l.qty_base) })),
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
