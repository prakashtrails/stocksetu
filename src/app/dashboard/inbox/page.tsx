import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { dateTime, rupees } from "@/lib/format";
import { docTotals } from "@/lib/gst";

export const metadata: Metadata = { title: "Order inbox" };

export default async function InboxPage() {
  const ctx = await requireModule("supplier");
  const { data } = await ctx.supabase
    .from("purchase_orders")
    .select("id, number, status, sent_at, expected_date, buyer:organisations!purchase_orders_buyer_org_id_fkey(name), po_lines(qty_packs, rate_paise, gst_bp)")
    .eq("supplier_org_id", ctx.org.id)
    .neq("status", "draft")
    .order("sent_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <PageHeader
        title="Order inbox"
        description="Every purchase order from customers on StockSetu, in one list. Accept, part-fill or reject — the buyer sees your answer instantly, no phone calls."
      />
      <Card>
        {data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>PO</Th>
                <Th>Customer</Th>
                <Th>Received</Th>
                <Th>Needed by</Th>
                <Th className="text-right">Value</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((po) => {
                const t = docTotals((po.po_lines as { qty_packs: number; rate_paise: number; gst_bp: number }[]).map((l) => ({ qty: l.qty_packs, rate_paise: Number(l.rate_paise), gst_bp: l.gst_bp })));
                return (
                  <tr key={po.id} className={po.status === "sent" ? "bg-brand-50/40" : "hover:bg-paper/50"}>
                    <Td>
                      <Link href={`/dashboard/inbox/${po.id}`} className="font-mono font-medium text-brand-700 hover:underline">
                        {po.number}
                      </Link>
                    </Td>
                    <Td className="font-medium">{(po.buyer as unknown as { name: string } | null)?.name}</Td>
                    <Td>{dateTime(po.sent_at)}</Td>
                    <Td>{po.expected_date ?? "—"}</Td>
                    <Td className="text-right font-mono">{rupees(t.total)}</Td>
                    <Td>{po.status === "sent" ? <StatusBadge status="new" /> : <StatusBadge status={po.status} />}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Inbox className="size-5" />} title="No orders yet">
            When a customer sends you a PO through StockSetu, it lands here.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
