import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FileText, MessageCircle, PackageCheck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, Notice, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { dateTime, rupees } from "@/lib/format";
import { docTotals, lineTotals } from "@/lib/gst";
import { cancelPo, sendPo } from "../actions";

export const metadata: Metadata = { title: "Purchase order" };

const steps = ["draft", "sent", "accepted", "dispatched", "received"];

export default async function PoPage({ params }: PageProps<"/dashboard/orders/[id]">) {
  const ctx = await requireModule("procurement", ["admin", "warehouse"]);
  const { id } = await params;
  const { data: po } = await ctx.supabase
    .from("purchase_orders")
    .select("id, number, status, note, supplier_note, created_at, sent_at, responded_at, expected_date, location_id, supplier_org_id, suppliers(name, phone, linked_org_id), po_lines(id, product_name, pack_label, qty_packs, rate_paise, gst_bp, qty_accepted, qty_dispatched, qty_received)")
    .eq("id", id)
    .eq("buyer_org_id", ctx.org.id)
    .maybeSingle();
  if (!po) notFound();

  const supplier = po.suppliers as unknown as { name: string; phone: string | null; linked_org_id: string | null };
  const lines = po.po_lines as { id: string; product_name: string; pack_label: string; qty_packs: number; rate_paise: number; gst_bp: number; qty_accepted: number | null; qty_dispatched: number; qty_received: number }[];
  const totals = docTotals(lines.map((l) => ({ qty: l.qty_packs, rate_paise: Number(l.rate_paise), gst_bp: l.gst_bp })));
  const location = ctx.allLocations.find((l) => l.id === po.location_id);

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const text = [
    `*Purchase order ${po.number}* from ${ctx.org.name}`,
    ...lines.map((l) => `• ${l.product_name} × ${l.qty_packs} @ ${rupees(Number(l.rate_paise), { exact: true })}`),
    `Total incl. GST: ${rupees(totals.total, { exact: true })}`,
    `Deliver to: ${location?.name ?? ""}${po.expected_date ? ` by ${po.expected_date}` : ""}`,
    `PDF: ${origin}/dashboard/orders/${po.id}/print`,
    ``,
    `Get orders like this in one inbox, with khata and GST invoices — free: ${origin}/signup?as=supplier`,
  ].join("\n");
  const phone = (supplier.phone ?? "").replace(/\D/g, "");
  const wa = `https://wa.me/${phone ? (phone.length === 10 ? "91" + phone : phone) : ""}?text=${encodeURIComponent(text)}`;
  const stepIndex = Math.max(
    0,
    steps.indexOf(
      po.status === "partially_accepted" ? "accepted" : po.status === "partially_received" ? "dispatched" : po.status,
    ),
  );

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/orders", label: "Purchase orders" }}
        title={`${po.number} · ${supplier.name}`}
        description={`Deliver to ${location?.name ?? "—"} · created ${dateTime(po.created_at)}${po.note ? ` · “${po.note}”` : ""}`}
        actions={
          <>
            <StatusBadge status={po.status} />
            <Link href={`/dashboard/orders/${po.id}/print`} className={buttonClass({ variant: "outline", size: "sm" })}>
              <FileText className="size-4" /> PDF
            </Link>
          </>
        }
      />

      {!["rejected", "cancelled"].includes(po.status) && (
        <ol className="mb-6 grid grid-cols-5 gap-2">
          {steps.map((s, i) => (
            <li key={s} className={`rounded-full px-3 py-1.5 text-center text-xs font-medium capitalize ${i <= stepIndex ? "bg-brand-600 text-white" : "bg-paper text-muted"}`}>
              {s}
            </li>
          ))}
        </ol>
      )}
      {po.supplier_note && (
        <div className="mb-4">
          <Notice tone="amber">Supplier says: “{po.supplier_note}”</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Lines" description="Ordered → accepted by supplier → dispatched → received by you" />
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">Ordered</Th>
                <Th className="text-right">Accepted</Th>
                <Th className="text-right">Dispatched</Th>
                <Th className="text-right">Received</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <p className="font-medium">{l.product_name}</p>
                    <p className="text-xs text-muted">
                      {l.pack_label} · {rupees(Number(l.rate_paise), { exact: true })} + {l.gst_bp / 100}% GST
                    </p>
                  </Td>
                  <Td className="text-right font-mono">{l.qty_packs}</Td>
                  <Td className="text-right font-mono">{l.qty_accepted ?? "—"}</Td>
                  <Td className="text-right font-mono">{l.qty_dispatched}</Td>
                  <Td className="text-right font-mono">{l.qty_received}</Td>
                  <Td className="text-right font-mono">{rupees(lineTotals({ qty: l.qty_packs, rate_paise: Number(l.rate_paise), gst_bp: l.gst_bp }).total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex justify-end gap-6 p-5 text-sm">
            <span className="text-muted">GST {rupees(totals.tax, { exact: true })}</span>
            <span className="font-semibold">Total {rupees(totals.total, { exact: true })}</span>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 text-sm">
            <p className="font-semibold">{supplier.name}</p>
            <p className="mt-1 text-muted">
              {supplier.linked_org_id ? "On StockSetu — the PO lands in their inbox with live status." : "Not on StockSetu — share the PO on WhatsApp or as PDF. The message carries a free invite link."}
            </p>
          </Card>
          {po.status === "draft" && (
            <ActionForm action={sendPo}>
              <input type="hidden" name="id" value={po.id} />
              <SubmitButton variant="brand" className="w-full">
                Release PO{supplier.linked_org_id ? " to supplier inbox" : ""}
              </SubmitButton>
            </ActionForm>
          )}
          {po.status !== "draft" && !supplier.linked_org_id && !["cancelled", "received"].includes(po.status) && (
            <a href={wa} target="_blank" rel="noreferrer" className={buttonClass({ size: "md" }, "w-full bg-[#25d366] hover:bg-[#1fb457]")}>
              <MessageCircle className="size-4" /> Send on WhatsApp
            </a>
          )}
          {!["draft", "rejected", "cancelled", "received"].includes(po.status) && (
            <Link
              href={supplier.linked_org_id ? "/dashboard/receive" : `/dashboard/receive/po/${po.id}`}
              className={buttonClass({ variant: "outline" }, "w-full")}
            >
              <PackageCheck className="size-4" /> Receive delivery
            </Link>
          )}
          {po.status === "draft" && (
            <ActionForm action={cancelPo}>
              <input type="hidden" name="id" value={po.id} />
              <SubmitButton variant="ghost" className="w-full" confirm="Cancel this PO?">
                Cancel PO
              </SubmitButton>
            </ActionForm>
          )}
          <Card className="space-y-1 p-5 text-xs text-muted">
            <p>Sent: {dateTime(po.sent_at)}</p>
            <p>Supplier responded: {dateTime(po.responded_at)}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
