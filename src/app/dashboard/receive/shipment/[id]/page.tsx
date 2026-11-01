import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice, PageHeader, StatusBadge } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { loadProducts, productOptions } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { ReceiveForm } from "../../receive-form";

export const metadata: Metadata = { title: "Receive shipment" };

export default async function ReceiveShipment({ params }: PageProps<"/dashboard/receive/shipment/[id]">) {
  const ctx = await requireModule("inventory");
  const { id } = await params;
  const [{ data: s }, products] = await Promise.all([
    ctx.supabase
      .from("shipments")
      .select("id, code, invoice_number, status, dispatched_at, buyer_location_id, po_id, note, supplier:organisations!shipments_supplier_org_id_fkey(name), shipment_lines(product_id, product_name, pack_label, qty_packs, rate_paise, qty_received)")
      .eq("id", id)
      .eq("buyer_org_id", ctx.org.id)
      .maybeSingle(),
    loadProducts(ctx.supabase, ctx.org.id),
  ]);
  if (!s) notFound();
  const supplier = (s.supplier as unknown as { name: string } | null)?.name ?? "";
  const lines = s.shipment_lines as { product_id: string; product_name: string; pack_label: string; qty_packs: number; rate_paise: number; qty_received: number | null }[];
  const locations = ctx.locations.filter((l) => !s.buyer_location_id || l.id === s.buyer_location_id);

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/receive", label: "Receive goods" }}
        title={`Shipment ${s.code}`}
        description={
          <>
            From <span className="font-medium text-ink">{supplier}</span> · invoice {s.invoice_number} · dispatched {dateTime(s.dispatched_at)}
            {s.note ? ` · “${s.note}”` : ""}
          </>
        }
        actions={<StatusBadge status={s.status} />}
      />
      {s.status !== "in_transit" ? (
        <Notice tone={s.status === "discrepancy" ? "red" : "green"}>
          Already received.{" "}
          {lines.map((l) => `${l.product_name}: ${l.qty_received ?? 0}/${l.qty_packs}`).join(" · ")}
        </Notice>
      ) : !locations.length ? (
        <Notice tone="red">This shipment is addressed to a location you don&apos;t have access to.</Notice>
      ) : (
        <ReceiveForm
          hidden={{ shipment_id: s.id, po_id: s.po_id ?? undefined }}
          lines={lines.map((l) => ({ product_id: l.product_id, name: l.product_name, pack_label: l.pack_label, expected: l.qty_packs, rate_paise: Number(l.rate_paise) }))}
          locations={locations}
          products={productOptions(products)}
          isAdmin={ctx.is("admin")}
          supplierName={supplier}
          billNumber={s.invoice_number}
        />
      )}
    </div>
  );
}
