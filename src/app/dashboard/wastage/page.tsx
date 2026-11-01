import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/kit";
import { requireOrg } from "@/lib/context";
import { loadProducts, productOptions } from "@/lib/data";
import { dateTime, qty, rupees } from "@/lib/format";
import { WastageForm } from "./wastage-form";

export const metadata: Metadata = { title: "Wastage" };

export default async function WastagePage() {
  const ctx = await requireOrg();
  const ids = ctx.locations.map((l) => l.id);
  const [products, { data: rows }] = await Promise.all([
    loadProducts(ctx.supabase, ctx.org.id),
    ctx.supabase
      .from("stock_movements")
      .select("id, product_id, location_id, qty_base, note, occurred_at, unit_cost_paise")
      .eq("reason", "wastage")
      .in("location_id", ids.length ? ids : [""])
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));
  const total = (rows ?? []).reduce((s, r) => {
    const p = byId.get(r.product_id);
    return p ? s + (Math.abs(Number(r.qty_base)) / p.pack_qty) * Number(r.unit_cost_paise ?? p.cost_paise) : s;
  }, 0);

  return (
    <div>
      <PageHeader
        title="Wastage"
        description="Log spoilage, spillage and expiry with a reason, so missing stock is explained honestly instead of showing up as unexplained variance."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-semibold">Record wastage</h2>
          <WastageForm locations={ctx.locations.map((l) => ({ id: l.id, name: l.name }))} products={productOptions(products)} />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Recent wastage" description={`Last ${rows?.length ?? 0} entries · ${rupees(total)} total`} />
          {rows?.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Product</Th>
                  <Th>Location</Th>
                  <Th>Reason</Th>
                  <Th className="text-right">Qty</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = byId.get(r.product_id);
                  return (
                    <tr key={r.id}>
                      <Td>{dateTime(r.occurred_at)}</Td>
                      <Td className="font-medium">{p?.name}</Td>
                      <Td>{locName.get(r.location_id)}</Td>
                      <Td className="text-muted">{r.note ?? "—"}</Td>
                      <Td className="text-right font-mono text-danger-600">{p ? qty(Number(r.qty_base), p.item.base_unit) : r.qty_base}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Trash2 className="size-5" />} title="No wastage recorded" />
          )}
        </Card>
      </div>
    </div>
  );
}
