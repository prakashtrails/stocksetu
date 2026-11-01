"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ProductOption } from "@/lib/data";
import { inputClass } from "@/components/ui/kit";
import { rupees } from "@/lib/format";
import { ProductSearch } from "./product-search";

export type Line = { product_id: string | null; qty_packs: string; rate: string };

// Rows of product + packs (+ optional rate in rupees). Submitted as JSON in a
// hidden input named `lines`: [{ product_id, qty_packs, rate_paise }].
export function LinesEditor({
  products,
  withRate = false,
  initial,
  name = "lines",
}: {
  products: ProductOption[];
  withRate?: boolean;
  initial?: { product_id: string; qty_packs: number; rate_paise?: number }[];
  name?: string;
}) {
  const [lines, setLines] = useState<Line[]>(
    initial?.length
      ? initial.map((l) => ({ product_id: l.product_id, qty_packs: String(l.qty_packs), rate: l.rate_paise ? String(l.rate_paise / 100) : "" }))
      : [{ product_id: null, qty_packs: "", rate: "" }],
  );
  const byId = new Map(products.map((p) => [p.id, p]));

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const payload = lines
    .filter((l) => l.product_id && /^\d+$/.test(l.qty_packs) && Number(l.qty_packs) > 0)
    .map((l) => ({
      product_id: l.product_id,
      qty_packs: Number(l.qty_packs),
      rate_paise: withRate ? Math.round(Number(l.rate || 0) * 100) : undefined,
    }));

  const total = withRate ? payload.reduce((s, l) => s + l.qty_packs * (l.rate_paise ?? 0), 0) : 0;

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(payload)} />
      <div className="space-y-2">
        {lines.map((l, i) => {
          const p = l.product_id ? byId.get(l.product_id) : null;
          return (
            <div key={i} className="grid grid-cols-12 items-start gap-2">
              <div className={withRate ? "col-span-12 sm:col-span-6" : "col-span-12 sm:col-span-8"}>
                <ProductSearch
                  products={products}
                  value={l.product_id}
                  onChange={(id) => {
                    const prod = byId.get(id);
                    update(i, {
                      product_id: id,
                      rate: withRate && !l.rate && prod?.cost_paise ? String(prod.cost_paise / 100) : l.rate,
                    });
                  }}
                />
              </div>
              <div className={withRate ? "col-span-4 sm:col-span-2" : "col-span-8 sm:col-span-3"}>
                <input
                  inputMode="numeric"
                  aria-label="Packs"
                  className={inputClass}
                  placeholder="Packs"
                  value={l.qty_packs}
                  onChange={(e) => update(i, { qty_packs: e.target.value.replace(/\D/g, "") })}
                />
                {p && <p className="mt-1 text-xs text-muted">× {p.pack_label}</p>}
              </div>
              {withRate && (
                <div className="col-span-6 sm:col-span-3">
                  <input
                    inputMode="decimal"
                    aria-label="Rate per pack (₹)"
                    className={inputClass}
                    placeholder="₹ / pack"
                    value={l.rate}
                    onChange={(e) => update(i, { rate: e.target.value.replace(/[^\d.]/g, "") })}
                  />
                </div>
              )}
              <div className="col-span-2 flex justify-end sm:col-span-1">
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}
                  className="grid size-10 place-items-center rounded-xl text-muted hover:bg-paper hover:text-danger-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, { product_id: null, qty_packs: "", rate: "" }])}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          <Plus className="size-4" /> Add line
        </button>
        {withRate && <p className="text-sm text-muted">Before GST: <span className="font-semibold text-ink">{rupees(total, { exact: true })}</span></p>}
      </div>
    </div>
  );
}
