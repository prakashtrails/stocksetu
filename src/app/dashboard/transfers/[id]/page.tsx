import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { BarcodeSvg } from "@/components/app/barcode";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, inputClass, Notice, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { loadProducts } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { cancelTransfer, dispatchTransfer, receiveTransfer } from "../actions";

export const metadata: Metadata = { title: "Transfer" };

export default async function TransferPage({ params, searchParams }: PageProps<"/dashboard/transfers/[id]">) {
  const ctx = await requireModule("transfers");
  const { id } = await params;
  const sp = (await searchParams) as { error?: string };
  const [{ data: t }, products] = await Promise.all([
    ctx.supabase
      .from("transfers")
      .select("id, code, status, note, from_location_id, to_location_id, created_at, dispatched_at, received_at, transfer_lines(id, product_id, qty_packs, qty_received)")
      .eq("id", id)
      .maybeSingle(),
    loadProducts(ctx.supabase, ctx.org.id),
  ]);
  if (!t) notFound();
  const byId = new Map(products.map((p) => [p.id, p]));
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));
  const mine = new Set(ctx.locations.map((l) => l.id));
  const lines = t.transfer_lines as { id: string; product_id: string; qty_packs: number; qty_received: number | null }[];
  const canDispatch = ["draft", "requested"].includes(t.status) && ctx.is("admin", "warehouse") && mine.has(t.from_location_id);
  const canReceive = t.status === "in_transit" && mine.has(t.to_location_id);
  const canCancel = ["draft", "requested"].includes(t.status);

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/transfers", label: "Transfers" }}
        title={`Transfer ${t.code}`}
        description={`${locName.get(t.from_location_id)} → ${locName.get(t.to_location_id)}${t.note ? ` · “${t.note}”` : ""}`}
        actions={
          <>
            <StatusBadge status={t.status} />
            {t.status !== "requested" && t.status !== "cancelled" && (
              <Link href={`/dashboard/transfers/${t.id}/label`} className={buttonClass({ variant: "outline", size: "sm" })}>
                <Printer className="size-4" /> Label
              </Link>
            )}
          </>
        }
      />
      {sp.error && (
        <div className="mb-4">
          <Notice tone="red">Saved as a draft but not dispatched: {sp.error}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Lines" />
          {canReceive ? (
            <ActionForm action={receiveTransfer}>
              <input type="hidden" name="id" value={t.id} />
              <Table>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th className="text-right">Sent</Th>
                    <Th>Received (packs)</Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <Td>
                        <p className="font-medium">{byId.get(l.product_id)?.name}</p>
                        <p className="text-xs text-muted">{byId.get(l.product_id)?.pack_label} per pack</p>
                      </Td>
                      <Td className="text-right font-mono">{l.qty_packs}</Td>
                      <Td>
                        <input
                          name={`recv_${l.id}`}
                          defaultValue={l.qty_packs}
                          inputMode="numeric"
                          aria-label={`Received ${byId.get(l.product_id)?.name}`}
                          className={inputClass + " w-28 font-mono"}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="flex items-center justify-between gap-3 p-5">
                <p className="text-sm text-muted">Count what physically arrived. Any difference is flagged automatically.</p>
                <SubmitButton variant="brand">Confirm receipt</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th className="text-right">Sent</Th>
                  <Th className="text-right">Received</Th>
                  <Th>Result</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const diff = l.qty_received === null ? null : l.qty_received - l.qty_packs;
                  return (
                    <tr key={l.id}>
                      <Td>
                        <p className="font-medium">{byId.get(l.product_id)?.name}</p>
                        <p className="text-xs text-muted">{byId.get(l.product_id)?.pack_label} per pack</p>
                      </Td>
                      <Td className="text-right font-mono">{l.qty_packs}</Td>
                      <Td className="text-right font-mono">{l.qty_received ?? "—"}</Td>
                      <Td>
                        {diff === null ? (
                          <span className="text-muted">—</span>
                        ) : diff === 0 ? (
                          <Badge tone="green">Matched</Badge>
                        ) : (
                          <Badge tone="red">{-diff} short — investigate</Badge>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="space-y-4">
          {t.status !== "requested" && t.status !== "cancelled" && (
            <Card className="flex justify-center p-4">
              <BarcodeSvg value={t.code} />
            </Card>
          )}
          <Card className="space-y-3 p-5 text-sm">
            <Info label="Created" value={dateTime(t.created_at)} />
            <Info label="Dispatched" value={dateTime(t.dispatched_at)} />
            <Info label="Received" value={dateTime(t.received_at)} />
          </Card>
          {canDispatch && (
            <ActionForm action={dispatchTransfer}>
              <input type="hidden" name="id" value={t.id} />
              <SubmitButton variant="brand" className="w-full">
                Dispatch now
              </SubmitButton>
              <p className="mt-2 text-xs text-muted">Stock leaves {locName.get(t.from_location_id)} and is in transit until received.</p>
            </ActionForm>
          )}
          {t.status === "requested" && !canDispatch && (
            <Notice>Waiting for the warehouse to dispatch this request.</Notice>
          )}
          {t.status === "in_transit" && !canReceive && <Notice>In transit — {locName.get(t.to_location_id)} will confirm on arrival.</Notice>}
          {canCancel && (
            <ActionForm action={cancelTransfer}>
              <input type="hidden" name="id" value={t.id} />
              <SubmitButton variant="ghost" className="w-full" confirm="Cancel this transfer?">
                Cancel transfer
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
