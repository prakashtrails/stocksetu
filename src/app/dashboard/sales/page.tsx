import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, EmptyState, Field, inputClass, PageHeader, selectClass, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { dateOnly, istToday, rupees } from "@/lib/format";
import { importSalesCsv, saveSales } from "./actions";

export const metadata: Metadata = { title: "Daily sales" };

export default async function SalesPage() {
  const ctx = await requireModule("food_cost", ["admin", "outlet", "staff"]);
  const ids = ctx.locations.map((l) => l.id);
  const [{ data: recipes }, { data: sales }] = await Promise.all([
    ctx.supabase.from("recipes").select("id, name, sell_price_paise").eq("org_id", ctx.org.id).eq("archived", false).order("name"),
    ctx.supabase
      .from("sales")
      .select("sale_date, qty, location_id, recipe_id")
      .in("location_id", ids.length ? ids : [""])
      .order("sale_date", { ascending: false })
      .limit(1000),
  ]);
  const price = new Map((recipes ?? []).map((r) => [r.id, Number(r.sell_price_paise)]));
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));
  const days = new Map<string, { date: string; loc: string; plates: number; revenue: number }>();
  for (const s of sales ?? []) {
    const k = `${s.sale_date}|${s.location_id}`;
    const d = days.get(k) ?? { date: s.sale_date, loc: s.location_id, plates: 0, revenue: 0 };
    d.plates += s.qty;
    d.revenue += s.qty * (price.get(s.recipe_id) ?? 0);
    days.set(k, d);
  }
  const sellLocations = ctx.locations.filter((l) => l.kind !== "warehouse");
  const locs = sellLocations.length ? sellLocations : ctx.locations;

  return (
    <div>
      <PageHeader
        title="Daily sales"
        description="Billing stays on your POS. Bring in the day's item-wise sales (CSV export) or type dish counts from the bill book — that's what theoretical usage is worked out from."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Enter by hand</h2>
          {recipes?.length ? (
            <ActionForm action={saveSales} className="mt-4 space-y-4" resetOnSuccess>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date">
                  <input type="date" name="sale_date" defaultValue={istToday()} className={inputClass} />
                </Field>
                <Field label="Outlet / kitchen">
                  <select name="location_id" className={selectClass}>
                    {locs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="divide-y divide-line rounded-xl border border-line">
                {recipes.map((r) => (
                  <label key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-sm font-medium">{r.name}</span>
                    <input name={`qty_${r.id}`} inputMode="numeric" placeholder="0" className={inputClass + " w-24 text-right font-mono"} />
                  </label>
                ))}
              </div>
              <SubmitButton className="w-full">Save sales</SubmitButton>
            </ActionForm>
          ) : (
            <EmptyState title="Add recipes first">Sales are matched to your recipes.</EmptyState>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">Import POS export (CSV)</h2>
            <p className="mt-1 text-sm text-muted">
              Columns: <span className="font-mono">date, dish, qty</span>. Dish names are matched to your recipes even with small spelling
              differences.
            </p>
            <ActionForm action={importSalesCsv} className="mt-4 space-y-3" resetOnSuccess>
              <Field label="Outlet / kitchen">
                <select name="location_id" className={selectClass}>
                  {locs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <input type="file" name="file" accept=".csv,text/csv" className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-paper file:px-4 file:py-2" />
              <textarea
                name="csv"
                rows={4}
                className={inputClass + " h-auto py-2 font-mono text-xs"}
                placeholder={`date,dish,qty\n${istToday()},Dal Tadka,24\n${istToday()},Masala Chai,58`}
              />
              <SubmitButton className="w-full" variant="outline">
                Import
              </SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <CardHeader title="Recent days" />
            {days.size ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Location</Th>
                    <Th className="text-right">Plates</Th>
                    <Th className="text-right">Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...days.values()].slice(0, 14).map((d) => (
                    <tr key={d.date + d.loc}>
                      <Td>{dateOnly(d.date)}</Td>
                      <Td>{locName.get(d.loc)}</Td>
                      <Td className="text-right font-mono">{d.plates}</Td>
                      <Td className="text-right font-mono">{rupees(d.revenue)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={<Receipt className="size-5" />} title="No sales yet" />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
