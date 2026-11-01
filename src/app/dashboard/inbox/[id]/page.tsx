import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, Field, inputClass, Notice, PageHeader, selectClass, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { loadBalances } from "@/lib/data";
import { dateTime, rupees } from "@/lib/format";
import { docTotals } from "@/lib/gst";
import { dispatch, respondPo } from "../actions";

export const metadata: Metadata = { title: "Order" };

export default async function InboxOrder({ params }: PageProps<"/dashboard/inbox/[id]">) {
  const ctx = await requireModule("supplier");
  const { id } = await params;
  const { data: po } = await ctx.supabase
    .from("purchase_orders")
    .select("id, number, status, note, supplier_note, sent_at, expected_date, buyer_org_id, location_id, buyer:organisations!purchase_orders_buyer_org_id_fkey(name, gstin, phone), locations(name), po_lines(id, product_id, product_name, pack_label, qty_packs, rate_paise, gst_bp, qty_accepted, qty_dispatched, qty_received, products(pack_qty)), shipments(id, code, status)")
    .eq("id", id)
    .eq("supplier_org_id", ctx.org.id)
    .maybeSingle();
  if (!po) notFound();
  const buyer = po.buyer as unknown as { name: string; gstin: string | null; phone: string | null };
  const lines = po.po_lines as unknown as { id: string; product_id: string; product_name: string; pack_label: string; qty_packs: number; rate_paise: number; gst_bp: number; qty_accepted: number | null; qty_dispatched: number; qty_received: number; products: { pack_qty: number } | null }[];
  const shipments = po.shipments as { id: string; code: string; status: string }[];
  const { data: customer } = await ctx.supabase.from("customers").select("id").eq("org_id", ctx.org.id).eq("linked_org_id", po.buyer_org_id).maybeSingle();
  const tracksStock = ctx.has("supplier_inventory") && ctx.locations.length > 0;
  const balances = tracksStock ? await loadBalances(ctx.supabase, ctx.locations.map((l) => l.id)) : [];
  const stockOf = (productId: string) => balances.filter((b) => b.product_id === productId).reduce((s, b) => s + b.qty_base, 0);
  const totals = docTotals(lines.map((l) => ({ qty: l.qty_packs, rate_paise: Number(l.rate_paise), gst_bp: l.gst_bp })));
  const remaining = lines.map((l) => ({ ...l, left: (l.qty_accepted ?? 0) - l.qty_dispatched })).filter((l) => l.left > 0);

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/inbox", label: "Order inbox" }}
        title={`${po.number} · ${buyer.name}`}
        description={`Deliver to ${(po.locations as unknown as { name: string } | null)?.name ?? "their store"} · received ${dateTime(po.sent_at)}${po.expected_date ? ` · needed by ${po.expected_date}` : ""}${po.note ? ` · “${po.note}”` : ""}`}
        actions={<StatusBadge status={po.status} />}
      />

      {po.status === "sent" ? (
        <ActionForm action={respondPo}>
          <input type="hidden" name="id" value={po.id} />
          <Card>
            <CardHeader title="Can you fill this order?" description="Change a quantity to part-fill a line. Set 0 for anything you can't supply." />
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">Ordered</Th>
                  {tracksStock && <Th className="text-right">Your stock</Th>}
                  <Th className="text-right">Rate</Th>
                  <Th>You can supply</Th>
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
                    {tracksStock && <Td className="text-right font-mono text-muted">{Math.floor(stockOf(l.product_id) / Number(l.products?.pack_qty ?? 1))}</Td>}
                    <Td className="text-right font-mono">{rupees(Number(l.rate_paise), { exact: true })}</Td>
                    <Td>
                      <input name={`acc_${l.id}`} defaultValue={l.qty_packs} inputMode="numeric" aria-label={`Supply ${l.product_name}`} className={inputClass + " w-24 font-mono"} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex flex-wrap items-end justify-between gap-3 p-5">
              <Field label="Message to buyer" className="w-full max-w-md">
                <input name="note" className={inputClass} placeholder="e.g. Ghee short, rest tomorrow" />
              </Field>
              <div className="flex gap-2">
                <SubmitButton name="intent" value="reject" variant="ghost" confirm="Reject the whole order?">
                  Reject
                </SubmitButton>
                <SubmitButton name="intent" value="accept" variant="brand">
                  Accept
                </SubmitButton>
              </div>
            </div>
            <p className="px-5 pb-5 text-xs text-muted">Order value {rupees(totals.total, { exact: true })} incl. GST.</p>
          </Card>
        </ActionForm>
      ) : (
        <Card>
          <CardHeader title="Lines" />
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">Ordered</Th>
                <Th className="text-right">Accepted</Th>
                <Th className="text-right">Dispatched</Th>
                <Th className="text-right">Received by buyer</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td className="font-medium">{l.product_name}</Td>
                  <Td className="text-right font-mono">{l.qty_packs}</Td>
                  <Td className="text-right font-mono">{l.qty_accepted ?? "—"}</Td>
                  <Td className="text-right font-mono">{l.qty_dispatched}</Td>
                  <Td className="text-right font-mono">{l.qty_received}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {po.supplier_note && po.status !== "sent" && (
        <div className="mt-4">
          <Notice>Your note: “{po.supplier_note}”</Notice>
        </div>
      )}

      {["accepted", "partially_accepted", "dispatched"].includes(po.status) && remaining.length > 0 && (
        <ActionForm action={dispatch} className="mt-6">
          <input type="hidden" name="po_id" value={po.id} />
          <input type="hidden" name="customer_id" value={customer?.id ?? ""} />
          <Card>
            <CardHeader title="Dispatch" description="Creates the delivery note with a barcode, the GST invoice, and the khata entry in one step." />
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">Still to send</Th>
                  <Th>Send now</Th>
                </tr>
              </thead>
              <tbody>
                {remaining.map((l) => (
                  <tr key={l.id}>
                    <Td className="font-medium">{l.product_name}</Td>
                    <Td className="text-right font-mono">{l.left}</Td>
                    <Td>
                      <input
                        name={`send_${l.id}_${l.product_id}_${l.rate_paise}`}
                        defaultValue={l.left}
                        inputMode="numeric"
                        aria-label={`Send ${l.product_name}`}
                        className={inputClass + " w-24 font-mono"}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex flex-wrap items-end justify-between gap-3 p-5">
              <div className="flex flex-wrap gap-3">
                {tracksStock && (
                  <Field label="Dispatch from">
                    <select name="from_location_id" className={selectClass}>
                      {ctx.locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Vehicle / note">
                  <input name="note" className={inputClass} placeholder="Optional" />
                </Field>
              </div>
              <SubmitButton variant="brand">Dispatch &amp; create invoice</SubmitButton>
            </div>
            {!customer && <p className="px-5 pb-5 text-sm text-danger-600">This buyer isn&apos;t in your customer list yet.</p>}
          </Card>
        </ActionForm>
      )}

      {shipments.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Shipments for this order" />
          <ul className="divide-y divide-line">
            {shipments.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <Link href={`/dashboard/dispatch/${s.id}`} className="font-mono font-medium text-brand-700 hover:underline">
                  {s.code}
                </Link>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {po.status === "sent" && ctx.has("procurement") && (
        <p className="mt-4 text-sm text-muted">
          Short on stock? <Link href="/dashboard/orders/new" className="font-medium text-brand-700 underline">Order from your own supplier</Link> — the same flow, one level up.
        </p>
      )}
    </div>
  );
}
