import type { Metadata } from "next";
import { Tags } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, CardHeader, EmptyState, Field, inputClass, PageHeader, selectClass } from "@/components/ui/kit";
import { requireOrg } from "@/lib/context";
import { loadProducts } from "@/lib/data";
import { rupees } from "@/lib/format";
import { addBarcode, addItem, addProduct } from "./actions";

export const metadata: Metadata = { title: "Catalogue" };

export default async function CatalogPage({ searchParams }: PageProps<"/dashboard/catalog">) {
  const ctx = await requireOrg();
  const { q = "" } = (await searchParams) as { q?: string };
  const products = await loadProducts(ctx.supabase, ctx.org.id);
  const { data: items } = await ctx.supabase
    .from("items")
    .select("id, name, name_hi, category, base_unit, org_id")
    .or(`org_id.is.null,org_id.eq.${ctx.org.id}`)
    .order("category")
    .order("name");
  const needle = q.toLowerCase();
  const shown = (items ?? []).filter(
    (i) =>
      !needle ||
      `${i.name} ${i.name_hi ?? ""}`.toLowerCase().includes(needle) ||
      products.some((p) => p.item.id === i.id && (p.name.toLowerCase().includes(needle) || p.barcodes.some((b) => b.includes(needle)))),
  );

  return (
    <div>
      <PageHeader
        title="Catalogue"
        description="Item (the concept, in Hindi + English) → Product (brand + pack) → Barcode. Shared items come pre-built; add your own local brands and loose goods."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:order-2">
          <Card className="p-5">
            <h2 className="font-semibold">New item</h2>
            <p className="mt-1 text-xs text-muted">We check for near-duplicates first (“toor daal” → Toor Dal).</p>
            <ActionForm action={addItem} className="mt-4 space-y-3" resetOnSuccess>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Name (English)">
                  <input name="name" required className={inputClass} placeholder="Toor Dal" />
                </Field>
                <Field label="Hindi">
                  <input name="name_hi" className={inputClass} placeholder="तूर दाल" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Category">
                  <input name="category" className={inputClass} placeholder="Pulses" />
                </Field>
                <Field label="Measured in">
                  <select name="base_unit" className={selectClass}>
                    <option value="g">Weight (g / kg)</option>
                    <option value="ml">Volume (ml / L)</option>
                    <option value="pc">Pieces</option>
                  </select>
                </Field>
              </div>
              <ProductFields />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirm_new" className="size-4 accent-brand-600" /> It&apos;s really a new item
              </label>
              <SubmitButton className="w-full">Add item</SubmitButton>
            </ActionForm>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">New product for an existing item</h2>
            <ActionForm action={addProduct} className="mt-4 space-y-3" resetOnSuccess>
              <Field label="Item">
                <select name="item_id" className={selectClass}>
                  {(items ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.name_hi ? ` / ${i.name_hi}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <ProductFields />
              <SubmitButton className="w-full">Add product</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader
            title={`${shown.length} items`}
            actions={
              <form>
                <input name="q" defaultValue={q} placeholder="Search name, Hindi or barcode…" className="h-9 w-60 rounded-full border border-line px-3 text-sm" />
              </form>
            }
          />
          {shown.length ? (
            <ul className="divide-y divide-line">
              {shown.map((i) => {
                const prods = products.filter((p) => p.item.id === i.id);
                return (
                  <li key={i.id} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">
                        {i.name} {i.name_hi && <span className="font-normal text-muted">/ {i.name_hi}</span>}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge>{i.category}</Badge>
                        <Badge tone={i.org_id ? "blue" : "gray"}>{i.org_id ? "Yours" : "Shared"}</Badge>
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {prods.map((p) => (
                        <li key={p.id} className="rounded-xl bg-paper px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {p.name} <span className="text-muted">· {p.pack_label} · GST {p.gst_bp / 100}%</span>
                            </span>
                            <span className="font-mono text-xs">{rupees(p.cost_paise, { exact: true })}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {p.barcodes.map((b) => (
                              <span key={b} className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-line">
                                {b}
                              </span>
                            ))}
                            <ActionForm action={addBarcode} className="inline-flex gap-1">
                              <input type="hidden" name="product_id" value={p.id} />
                              <input name="code" placeholder="+ barcode" aria-label={`Add barcode to ${p.name}`} className="h-6 w-28 rounded border border-line bg-white px-1.5 font-mono text-[11px]" />
                            </ActionForm>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<Tags className="size-5" />} title="No items match" />
          )}
        </Card>
      </div>
    </div>
  );
}

function ProductFields() {
  return (
    <div className="space-y-3 rounded-xl bg-paper p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Brand">
          <input name="brand" className={inputClass} placeholder="Optional (loose)" />
        </Field>
        <Field label="Pack size" hint="in g / ml / pieces">
          <input name="pack_qty" inputMode="numeric" required className={inputClass} placeholder="1000" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Pack label">
          <input name="pack_label" className={inputClass} placeholder="1 kg" />
        </Field>
        <Field label="Price / pack (₹)">
          <input name="cost" inputMode="decimal" className={inputClass} placeholder="160" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="GST %">
          <input name="gst" inputMode="decimal" defaultValue="5" className={inputClass} />
        </Field>
        <Field label="HSN">
          <input name="hsn" className={inputClass} />
        </Field>
        <Field label="Barcode">
          <input name="barcode" className={inputClass + " font-mono"} />
        </Field>
      </div>
    </div>
  );
}
