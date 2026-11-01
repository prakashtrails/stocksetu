import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { LocationFilter } from "@/components/app/location-filter";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/kit";
import { requireOrg } from "@/lib/context";
import { loadProducts } from "@/lib/data";
import { reasonLabels } from "@/lib/labels";
import { dateTime, qty, rupees } from "@/lib/format";

export const metadata: Metadata = { title: "Movement history" };

export default async function MovementsPage({ searchParams }: PageProps<"/dashboard/movements">) {
  const ctx = await requireOrg();
  const { loc = "", reason = "" } = (await searchParams) as { loc?: string; reason?: string };
  const ids = ctx.locations.filter((l) => !loc || l.id === loc).map((l) => l.id);
  let query = ctx.supabase
    .from("stock_movements")
    .select("id, product_id, location_id, qty_base, reason, note, occurred_at, unit_cost_paise, actor, ref_type")
    .in("location_id", ids.length ? ids : [""])
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (reason) query = query.eq("reason", reason);
  const [{ data: rows }, products, { data: people }] = await Promise.all([
    query,
    loadProducts(ctx.supabase, ctx.org.id),
    ctx.supabase.from("profiles").select("id, full_name"),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));

  return (
    <div>
      <PageHeader
        title="Movement history"
        description="Every stock change, newest first. Entries are never edited or deleted — mistakes are fixed with a new correcting entry, so this trail is complete."
        actions={<LocationFilter locations={ctx.locations} value={loc} />}
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {["", ...Object.keys(reasonLabels)].map((r) => (
          <Link
            key={r || "all"}
            href={`?${new URLSearchParams({ ...(loc ? { loc } : {}), ...(r ? { reason: r } : {}) })}`}
            className={`rounded-full px-3 py-1 text-xs ${reason === r ? "bg-ink text-white" : "border border-line text-muted hover:text-ink"}`}
          >
            {r ? reasonLabels[r] : "All"}
          </Link>
        ))}
      </div>
      <Card>
        {rows?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Product</Th>
                <Th>Location</Th>
                <Th>Type</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Value</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const p = byId.get(m.product_id);
                const v = Number(m.qty_base);
                return (
                  <tr key={m.id}>
                    <Td className="whitespace-nowrap">{dateTime(m.occurred_at)}</Td>
                    <Td>
                      <p className="font-medium">{p?.name ?? "—"}</p>
                      {m.note && <p className="text-xs text-muted">{m.note}</p>}
                    </Td>
                    <Td>{locName.get(m.location_id)}</Td>
                    <Td>{reasonLabels[m.reason] ?? m.reason}</Td>
                    <Td className={`text-right font-mono ${v > 0 ? "text-brand-700" : "text-danger-600"}`}>
                      {v > 0 ? "+" : ""}
                      {p ? qty(v, p.item.base_unit) : v}
                    </Td>
                    <Td className="text-right font-mono text-muted">
                      {p ? rupees((Math.abs(v) / p.pack_qty) * Number(m.unit_cost_paise ?? p.cost_paise)) : "—"}
                    </Td>
                    <Td className="text-muted">{(m.actor && who.get(m.actor)) || "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<History className="size-5" />} title="No movements" />
        )}
      </Card>
    </div>
  );
}
