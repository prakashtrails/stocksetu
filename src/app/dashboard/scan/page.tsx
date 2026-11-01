import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/kit";
import { requireOrg } from "@/lib/context";
import { loadBalances, loadProducts, productOptions } from "@/lib/data";
import { ScanStation } from "./scan-station";

export const metadata: Metadata = { title: "Scan" };

export default async function ScanPage() {
  const ctx = await requireOrg();
  const [products, balances] = await Promise.all([
    loadProducts(ctx.supabase, ctx.org.id),
    loadBalances(ctx.supabase, ctx.locations.map((l) => l.id)),
  ]);

  return (
    <div>
      <PageHeader
        title="Scan station"
        description="Scan stock in, out or to wastage. Scans are saved on this device first and sync automatically — a weak signal never loses one."
      />
      <ScanStation
        userId={ctx.user.id}
        locations={ctx.locations.map((l) => ({ id: l.id, name: l.name }))}
        products={productOptions(products)}
        balances={balances}
        canLink={ctx.is("admin", "warehouse", "supplier_admin")}
      />
    </div>
  );
}
