import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/app/barcode";
import { TaxDocument } from "@/components/app/tax-document";
import { requireModule } from "@/lib/context";
import { dateOnly } from "@/lib/format";

export const metadata: Metadata = { title: "Purchase order PDF" };

export default async function PoPrint({ params }: PageProps<"/dashboard/orders/[id]/print">) {
  const ctx = await requireModule("procurement");
  const { id } = await params;
  const { data: po } = await ctx.supabase
    .from("purchase_orders")
    .select("number, created_at, expected_date, location_id, suppliers(name, phone, gstin), po_lines(product_name, pack_label, qty_packs, rate_paise, gst_bp, products(hsn))")
    .eq("id", id)
    .eq("buyer_org_id", ctx.org.id)
    .maybeSingle();
  if (!po) notFound();
  const s = po.suppliers as unknown as { name: string; phone: string | null; gstin: string | null };
  const loc = ctx.allLocations.find((l) => l.id === po.location_id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end">
        <PrintButton label="Print / Save as PDF" />
      </div>
      <TaxDocument
        title="Purchase order"
        number={po.number}
        date={dateOnly(po.created_at)}
        from={{ name: ctx.org.name, gstin: ctx.org.gstin, phone: ctx.org.phone, city: ctx.org.city, extra: `Deliver to: ${loc?.name ?? ""}` }}
        to={{ name: s.name, gstin: s.gstin, phone: s.phone }}
        lines={(po.po_lines as unknown as { product_name: string; pack_label: string; qty_packs: number; rate_paise: number; gst_bp: number; products: { hsn: string | null } | null }[]).map((l) => ({
          name: l.product_name,
          pack_label: l.pack_label,
          hsn: l.products?.hsn,
          qty: l.qty_packs,
          rate_paise: Number(l.rate_paise),
          gst_bp: l.gst_bp,
        }))}
        footer={po.expected_date ? `Please deliver by ${dateOnly(po.expected_date)}.` : "Generated with StockSetu."}
      />
    </div>
  );
}
