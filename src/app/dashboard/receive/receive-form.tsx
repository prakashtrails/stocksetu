"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { ProductSearch } from "@/components/app/product-search";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, Field, inputClass, selectClass } from "@/components/ui/kit";
import type { ProductOption } from "@/lib/data";
import { rupees } from "@/lib/format";
import { receiveGoods } from "./actions";

export type ExpectedLine = { product_id: string; name: string; pack_label: string; expected: number; rate_paise: number };

type Row = ExpectedLine & { received: string; damaged: string; choice: string; reason: string; isNew?: boolean };

const shortChoices = [
  { v: "short_open", l: "Keep balance open (more coming)" },
  { v: "short_accepted", l: "Accept the shortage" },
  { v: "short_disputed", l: "Dispute with supplier" },
];
const extraChoices = [
  { v: "extra_rejected", l: "Reject the extra (send back)" },
  { v: "extra_accepted", l: "Accept the extra (admin)" },
];

function resolve(r: Row) {
  const rec = Number(r.received || 0);
  const dmg = Math.min(Number(r.damaged || 0), rec);
  const diff = rec - r.expected;
  if (r.expected === 0) return { resolution: "unplanned", accepted: rec - dmg, diff };
  if (dmg > 0) return { resolution: "damaged_rejected", accepted: Math.min(rec - dmg, r.expected), diff };
  if (diff === 0) return { resolution: "matched", accepted: rec, diff };
  if (diff < 0) return { resolution: r.choice.startsWith("short") ? r.choice : "short_open", accepted: rec, diff };
  const choice = r.choice.startsWith("extra") ? r.choice : "extra_rejected";
  return { resolution: choice, accepted: choice === "extra_accepted" ? rec : r.expected, diff };
}

