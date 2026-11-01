import type { Metadata } from "next";
import { LinesEditor } from "@/components/app/lines-editor";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, Field, inputClass, PageHeader, selectClass } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { loadProducts, productOptions } from "@/lib/data";
import { createTransfer } from "../actions";

export const metadata: Metadata = { title: "New transfer" };

export default async function NewTransfer() {
  const ctx = await requireModule("transfers");
  const products = await loadProducts(ctx.supabase, ctx.org.id);
  const isRequester = ctx.is("outlet", "staff");
  const warehouses = ctx.allLocations.filter((l) => l.kind === "warehouse" || l.kind === "store");
  const fromOptions = isRequester ? (warehouses.length ? warehouses : ctx.allLocations) : ctx.locations;
  const toOptions = isRequester ? ctx.locations : ctx.allLocations;

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/transfers", label: "Transfers" }}
        title={isRequester ? "Request stock" : "New transfer"}
        description={
          isRequester
            ? "Ask the warehouse for stock. They'll pick it, dispatch it with a barcode label, and you scan it on arrival."
            : "Pick the products to send. Dispatching moves them into transit until the outlet confirms receipt."
        }
      />
      <ActionForm action={createTransfer} className="space-y-6">
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="From">
            <select name="from_location_id" className={selectClass} required>
              {fromOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select name="to_location_id" className={selectClass} required defaultValue={toOptions.find((l) => l.kind === "outlet" || l.kind === "kitchen")?.id}>
              {toOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Note">
            <input name="note" className={inputClass} placeholder="Optional" />
          </Field>
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-sm font-medium">Products</p>
          <LinesEditor products={productOptions(products)} />
        </Card>
        <div className="flex flex-wrap gap-2">
          {isRequester ? (
            <SubmitButton name="intent" value="request" variant="brand" size="lg">
              Send request
            </SubmitButton>
          ) : (
            <>
              <SubmitButton name="intent" value="dispatch" variant="brand" size="lg">
                Create &amp; dispatch
              </SubmitButton>
              <SubmitButton name="intent" value="draft" variant="outline" size="lg">
                Save as draft
              </SubmitButton>
            </>
          )}
        </div>
      </ActionForm>
    </div>
  );
}
