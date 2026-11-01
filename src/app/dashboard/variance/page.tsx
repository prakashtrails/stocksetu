import type { Metadata } from "next";
import { Info, TrendingUp } from "lucide-react";
import { LocationFilter } from "@/components/app/location-filter";
import { Badge, Card, CardHeader, EmptyState, inputClass, Notice, PageHeader, Stat, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { itemUnitCosts } from "@/lib/costing";
import { loadProducts } from "@/lib/data";
import { dateOnly, dateTime, istToday, qty, rupees } from "@/lib/format";

export const metadata: Metadata = { title: "Variance" };

// Reasons that mean "stock was used up here" (a count gap is usage the count discovered).
const USE = ["count", "consumption", "sale", "scan_out"];

export default async function VariancePage({ searchParams }: PageProps<"/dashboard/variance">) {
  const ctx = await requireModule("food_cost", ["admin", "outlet"]);
  const sp = (await searchParams) as { loc?: string; from?: string; to?: string };
  const kitchens = ctx.locations.filter((l) => l.kind !== "warehouse");
  const choices = kitchens.length ? kitchens : ctx.locations;
  const loc = sp.loc && choices.some((l) => l.id === sp.loc) ? sp.loc : choices[0]?.id;
  const to = sp.to ?? istToday();
  const from = sp.from ?? new Date(new Date(to).getTime() - 7 * 86400000).toISOString().slice(0, 10);

  if (!loc) return <EmptyState title="No outlet or kitchen in your scope" />;

  const fromTs = `${from}T00:00:00+05:30`;
  const toTs = `${to}T23:59:59+05:30`;
  const [products, { data: sales }, { data: moves }, { data: lastCount }] = await Promise.all([
    loadProducts(ctx.supabase, ctx.org.id),
    ctx.supabase
      .from("sales")
      .select("qty, recipes(name, sell_price_paise, recipe_lines(item_id, qty_base))")
      .eq("location_id", loc)
      .gte("sale_date", from)
      .lte("sale_date", to),
    ctx.supabase
      .from("stock_movements")
      .select("product_id, qty_base, reason")
      .eq("location_id", loc)
      .in("reason", [...USE, "wastage"])
      .gte("occurred_at", fromTs)
      .lte("occurred_at", toTs),
    ctx.supabase
      .from("counts")
      .select("completed_at")
      .eq("location_id", loc)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1),
  ]);

  const byProduct = new Map(products.map((p) => [p.id, p]));
  const costs = itemUnitCosts(products);
  type Row = { id: string; name: string; hi: string | null; unit: "g" | "ml" | "pc"; theoretical: number; actual: number; wastage: number };
  const rows = new Map<string, Row>();
  const row = (itemId: string) => {
    let r = rows.get(itemId);
    if (!r) {
      const p = products.find((x) => x.item.id === itemId);
      r = { id: itemId, name: p?.item.name ?? "Item", hi: p?.item.name_hi ?? null, unit: p?.item.base_unit ?? "g", theoretical: 0, actual: 0, wastage: 0 };
      rows.set(itemId, r);
    }
    return r;
  };

  let revenue = 0;
  for (const s of sales ?? []) {
    const rec = s.recipes as unknown as { sell_price_paise: number; recipe_lines: { item_id: string; qty_base: number }[] } | null;
    if (!rec) continue;
    revenue += s.qty * Number(rec.sell_price_paise);
    for (const l of rec.recipe_lines) row(l.item_id).theoretical += s.qty * Number(l.qty_base);
  }
  for (const m of moves ?? []) {
    const p = byProduct.get(m.product_id);
    if (!p) continue;
    if (m.reason === "wastage") row(p.item.id).wastage += -Number(m.qty_base);
    else row(p.item.id).actual += -Number(m.qty_base);
  }

  const list = [...rows.values()]
    .map((r) => {
      const variance = r.actual - r.theoretical;
      const unitCost = costs.get(r.id) ?? 0;
      return { ...r, variance, value: variance * unitCost, pct: r.theoretical ? (variance / r.theoretical) * 100 : null, unitCost };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const theoreticalCost = list.reduce((s, r) => s + r.theoretical * r.unitCost, 0);
  const actualCost = list.reduce((s, r) => s + r.actual * r.unitCost, 0);
  const wastageCost = list.reduce((s, r) => s + r.wastage * r.unitCost, 0);
  const unexplained = list.filter((r) => r.variance > 0).reduce((s, r) => s + r.value, 0);
  const counted = lastCount?.[0]?.completed_at;
  const countInPeriod = counted && counted >= fromTs && counted <= toTs;

  return (
    <div>
      <PageHeader
        title="Variance"
        description="What should have been used (dishes sold × recipe) vs. what counts say was used. The gap is spillage, over-portioning, theft — or wrong recipes and missed entries."
        actions={
          <>
            <LocationFilter locations={choices} value={loc} allowAll={false} />
            <form className="flex items-center gap-2">
              <input type="hidden" name="loc" value={loc} />
              <input type="date" name="from" defaultValue={from} aria-label="From" className={inputClass + " w-40"} />
              <input type="date" name="to" defaultValue={to} aria-label="To" className={inputClass + " w-40"} />
              <button className="h-10 rounded-full bg-ink px-4 text-sm font-medium text-white">Apply</button>
            </form>
          </>
        }
      />

      <div className="mb-6 space-y-2">
        <Notice tone="gray">
          <span className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" />
            Variance is a signal, not proof of theft. Period {dateOnly(from)} – {dateOnly(to)}. Last completed count here:{" "}
            {counted ? dateTime(counted) : "never"}.
          </span>
        </Notice>
        {!countInPeriod && (
          <Notice tone="amber">No count was completed in this period, so actual usage is incomplete. Complete a count to refresh the numbers.</Notice>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Revenue (sales entered)" value={rupees(revenue)} />
        <Stat label="Theoretical food cost" value={rupees(theoreticalCost)} hint={revenue ? `${((theoreticalCost / revenue) * 100).toFixed(1)}% of revenue` : undefined} />
        <Stat label="Recorded wastage" value={rupees(wastageCost)} hint="explained loss" tone="amber" />
        <Stat label="Unexplained over-use" value={rupees(unexplained)} hint={`actual ${rupees(actualCost)}`} tone={unexplained > 0 ? "red" : "green"} />
      </div>

      <Card>
        <CardHeader title="By ingredient" description="Biggest rupee gaps first" />
        {list.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Ingredient</Th>
                <Th className="text-right">Should have used</Th>
                <Th className="text-right">Actually used</Th>
                <Th className="text-right">Wastage (recorded)</Th>
                <Th className="text-right">Gap</Th>
                <Th className="text-right">₹</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const flagged = r.pct !== null && Math.abs(r.pct) > 3;
                return (
                  <tr key={r.id}>
                    <Td>
                      <p className="font-medium">
                        {r.name} {r.hi && <span className="font-normal text-muted">/ {r.hi}</span>}
                      </p>
                    </Td>
                    <Td className="text-right font-mono">{qty(r.theoretical, r.unit)}</Td>
                    <Td className="text-right font-mono">{qty(r.actual, r.unit)}</Td>
                    <Td className="text-right font-mono text-muted">{r.wastage ? qty(r.wastage, r.unit) : "—"}</Td>
                    <Td className="text-right">
                      {r.variance === 0 ? (
                        <Badge tone="green">exact</Badge>
                      ) : (
                        <Badge tone={flagged ? (r.variance > 0 ? "red" : "blue") : "gray"}>
                          {r.variance > 0 ? "+" : ""}
                          {qty(r.variance, r.unit)}
                          {r.pct !== null && ` (${r.pct > 0 ? "+" : ""}${r.pct.toFixed(1)}%)`}
                        </Badge>
                      )}
                    </Td>
                    <Td className={`text-right font-mono ${r.value > 0 ? "text-danger-600" : "text-muted"}`}>{rupees(r.value)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<TrendingUp className="size-5" />} title="Nothing to compare yet">
            Enter sales and complete a count for this location to see variance.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
