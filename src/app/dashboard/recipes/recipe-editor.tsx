"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, Field, inputClass, selectClass } from "@/components/ui/kit";
import { rupees } from "@/lib/format";
import { saveRecipe } from "./actions";

type Item = { id: string; name: string; name_hi: string | null; unit: "g" | "ml" | "pc"; cost: number | null };

export function RecipeEditor({
  items,
  initial,
}: {
  items: Item[];
  initial?: { id: string; name: string; price: number; lines: { item_id: string; qty_base: number }[] };
}) {
  const [lines, setLines] = useState(initial?.lines.length ? initial.lines.map((l) => ({ ...l, qty: String(l.qty_base) })) : [{ item_id: "", qty_base: 0, qty: "" }]);
  const [price, setPrice] = useState(initial ? String(initial.price / 100) : "");
  const byId = new Map(items.map((i) => [i.id, i]));
  const cost = lines.reduce((s, l) => s + (byId.get(l.item_id)?.cost ?? 0) * Number(l.qty || 0), 0);
  const sell = Number(price || 0) * 100;
  const payload = lines.filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ item_id: l.item_id, qty_base: Number(l.qty) }));

  return (
    <ActionForm action={saveRecipe} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Dish name" className="sm:col-span-2">
          <input name="name" required defaultValue={initial?.name} className={inputClass} placeholder="Paneer Butter Masala" />
        </Field>
        <Field label="Selling price (₹)">
          <input name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} placeholder="340" />
        </Field>
      </Card>
      <Card className="p-5">
        <p className="mb-3 text-sm font-medium">Ingredients for one plate</p>
        <div className="space-y-2">
          {lines.map((l, i) => {
            const it = byId.get(l.item_id);
            return (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <select
                  aria-label="Ingredient"
                  value={l.item_id}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, item_id: e.target.value } : x)))}
                  className={selectClass + " col-span-7"}
                >
                  <option value="">Choose ingredient…</option>
                  {items.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.name_hi ? ` / ${x.name_hi}` : ""}
                    </option>
                  ))}
                </select>
                <div className="col-span-3 flex items-center gap-1.5">
                  <input
                    inputMode="numeric"
                    aria-label="Quantity"
                    value={l.qty}
                    onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x)))}
                    className={inputClass + " font-mono"}
                  />
                  <span className="w-6 text-sm text-muted">{it?.unit ?? ""}</span>
                </div>
                <span className="col-span-1 text-right font-mono text-xs text-muted">
                  {it?.cost != null && l.qty ? rupees(it.cost * Number(l.qty), { exact: true }) : ""}
                </span>
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}
                  className="col-span-1 grid size-9 place-items-center justify-self-end rounded-lg text-muted hover:text-danger-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, { item_id: "", qty_base: 0, qty: "" }])}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          <Plus className="size-4" /> Add ingredient
        </button>
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex gap-6 text-sm">
          <span>
            Cost <span className="font-semibold">{rupees(cost, { exact: true })}</span>
          </span>
          <span>
            Margin <span className="font-semibold text-brand-700">{rupees(sell - cost, { exact: true })}</span>
          </span>
          <span>
            Food cost <span className="font-semibold">{sell ? `${((cost / sell) * 100).toFixed(1)}%` : "—"}</span>
          </span>
        </div>
        <SubmitButton variant="brand">Save recipe</SubmitButton>
      </Card>
    </ActionForm>
  );
}
