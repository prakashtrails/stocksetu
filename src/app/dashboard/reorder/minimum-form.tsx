"use client";

import { useState } from "react";
import { ProductSearch } from "@/components/app/product-search";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, inputClass, selectClass } from "@/components/ui/kit";
import type { ActionResult } from "@/lib/action";
import type { ProductOption } from "@/lib/data";

export function MinimumForm({
  action,
  locations,
  products,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  locations: { id: string; name: string }[];
  products: ProductOption[];
}) {
  const [productId, setProductId] = useState<string | null>(null);
  return (
    <ActionForm action={action} className="mt-4 grid items-end gap-3 md:grid-cols-12">
      <input type="hidden" name="product_id" value={productId ?? ""} />
      <Field label="Location" className="md:col-span-3">
        <select name="location_id" className={selectClass}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="space-y-1.5 md:col-span-4">
        <span className="text-sm font-medium">Product</span>
        <ProductSearch products={products} value={productId} onChange={setProductId} />
      </div>
      <Field label="Min packs" className="md:col-span-2">
        <input name="min_packs" inputMode="numeric" required className={inputClass} placeholder="10" />
      </Field>
      <Field label="Reorder packs" className="md:col-span-2">
        <input name="reorder_packs" inputMode="numeric" required className={inputClass} placeholder="12" />
      </Field>
      <SubmitButton className="md:col-span-1">Save</SubmitButton>
    </ActionForm>
  );
}
