import type { Metadata } from "next";
import { LinesEditor } from "@/components/app/lines-editor";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, Field, inputClass, PageHeader, selectClass } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { loadProducts, productOptions } from "@/lib/data";
import { dispatch } from "../../inbox/actions";

export const metadata: Metadata = { title: "New dispatch" };

export default async function NewDispatch() {
  const ctx = await requireModule("supplier");
  const [products, { data: customers }] = await Promise.all([
    loadProducts(ctx.supabase, ctx.org.id),
    ctx.supabase.from("customers").select("id, name, linked_org_id").eq("org_id", ctx.org.id).order("name"),
  ]);
  const tracksStock = ctx.has("supplier_inventory") && ctx.locations.length > 0;

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/dispatch", label: "Dispatches" }}
        title="New dispatch"
        description="Send stock to a customer without a PO — e.g. a scheduled supply from your warehouse. Customers on StockSetu get it as an arriving shipment to scan."
      />
      <ActionForm action={dispatch} className="space-y-6">
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Customer">
            <select name="customer_id" className={selectClass} required>
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.linked_org_id ? " (on StockSetu)" : ""}
                </option>
              ))}
            </select>
          </Field>
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
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-sm font-medium">Products · packs · rate per pack before GST</p>
          <LinesEditor products={productOptions(products)} withRate />
        </Card>
        <SubmitButton size="lg" variant="brand">
          Dispatch &amp; create invoice
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
