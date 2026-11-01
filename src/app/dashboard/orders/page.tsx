import type { Metadata } from "next";
import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { dateOnly, rupees } from "@/lib/format";
import { docTotals } from "@/lib/gst";

export const metadata: Metadata = { title: "Purchase orders" };

export default async function OrdersPage() {
  const ctx = await requireModule("procurement", ["admin", "warehouse"]);
  const { data } = await ctx.supabase
    .from("purchase_orders")
    .select("id, number, status, created_at, location_id, supplier_org_id, suppliers(name), po_lines(qty_packs, rate_paise, gst_bp)")
    .eq("buyer_org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="A PO is not received stock: it's closed only when the delivery is scanned in and matched."
        actions={
          <ButtonLink href="/dashboard/orders/new" size="sm">
            <Plus className="size-4" /> New PO
          </ButtonLink>
        }
      />
      <Card>
        {data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>PO</Th>
                <Th>Supplier</Th>
                <Th>Deliver to</Th>
                <Th>Date</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((po) => {
                const t = docTotals((po.po_lines as { qty_packs: number; rate_paise: number; gst_bp: number }[]).map((l) => ({ qty: l.qty_packs, rate_paise: Number(l.rate_paise), gst_bp: l.gst_bp })));
                return (
                  <tr key={po.id} className="hover:bg-paper/50">
                    <Td>
                      <Link href={`/dashboard/orders/${po.id}`} className="font-mono font-medium text-brand-700 hover:underline">
                        {po.number}
                      </Link>
                    </Td>
                    <Td>
                      {(po.suppliers as unknown as { name: string } | null)?.name}{" "}
                      {po.supplier_org_id ? <Badge tone="green">on StockSetu</Badge> : null}
                    </Td>
                    <Td>{locName.get(po.location_id)}</Td>
                    <Td>{dateOnly(po.created_at)}</Td>
                    <Td className="text-right font-mono">{rupees(t.total)}</Td>
                    <Td>
                      <StatusBadge status={po.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<ShoppingCart className="size-5" />} title="No purchase orders yet" />
        )}
      </Card>
    </div>
  );
}
