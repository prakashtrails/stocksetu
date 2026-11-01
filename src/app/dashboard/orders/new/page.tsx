import type { Metadata } from "next";
import Link from "next/link";
import { LinesEditor } from "@/components/app/lines-editor";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, Field, inputClass, Notice, PageHeader, selectClass } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { loadProducts, productOptions } from "@/lib/data";
import { createPo } from "../actions";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPo() {
  const ctx = await requireModule("procurement", ["admin", "warehouse"]);
  const [products, { data: suppliers }] = await Promise.all([
    loadProducts(ctx.supabase, ctx.org.id),
    ctx.supabase.from("suppliers").select("id, name, linked_org_id").eq("org_id", ctx.org.id).order("name"),
  ]);

  return (
    <div>
      <PageHeader back={{ href: "/dashboard/orders", label: "Purchase orders" }} title="New purchase order" />
      {!suppliers?.length ? (
        <Notice tone="amber">
          Add a supplier first on the <Link href="/dashboard/suppliers" className="underline">Suppliers</Link> page.
        </Notice>
      ) : (
        <ActionForm action={createPo} className="space-y-6">
          <Card className="grid gap-4 p-5 sm:grid-cols-4">
            <Field label="Supplier" hint="You choose — we never auto-pick.">
              <select name="supplier_id" className={selectClass} defaultValue="">
                <option value="">Choose…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.linked_org_id ? " (on StockSetu)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Deliver to">
              <select name="location_id" className={selectClass}>
                {ctx.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expected by">
              <input type="date" name="expected_date" className={inputClass} />
            </Field>
            <Field label="Note">
              <input name="note" className={inputClass} placeholder="Optional" />
            </Field>
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-sm font-medium">Products · quantity in packs · rate per pack before GST</p>
            <LinesEditor products={productOptions(products)} withRate />
          </Card>
          <SubmitButton size="lg" variant="brand">
            Save draft
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
