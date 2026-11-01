import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { loadProducts, productOptions } from "@/lib/data";
import { ReceiveForm } from "../receive-form";

export const metadata: Metadata = { title: "Record a delivery" };

export default async function NewReceipt() {
  const ctx = await requireModule("inventory");
  const products = await loadProducts(ctx.supabase, ctx.org.id);

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/receive", label: "Receive goods" }}
        title="Record a delivery"
        description="For deliveries without a StockSetu code: type the bill lines, then count what physically arrived. Leave the bill quantity at 0 for anything not on the bill."
      />
      <ReceiveForm
        manual
        hidden={{}}
        lines={[]}
        locations={ctx.locations}
        products={productOptions(products)}
        isAdmin={ctx.is("admin")}
      />
    </div>
  );
}
