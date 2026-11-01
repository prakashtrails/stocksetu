import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Send } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { dateTime, rupees } from "@/lib/format";
import { docTotals } from "@/lib/gst";

export const metadata: Metadata = { title: "Dispatches" };

export default async function DispatchPage() {
  const ctx = await requireModule("supplier");
  const { data } = await ctx.supabase
    .from("shipments")
    .select("id, code, invoice_number, status, dispatched_at, po_id, customers(name), shipment_lines(qty_packs, qty_received, rate_paise, gst_bp)")
    .eq("supplier_org_id", ctx.org.id)
    .order("dispatched_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <PageHeader
        title="Dispatches"
        description="Every delivery you've sent. The customer scans the shipment barcode on arrival; you see what they confirmed, line by line."
        actions={
          <ButtonLink href="/dashboard/dispatch/new" size="sm">
            <Plus className="size-4" /> New dispatch
          </ButtonLink>
        }
      />
      <Card>
        {data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Shipment</Th>
                <Th>Customer</Th>
                <Th>Invoice</Th>
                <Th>Dispatched</Th>
                <Th className="text-right">Value</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const t = docTotals((s.shipment_lines as { qty_packs: number; rate_paise: number; gst_bp: number }[]).map((l) => ({ qty: l.qty_packs, rate_paise: Number(l.rate_paise), gst_bp: l.gst_bp })));
                return (
                  <tr key={s.id} className="hover:bg-paper/50">
                    <Td>
                      <Link href={`/dashboard/dispatch/${s.id}`} className="font-mono font-medium text-brand-700 hover:underline">
                        {s.code}
                      </Link>
                    </Td>
                    <Td className="font-medium">{(s.customers as unknown as { name: string } | null)?.name}</Td>
                    <Td className="font-mono text-xs">{s.invoice_number}</Td>
                    <Td>{dateTime(s.dispatched_at)}</Td>
                    <Td className="text-right font-mono">{rupees(t.total)}</Td>
                    <Td>
                      <StatusBadge status={s.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Send className="size-5" />} title="Nothing dispatched yet" />
        )}
      </Card>
    </div>
  );
}
