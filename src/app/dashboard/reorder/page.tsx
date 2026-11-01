import type { Metadata } from "next";
import { AlarmClock, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, CardHeader, EmptyState, Field, inputClass, PageHeader, selectClass, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { loadBalances, loadProducts, productOptions } from "@/lib/data";
import { MinimumForm } from "./minimum-form";
import { removeMinimum, reorderSelected, setMinimum } from "./actions";

export const metadata: Metadata = { title: "Reorder" };

export default async function ReorderPage() {
  const ctx = await requireModule("inventory", ["admin", "warehouse", "outlet"]);
  const ids = ctx.locations.map((l) => l.id);
  const safeIds = ids.length ? ids : [""];

  const [products, balances, { data: mins }, { data: poLines }, { data: transfers }, { data: suppliers }] = await Promise.all([
    loadProducts(ctx.supabase, ctx.org.id),
    loadBalances(ctx.supabase, ids),
    ctx.supabase.from("min_levels").select("id, location_id, product_id, min_packs, reorder_packs").in("location_id", safeIds),
    ctx.has("procurement")
      ? ctx.supabase
          .from("po_lines")
          .select("product_id, qty_packs, qty_accepted, qty_received, purchase_orders!inner(location_id, status, buyer_org_id)")
          .eq("purchase_orders.buyer_org_id", ctx.org.id)
          .in("purchase_orders.status", ["draft", "sent", "accepted", "partially_accepted", "dispatched", "partially_received"])
      : Promise.resolve({ data: [] as never[] }),
    ctx.has("transfers")
      ? ctx.supabase.from("transfers").select("to_location_id, status, transfer_lines(product_id, qty_packs)").in("status", ["requested", "draft", "in_transit"])
      : Promise.resolve({ data: [] as never[] }),
    ctx.has("procurement") ? ctx.supabase.from("suppliers").select("id, name").eq("org_id", ctx.org.id).order("name") : Promise.resolve({ data: [] as never[] }),
  ]);

  const byId = new Map(products.map((p) => [p.id, p]));
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));
  const bal = new Map(balances.map((b) => [`${b.location_id}:${b.product_id}`, b.qty_base]));
  const onOrder = new Map<string, number>();
  for (const l of (poLines ?? []) as unknown as { product_id: string; qty_packs: number; qty_accepted: number | null; qty_received: number; purchase_orders: { location_id: string } }[]) {
    const k = `${l.purchase_orders.location_id}:${l.product_id}`;
    onOrder.set(k, (onOrder.get(k) ?? 0) + Math.max((l.qty_accepted ?? l.qty_packs) - l.qty_received, 0));
  }
  for (const t of (transfers ?? []) as unknown as { to_location_id: string; transfer_lines: { product_id: string; qty_packs: number }[] }[]) {
    for (const l of t.transfer_lines) {
      const k = `${t.to_location_id}:${l.product_id}`;
      onOrder.set(k, (onOrder.get(k) ?? 0) + l.qty_packs);
    }
  }

  const rows = (mins ?? [])
    .map((m) => {
      const p = byId.get(m.product_id);
      if (!p) return null;
      const k = `${m.location_id}:${m.product_id}`;
      const onHand = (bal.get(k) ?? 0) / p.pack_qty;
      const coming = onOrder.get(k) ?? 0;
      const projected = onHand + coming;
      const need = Math.max(m.reorder_packs, Math.ceil(m.min_packs - projected));
      return { ...m, p, onHand, coming, projected, low: projected < m.min_packs, need };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .sort((a, b) => Number(b.low) - Number(a.low) || a.p.name.localeCompare(b.p.name));
  const low = rows.filter((r) => r.low);
  const sources = ctx.allLocations.filter((l) => l.kind === "warehouse" || l.kind === "store");

  return (
    <div>
      <PageHeader
        title="Reorder"
        description="Alerts compare your minimum with projected stock — on hand plus what's already ordered or in transit — so nothing is ordered twice. You always choose the supplier."
      />

      <ActionForm action={reorderSelected} className="mb-6">
        <Card>
          <CardHeader title={`${low.length} item${low.length === 1 ? "" : "s"} below minimum`} description="Tick what to reorder and adjust the packs" />
          {rows.length ? (
            <Table>
              <thead>
                <tr>
                  <Th className="w-10" />
                  <Th>Product</Th>
                  <Th>Location</Th>
                  <Th className="text-right">On hand</Th>
                  <Th className="text-right">On order</Th>
                  <Th className="text-right">Projected</Th>
                  <Th className="text-right">Min</Th>
                  <Th>Order packs</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.low ? "bg-saffron-100/20" : ""}>
                    <Td>
                      <input
                        type="checkbox"
                        name={`pick_${r.product_id}_${r.location_id}`}
                        defaultChecked={r.low}
                        aria-label={`Reorder ${r.p.name}`}
                        className="size-4 accent-brand-600"
                      />
                    </Td>
                    <Td>
                      <p className="font-medium">{r.p.name}</p>
                      {r.low ? <Badge tone="amber">Below minimum</Badge> : <span className="text-xs text-muted">OK</span>}
                    </Td>
                    <Td>{locName.get(r.location_id)}</Td>
                    <Td className="text-right font-mono">{Math.round(r.onHand * 10) / 10}</Td>
                    <Td className="text-right font-mono">{r.coming}</Td>
                    <Td className="text-right font-mono font-semibold">{Math.round(r.projected * 10) / 10}</Td>
                    <Td className="text-right font-mono">{r.min_packs}</Td>
                    <Td>
                      <input name={`qty_${r.product_id}_${r.location_id}`} defaultValue={r.need} inputMode="numeric" aria-label="Packs" className={inputClass + " w-20 font-mono"} />
                    </Td>
                    <Td>
                      <button formAction={removeMinimum} name="id" value={r.id} aria-label="Remove minimum" className="text-muted hover:text-danger-600">
                        <X className="size-4" />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<AlarmClock className="size-5" />} title="No minimum levels yet">
              Set a minimum below and you&apos;ll be alerted before you run out.
            </EmptyState>
          )}
          {rows.length > 0 && (ctx.has("procurement") || ctx.has("transfers")) && (
            <div className="grid gap-4 border-t border-line p-5 md:grid-cols-2">
              {ctx.has("procurement") && ctx.is("admin", "warehouse") && (
                <div className="flex items-end gap-2">
                  <Field label="Send a PO to" className="flex-1">
                    <select name="supplier_id" className={selectClass} defaultValue="">
                      <option value="">Choose supplier…</option>
                      {(suppliers ?? []).map((s: { id: string; name: string }) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <SubmitButton name="intent" value="po" variant="brand">
                    Create PO
                  </SubmitButton>
                </div>
              )}
              {ctx.has("transfers") && (
                <div className="flex items-end gap-2">
                  <Field label="Or request from" className="flex-1">
                    <select name="from_location_id" className={selectClass}>
                      {sources.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <SubmitButton name="intent" value="transfer" variant="outline">
                    Request transfer
                  </SubmitButton>
                </div>
              )}
            </div>
          )}
        </Card>
      </ActionForm>

      <Card className="p-5">
        <h2 className="font-semibold">Set a minimum level</h2>
        <MinimumForm action={setMinimum} locations={ctx.locations.map((l) => ({ id: l.id, name: l.name }))} products={productOptions(products)} />
      </Card>
    </div>
  );
}
