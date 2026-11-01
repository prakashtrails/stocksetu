import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { BarcodeSvg } from "@/components/app/barcode";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { dateTime, rupees } from "@/lib/format";
import { docTotals } from "@/lib/gst";

export const metadata: Metadata = { title: "Shipment" };

export default async function ShipmentPage({ params }: PageProps<"/dashboard/dispatch/[id]">) {
  const ctx = await requireModule("supplier");
  const { id } = await params;
  const { data: s } = await ctx.supabase
    .from("shipments")
    .select("id, code, invoice_number, status, dispatched_at, received_at, note, po_id, customers(name), purchase_orders(number), shipment_lines(id, product_name, pack_label, qty_packs, qty_received, rate_paise, gst_bp)")
    .eq("id", id)
    .eq("supplier_org_id", ctx.org.id)
    .maybeSingle();
  if (!s) notFound();
  const lines = s.shipment_lines as { id: string; product_name: string; pack_label: string; qty_packs: number; qty_received: number | null; rate_paise: number; gst_bp: number }[];
  const totals = docTotals(lines.map((l) => ({ qty: l.qty_packs, rate_paise: Number(l.rate_paise), gst_bp: l.gst_bp })));
  const po = s.purchase_orders as unknown as { number: string } | null;

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/dispatch", label: "Dispatches" }}
        title={`Shipment ${s.code}`}
        description={`To ${(s.customers as unknown as { name: string } | null)?.name} · ${s.invoice_number}${po ? ` · against ${po.number}` : ""} · dispatched ${dateTime(s.dispatched_at)}`}
        actions={
          <>
            <StatusBadge status={s.status} />
            <Link href={`/dashboard/dispatch/${s.id}/invoice`} className={buttonClass({ variant: "outline", size: "sm" })}>
              <FileText className="size-4" /> GST invoice
            </Link>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Lines" description={s.status === "in_transit" ? "Waiting for the customer to scan and confirm" : `Confirmed ${dateTime(s.received_at)}`} />
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">Sent</Th>
                <Th className="text-right">Received</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <p className="font-medium">{l.product_name}</p>
                    <p className="text-xs text-muted">{l.pack_label}</p>
                  </Td>
                  <Td className="text-right font-mono">{l.qty_packs}</Td>
                  <Td className="text-right">
                    {l.qty_received === null ? (
                      "—"
                    ) : l.qty_received === l.qty_packs ? (
                      <Badge tone="green">{l.qty_received}</Badge>
                    ) : (
                      <Badge tone="red">
                        {l.qty_received} ({l.qty_received - l.qty_packs})
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-right font-mono">{rupees(l.qty_packs * Number(l.rate_paise), { exact: true })}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex justify-end gap-6 p-5 text-sm">
            <span className="text-muted">GST {rupees(totals.tax, { exact: true })}</span>
            <span className="font-semibold">Invoice total {rupees(totals.total, { exact: true })}</span>
          </div>
        </Card>
        <Card className="flex flex-col items-center gap-3 p-5">
          <BarcodeSvg value={s.code} />
          <p className="text-center text-xs text-muted">Print or send this with the goods. The customer scans it in Receive goods.</p>
        </Card>
      </div>
    </div>
  );
}
