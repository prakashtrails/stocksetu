import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarcodeSvg, PrintButton } from "@/components/app/barcode";
import { requireModule } from "@/lib/context";
import { loadProducts } from "@/lib/data";
import { dateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Transfer label" };

export default async function TransferLabel({ params }: PageProps<"/dashboard/transfers/[id]/label">) {
  const ctx = await requireModule("transfers");
  const { id } = await params;
  const [{ data: t }, products] = await Promise.all([
    ctx.supabase
      .from("transfers")
      .select("code, from_location_id, to_location_id, dispatched_at, created_at, transfer_lines(product_id, qty_packs)")
      .eq("id", id)
      .maybeSingle(),
    loadProducts(ctx.supabase, ctx.org.id),
  ]);
  if (!t) notFound();
  const byId = new Map(products.map((p) => [p.id, p]));
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex justify-end">
        <PrintButton label="Print label" />
      </div>
      <div className="rounded-2xl border-2 border-dashed border-ink/40 bg-white p-6 print:border-solid">
        <p className="text-xs font-semibold tracking-widest text-muted uppercase">{ctx.org.name} · Transfer note</p>
        <p className="mt-2 text-2xl font-semibold">
          {locName.get(t.from_location_id)} → {locName.get(t.to_location_id)}
        </p>
        <p className="text-sm text-muted">Dispatched {dateTime(t.dispatched_at ?? t.created_at)}</p>
        <div className="my-4 flex justify-center">
          <BarcodeSvg value={t.code} height={70} />
        </div>
        <table className="w-full text-sm">
          <tbody>
            {(t.transfer_lines as { product_id: string; qty_packs: number }[]).map((l) => (
              <tr key={l.product_id} className="border-t border-line">
                <td className="py-1.5">{byId.get(l.product_id)?.name}</td>
                <td className="py-1.5 text-right font-mono font-semibold">{l.qty_packs}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-muted">Receiver: scan this code in StockSetu → Receive goods, and confirm what arrived.</p>
      </div>
    </div>
  );
}
