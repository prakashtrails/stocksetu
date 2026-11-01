import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, ChevronRight, ScanLine } from "lucide-react";
import { LocationFilter } from "@/components/app/location-filter";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/kit";
import { requireOrg } from "@/lib/context";
import { loadBalances, loadProducts } from "@/lib/data";
import { packs, qty, rupees } from "@/lib/format";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: PageProps<"/dashboard/stock">) {
  const ctx = await requireOrg();
  const { loc = "", q = "" } = (await searchParams) as { loc?: string; q?: string };
  const scope = ctx.locations.filter((l) => !loc || l.id === loc);
  const locIds = scope.map((l) => l.id);

  const [products, balances, { data: mins }, { data: transit }] = await Promise.all([
    loadProducts(ctx.supabase, ctx.org.id),
    loadBalances(ctx.supabase, locIds),
    ctx.supabase.from("min_levels").select("location_id, product_id, min_packs").in("location_id", locIds.length ? locIds : [""]),
    ctx.supabase
      .from("transfers")
      .select("code, to_location_id, from_location_id, transfer_lines(product_id, qty_packs)")
      .eq("status", "in_transit"),
  ]);

  const byId = new Map(products.map((p) => [p.id, p]));
  const minByProduct = new Map<string, number>();
  for (const m of mins ?? []) minByProduct.set(m.product_id, (minByProduct.get(m.product_id) ?? 0) + m.min_packs);

  type Row = { productId: string; base: number; perLocation: { name: string; base: number }[] };
  const perProduct = new Map<string, Row>();
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));
  for (const b of balances) {
    if (b.qty_base === 0) continue;
    const r = perProduct.get(b.product_id) ?? { productId: b.product_id, base: 0, perLocation: [] };
    r.base += b.qty_base;
    r.perLocation.push({ name: locName.get(b.location_id) ?? "", base: b.qty_base });
    perProduct.set(b.product_id, r);
  }

  // Roll up products into their item (any brand / pack)
  const items = new Map<
    string,
    { name: string; hi: string | null; category: string; unit: "g" | "ml" | "pc"; base: number; value: number; low: boolean; rows: Row[] }
  >();
  for (const r of perProduct.values()) {
    const p = byId.get(r.productId);
    if (!p) continue;
    const needle = q.toLowerCase();
    if (needle && !`${p.name} ${p.item.name} ${p.item.name_hi ?? ""}`.toLowerCase().includes(needle)) continue;
    const it = items.get(p.item.id) ?? {
      name: p.item.name,
      hi: p.item.name_hi,
      category: p.item.category,
      unit: p.item.base_unit,
      base: 0,
      value: 0,
      low: false,
      rows: [],
    };
    it.base += r.base;
    it.value += Math.max(r.base, 0) / p.pack_qty * p.cost_paise;
    const min = minByProduct.get(p.id);
    if (min !== undefined && r.base / p.pack_qty < min) it.low = true;
    it.rows.push(r);
    items.set(p.item.id, it);
  }
  const list = [...items.entries()].sort((a, b) => a[1].category.localeCompare(b[1].category) || a[1].name.localeCompare(b[1].name));
  const totalValue = list.reduce((s, [, it]) => s + it.value, 0);

  const myIds = new Set(ctx.locations.map((l) => l.id));
  const inTransit = (transit ?? []).filter((t) => myIds.has(t.from_location_id) || myIds.has(t.to_location_id));

  return (
    <div>
      <PageHeader
        title="Stock on hand"
        description="Rolled up by item (any brand); open an item to see each brand, pack and location."
        actions={
          <>
            <LocationFilter locations={ctx.locations} value={loc} />
            <ButtonLink href="/dashboard/scan" size="sm">
              <ScanLine className="size-4" /> Scan stock
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Stock value" value={rupees(totalValue)} hint="at last purchase price" />
        <Stat label="Items in stock" value={list.length} />
        <Stat label="Below minimum" value={list.filter(([, i]) => i.low).length} tone={list.some(([, i]) => i.low) ? "amber" : undefined} />
      </div>

      <Card>
        <CardHeader
          title={scope.length === 1 ? scope[0].name : "All my locations"}
          actions={
            <form className="w-56">
              {loc && <input type="hidden" name="loc" value={loc} />}
              <input
                name="q"
                defaultValue={q}
                placeholder="Search items…"
                className="h-9 w-full rounded-full border border-line px-3 text-sm outline-none focus:border-brand-500"
              />
            </form>
          }
        />
        {list.length === 0 ? (
          <EmptyState
            icon={<Boxes className="size-5" />}
            title="No stock here yet"
            action={
              <ButtonLink href="/dashboard/scan" size="sm">
                Scan stock in
              </ButtonLink>
            }
          >
            Scan opening stock, receive a delivery or a transfer and it will show up here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {list.map(([id, it]) => (
              <li key={id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 hover:bg-paper/60">
                    <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {it.name} {it.hi && <span className="font-normal text-muted">/ {it.hi}</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {it.category} · {it.rows.length} product{it.rows.length > 1 ? "s" : ""}
                      </p>
                    </div>
                    {it.low && <Badge tone="amber">Low</Badge>}
                    <div className="w-28 text-right">
                      <p className={`font-mono font-semibold ${it.base < 0 ? "text-danger-600" : ""}`}>{qty(it.base, it.unit)}</p>
                      <p className="text-xs text-muted">{rupees(it.value)}</p>
                    </div>
                  </summary>
                  <div className="bg-paper/50 px-5 pt-1 pb-4 pl-12">
                    {it.rows.map((r) => {
                      const p = byId.get(r.productId)!;
                      return (
                        <div key={r.productId} className="border-b border-line/70 py-2.5 text-sm last:border-0">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">{p.name}</span>
                            <span className="font-mono">
                              {packs(r.base, p.pack_qty)} × {p.pack_label}
                            </span>
                          </div>
                          {r.perLocation.length > 1 || !loc ? (
                            <p className="mt-0.5 text-xs text-muted">
                              {r.perLocation.map((x) => `${x.name}: ${qty(x.base, p.item.base_unit)}`).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {inTransit.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="In transit" description="Dispatched but not yet received — counted at neither location" />
          <ul className="divide-y divide-line">
            {inTransit.map((t) => (
              <li key={t.code} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-medium">{t.code}</span>{" "}
                  <span className="text-muted">
                    {locName.get(t.from_location_id)} → {locName.get(t.to_location_id)}
                  </span>
                </span>
                <span className="text-muted">
                  {(t.transfer_lines as { product_id: string; qty_packs: number }[])
                    .map((l) => `${l.qty_packs} × ${byId.get(l.product_id)?.name ?? ""}`)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">
        Need the full trail? See <Link href="/dashboard/movements" className="underline">movement history</Link>.
      </p>
    </div>
  );
}
