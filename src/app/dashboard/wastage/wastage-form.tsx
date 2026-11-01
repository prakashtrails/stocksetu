"use client";

import { useState } from "react";
import { ProductSearch } from "@/components/app/product-search";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, inputClass, selectClass } from "@/components/ui/kit";
import type { ProductOption } from "@/lib/data";
import { unitChoices } from "@/lib/format";
import { recordWastage } from "./actions";

const reasons = ["Spoiled", "Expired", "Spilled", "Burnt / cooking error", "Damaged", "Staff meal", "Other"];

export function WastageForm({ locations, products }: { locations: { id: string; name: string }[]; products: ProductOption[] }) {
  const [productId, setProductId] = useState<string | null>(null);
  const product = products.find((p) => p.id === productId);
  const units = product ? [...unitChoices[product.unit], "pack" as const] : [];

  return (
    <ActionForm action={recordWastage} className="mt-4 space-y-4" resetOnSuccess>
      <input type="hidden" name="product_id" value={productId ?? ""} />
      <Field label="Location">
        <select name="location_id" className={selectClass}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Product</span>
        <ProductSearch products={products} value={productId} onChange={setProductId} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Quantity">
          <input name="qty" inputMode="decimal" required className={inputClass} placeholder="e.g. 1.5" />
        </Field>
        <Field label="Unit">
          <select name="unit" className={selectClass} key={productId ?? "none"}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u === "pack" ? `pack (${product?.pack_label})` : u}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Reason">
        <select name="reason" className={selectClass}>
          {reasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      <Field label="Note">
        <input name="note" className={inputClass} placeholder="Optional" />
      </Field>
      <SubmitButton className="w-full">Record wastage</SubmitButton>
    </ActionForm>
  );
}
