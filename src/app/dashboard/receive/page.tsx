import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, PackageCheck, ScanBarcode } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, inputClass, Notice, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { dateTime } from "@/lib/format";
import { findByCode } from "./actions";

export const metadata: Metadata = { title: "Receive goods" };

export default async function ReceivePage({ searchParams }: PageProps<"/dashboard/receive">) {
  const ctx = await requireModule("inventory");
  const sp = (await searchParams) as { done?: string; notfound?: string };
  const locIds = ctx.locations.map((l) => l.id);
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));

  const [{ data: shipments }, { data: pos }, { data: receipts }] = await Promise.all([
    ctx.supabase
      .from("shipments")
      .select("id, code, invoice_number, dispatched_at, buyer_location_id, po_id, supplier:organisations!shipments_supplier_org_id_fkey(name), shipment_lines(qty_packs)")
      .eq("buyer_org_id", ctx.org.id)
      .eq("status", "in_transit")
      .order("dispatched_at", { ascending: false }),
    ctx.has("procurement")
      ? ctx.supabase
          .from("purchase_orders")
          .select("id, number, status, location_id, supplier_org_id, suppliers(name)")
          .eq("buyer_org_id", ctx.org.id)
          .in("status", ["sent", "accepted", "partially_accepted", "partially_received", "dispatched"])
          .is("supplier_org_id", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    ctx.supabase
      .from("goods_receipts")
      .select("id, supplier_name, bill_number, received_at, has_discrepancy, location_id, receipt_lines(id)")
      .in("location_id", locIds.length ? locIds : [""])
      .order("received_at", { ascending: false })
      .limit(15),
  ]);

  const mine = (shipments ?? []).filter((s) => !s.buyer_location_id || locIds.includes(s.buyer_location_id));
  const myPos = (pos ?? []).filter((p: { location_id: string }) => locIds.includes(p.location_id));

  return (
    <div>
      <PageHeader
        title="Receive goods"
        description="Scan the delivery's barcode, count what arrived, and the system checks it against what was sent."
        actions={
          <ButtonLink href="/dashboard/receive/new" variant="outline" size="sm">
            Record a delivery without a code
          </ButtonLink>
        }
      />

      {sp.done && (
        <div className="mb-6">
          <Notice tone="green">Receipt saved. Accepted stock has been added; any difference is recorded with your decision.</Notice>
        </div>
      )}
      {sp.notfound && (
        <div className="mb-6">
          <Notice tone="red">No shipment or transfer found for code “{sp.notfound}”.</Notice>
        </div>
      )}

      <Card className="mb-6 p-5">
        <form action={findByCode} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="flex items-center gap-2 text-sm font-medium">
              <ScanBarcode className="size-4 text-brand-600" /> Scan or type the shipment / transfer code
            </span>
            <input name="code" required autoFocus placeholder="e.g. SHP-CHAI01 or TRF-AND001" className={inputClass + " mt-1.5 font-mono uppercase"} />
          </label>
          <button className="h-10 rounded-full bg-ink px-5 text-sm font-medium text-white">Open</button>
        </form>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Arriving shipments" description="Dispatched to you by suppliers on StockSetu" />
          {mine.length ? (
            <ul className="divide-y divide-line">
              {mine.map((s) => (
                <li key={s.id}>
                  <Link href={`/dashboard/receive/shipment/${s.id}`} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-paper/60">
                    <PackageCheck className="size-5 text-brand-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {s.code} · {(s.supplier as unknown as { name: string } | null)?.name}
                      </p>
                      <p className="text-xs text-muted">
                        {(s.shipment_lines as { qty_packs: number }[]).length} lines · to {locName.get(s.buyer_location_id ?? "") ?? "—"} ·{" "}
                        {dateTime(s.dispatched_at)}
                      </p>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-medium text-brand-700">
                      Receive <ArrowRight className="size-3.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing on the way">Shipments from your suppliers appear here as soon as they&apos;re dispatched.</EmptyState>
          )}
        </Card>

        {ctx.has("procurement") && (
          <Card>
            <CardHeader title="Open orders with off-platform suppliers" description="Receive against the PO when the delivery arrives" />
            {myPos.length ? (
              <ul className="divide-y divide-line">
                {myPos.map((p: { id: string; number: string; status: string; suppliers: unknown }) => (
                  <li key={p.id}>
                    <Link href={`/dashboard/receive/po/${p.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper/60">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {p.number} · {(p.suppliers as { name: string } | null)?.name}
                        </p>
                      </div>
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No open orders">POs sent over WhatsApp/PDF show up here to receive against.</EmptyState>
            )}
          </Card>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent receipts" />
        {receipts?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Supplier</Th>
                <Th>Bill</Th>
                <Th>Location</Th>
                <Th>Lines</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id}>
                  <Td>{dateTime(r.received_at)}</Td>
                  <Td>{r.supplier_name ?? "—"}</Td>
                  <Td>{r.bill_number ?? "—"}</Td>
                  <Td>{locName.get(r.location_id)}</Td>
                  <Td>{(r.receipt_lines as unknown[]).length}</Td>
                  <Td>{r.has_discrepancy ? <Badge tone="red">Discrepancy</Badge> : <Badge tone="green">Matched</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No receipts yet" />
        )}
      </Card>
    </div>
  );
}