export function ReceiveForm({
  lines,
  hidden,
  locations,
  products,
  isAdmin,
  manual = false,
  supplierName = "",
  billNumber = "",
}: {
  lines: ExpectedLine[];
  hidden: { po_id?: string; shipment_id?: string };
  locations: { id: string; name: string }[];
  products: ProductOption[];
  isAdmin: boolean;
  manual?: boolean;
  supplierName?: string;
  billNumber?: string;
}) {
  const [rows, setRows] = useState<Row[]>(
    lines.map((l) => ({ ...l, received: String(l.expected), damaged: "", choice: "", reason: "" })),
  );
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const payload = rows
    .filter((r) => r.product_id && r.received !== "")
    .map((r) => {
      const { resolution, accepted } = resolve(r);
      return {
        product_id: r.product_id,
        expected_packs: r.expected,
        received_packs: Number(r.received || 0),
        accepted_packs: accepted,
        resolution,
        reason: r.reason,
        rate_paise: r.rate_paise,
      };
    });
  const mismatches = payload.filter((p) => p.resolution !== "matched" && p.resolution !== "unplanned").length;

  return (
    <ActionForm action={receiveGoods} className="space-y-6">
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      {hidden.po_id && <input type="hidden" name="po_id" value={hidden.po_id} />}
      {hidden.shipment_id && <input type="hidden" name="shipment_id" value={hidden.shipment_id} />}

      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Receiving at">
          <select name="location_id" className={selectClass} required>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supplier">
          <input name="supplier_name" defaultValue={supplierName} className={inputClass} placeholder="Who delivered?" />
        </Field>
        <Field label="Bill / invoice number">
          <input name="bill_number" defaultValue={billNumber} className={inputClass} placeholder="Optional" />
        </Field>
      </Card>

      <Card>
        <div className="hidden grid-cols-12 gap-3 border-b border-line bg-paper/60 px-5 py-2.5 text-xs font-medium tracking-wide text-muted uppercase sm:grid">
          <span className="col-span-4">Product</span>
          <span className="col-span-1 text-right">Expected</span>
          <span className="col-span-2">Received</span>
          <span className="col-span-1">Damaged</span>
          <span className="col-span-4">Result</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((r, i) => {
            const res = resolve(r);
            return (
              <li key={i} className="grid grid-cols-12 items-start gap-3 px-5 py-4">
                <div className="col-span-12 sm:col-span-4">
                  {r.isNew ? (
                    <ProductSearch
                      products={products}
                      value={r.product_id || null}
                      onChange={(id) => {
                        const p = products.find((x) => x.id === id)!;
                        update(i, { product_id: id, name: p.name, pack_label: p.pack_label, rate_paise: p.cost_paise });
                      }}
                    />
                  ) : (
                    <>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted">
                        {r.pack_label} per pack{r.rate_paise ? ` · ${rupees(r.rate_paise, { exact: true })}` : ""}
                      </p>
                    </>
                  )}
                  {manual && (
                    <input
                      inputMode="decimal"
                      aria-label="Rate per pack"
                      placeholder="₹ per pack (from bill)"
                      className={inputClass + " mt-2"}
                      defaultValue={r.rate_paise ? r.rate_paise / 100 : ""}
                      onChange={(e) => update(i, { rate_paise: Math.round(Number(e.target.value || 0) * 100) })}
                    />
                  )}
                </div>
                <div className="col-span-4 sm:col-span-1 sm:pt-2.5 sm:text-right">
                  <span className="text-xs text-muted sm:hidden">Expected </span>
                  {manual ? (
                    <input
                      inputMode="numeric"
                      aria-label="Packs on bill"
                      className={inputClass}
                      value={r.expected || ""}
                      placeholder="Bill"
                      onChange={(e) => update(i, { expected: Number(e.target.value.replace(/\D/g, "") || 0) })}
                    />
                  ) : (
                    <span className="font-mono font-semibold">{r.expected}</span>
                  )}
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input
                    inputMode="numeric"
                    aria-label="Packs received"
                    className={inputClass + " font-mono"}
                    value={r.received}
                    onChange={(e) => update(i, { received: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
                <div className="col-span-4 sm:col-span-1">
                  <input
                    inputMode="numeric"
                    aria-label="Damaged packs"
                    className={inputClass + " font-mono"}
                    value={r.damaged}
                    placeholder="0"
                    onChange={(e) => update(i, { damaged: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
                <div className="col-span-12 space-y-2 sm:col-span-4">
                  <div className="flex items-center justify-between gap-2">
                    {res.resolution === "matched" ? (
                      <Badge tone="green">
                        <CheckCircle2 className="size-3" /> Matched
                      </Badge>
                    ) : res.resolution === "unplanned" ? (
                      <Badge tone="blue">Not on order</Badge>
                    ) : res.resolution === "damaged_rejected" ? (
                      <Badge tone="red">
                        <AlertTriangle className="size-3" /> {r.damaged} damaged — rejected
                      </Badge>
                    ) : res.diff < 0 ? (
                      <Badge tone="red">
                        <AlertTriangle className="size-3" /> Short by {-res.diff}
                      </Badge>
                    ) : (
                      <Badge tone="amber">
                        <AlertTriangle className="size-3" /> {res.diff} extra
                      </Badge>
                    )}
                    <span className="text-xs text-muted">Add {res.accepted} to stock</span>
                    {r.isNew && (
                      <button type="button" aria-label="Remove" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                        <Trash2 className="size-4 text-muted" />
                      </button>
                    )}
                  </div>
                  {res.diff !== 0 && r.expected > 0 && res.resolution !== "damaged_rejected" && (
                    <select
                      aria-label="What to do"
                      className={selectClass}
                      value={res.resolution}
                      onChange={(e) => update(i, { choice: e.target.value })}
                    >
                      {(res.diff < 0 ? shortChoices : extraChoices)
                        .filter((c) => isAdmin || c.v !== "extra_accepted")
                        .map((c) => (
                          <option key={c.v} value={c.v}>
                            {c.l}
                          </option>
                        ))}
                    </select>
                  )}
                  {res.resolution !== "matched" && res.resolution !== "unplanned" && (
                    <input
                      className={inputClass}
                      placeholder="Reason / note (optional)"
                      value={r.reason}
                      onChange={(e) => update(i, { reason: e.target.value })}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {manual && (
          <div className="border-t border-line p-4">
            <button
              type="button"
              onClick={() =>
                setRows((rs) => [...rs, { product_id: "", name: "", pack_label: "", expected: 0, rate_paise: 0, received: "", damaged: "", choice: "", reason: "", isNew: true }])
              }
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              <Plus className="size-4" /> Add product
            </button>
          </div>
        )}
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="text-sm">
          {mismatches ? (
            <p className="font-medium text-danger-600">
              {mismatches} line{mismatches > 1 ? "s" : ""} with a difference — recorded with your decision.
            </p>
          ) : (
            <p className="font-medium text-brand-700">Everything matches.</p>
          )}
          <input name="note" className={inputClass + " mt-2 w-72"} placeholder="Note for this receipt (optional)" />
        </div>
        <SubmitButton size="lg" variant="brand">
          Confirm receipt
        </SubmitButton>
      </Card>
    </ActionForm>
  );
}
