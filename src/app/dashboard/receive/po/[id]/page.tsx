import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice, PageHeader, StatusBadge } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { loadProducts, productOptions } from "@/lib/data";
import { ReceiveForm } from "../../receive-form";

export const metadata: Metadata = { title: "Receive against PO" };

export default async function ReceivePo({ params }: PageProps<"/dashboard/receive/po/[id]">) {
  const ctx = await requireModule("procurement");
  const { id } = await params;
  const [{ data: po }, products] = await Promise.all([
    ctx.supabase
      .from("purchase_orders")
      .select("id, number, status, location_id, suppliers(name), po_lines(product_id, product_name, pack_label, qty_packs, qty_accepted, qty_received, rate_paise)")
      .eq("id", id)
      .eq("buyer_org_id", ctx.org.id)
      .maybeSingle(),
    loadProducts(ctx.supabase, ctx.org.id),
  ]);
  if (!po) notFound();
  const lines = (po.po_lines as { product_id: string; product_name: string; pack_label: string; qty_packs: number; qty_accepted: number | null; qty_received: number; rate_paise: number }[])
    .map((l) => ({ ...l, outstanding: (l.qty_accepted ?? l.qty_packs) - l.qty_received }))
    .filter((l) => l.outstanding > 0);
  const locations = ctx.locations.filter((l) => l.id === po.location_id);
  const supplier = (po.suppliers as unknown as { name: string } | null)?.name ?? "";

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/receive", label: "Receive goods" }}
        title={`Receive ${po.number}`}
        description={<>From {supplier}. Expected = what is still outstanding on the order.</>}
        actions={<StatusBadge status={po.status} />}
      />
      {!lines.length ? (
        <Notice tone="green">Everything on this order has been received.</Notice>
      ) : ["draft", "rejected", "cancelled"].includes(po.status) ? (
        <Notice tone="amber">This order isn&apos;t open for receiving.</Notice>
      ) : !locations.length ? (
        <Notice tone="red">The delivery location for this order is outside your access.</Notice>
      ) : (
        <ReceiveForm
          hidden={{ po_id: po.id }}
          lines={lines.map((l) => ({ product_id: l.product_id, name: l.product_name, pack_label: l.pack_label, expected: l.outstanding, rate_paise: Number(l.rate_paise) }))}
          locations={locations}
          products={productOptions(products)}
          isAdmin={ctx.is("admin")}
          supplierName={supplier}
        />
      )}
    </div>
  );
}
