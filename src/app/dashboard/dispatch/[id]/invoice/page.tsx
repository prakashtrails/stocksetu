import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarcodeSvg, PrintButton } from "@/components/app/barcode";
import { TaxDocument } from "@/components/app/tax-document";
import { requireModule } from "@/lib/context";
import { dateOnly } from "@/lib/format";

export const metadata: Metadata = { title: "Tax invoice" };

export default async function InvoicePage({ params }: PageProps<"/dashboard/dispatch/[id]/invoice">) {
  const ctx = await requireModule("supplier");
  const { id } = await params;
  const { data: s } = await ctx.supabase
    .from("shipments")
    .select("code, invoice_number, dispatched_at, customers(name, phone, gstin), purchase_orders(number), shipment_lines(product_name, pack_label, hsn, qty_packs, rate_paise, gst_bp)")
    .eq("id", id)
    .eq("supplier_org_id", ctx.org.id)
    .maybeSingle();
  if (!s) notFound();
  const c = s.customers as unknown as { name: string; phone: string | null; gstin: string | null };
  const po = s.purchase_orders as unknown as { number: string } | null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end">
        <PrintButton label="Print / Save as PDF" />
      </div>
      <TaxDocument
        title="Tax invoice"
        number={s.invoice_number}
        date={dateOnly(s.dispatched_at)}
        from={{ name: ctx.org.name, gstin: ctx.org.gstin, phone: ctx.org.phone, city: ctx.org.city }}
        to={{ name: c.name, gstin: c.gstin, phone: c.phone, extra: po ? `Against PO ${po.number}` : undefined }}
        lines={(s.shipment_lines as { product_name: string; pack_label: string; hsn: string | null; qty_packs: number; rate_paise: number; gst_bp: number }[]).map((l) => ({
          name: l.product_name,
          pack_label: l.pack_label,
          hsn: l.hsn,
          qty: l.qty_packs,
          rate_paise: Number(l.rate_paise),
          gst_bp: l.gst_bp,
        }))}
        footer="Intra-state supply: tax split equally into CGST and SGST. Please verify GST treatment with your CA."
      />
      <div className="mt-4 flex justify-center">
        <BarcodeSvg value={s.code} height={50} />
      </div>
    </div>
  );
}
