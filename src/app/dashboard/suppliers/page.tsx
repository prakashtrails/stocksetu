import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, CardHeader, EmptyState, Field, inputClass, PageHeader, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { rupees } from "@/lib/format";
import { addSupplier } from "../orders/actions";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const ctx = await requireModule("procurement", ["admin", "warehouse"]);
  const [{ data: suppliers }, { data: khata }] = await Promise.all([
    ctx.supabase.from("suppliers").select("id, name, phone, gstin, linked_org_id").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("khata_entries").select("supplier_org_id, kind, amount_paise"),
  ]);
  const owed = new Map<string, number>();
  for (const k of khata ?? []) {
    owed.set(k.supplier_org_id, (owed.get(k.supplier_org_id) ?? 0) + (k.kind === "debit" ? 1 : -1) * Number(k.amount_paise));
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Your supplier directory. Suppliers on StockSetu get POs in their inbox and you see their khata balance; others receive POs on WhatsApp with an invite."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`${suppliers?.length ?? 0} suppliers`} />
          {suppliers?.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Phone</Th>
                  <Th>GSTIN</Th>
                  <Th>Status</Th>
                  <Th className="text-right">You owe</Th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td>{s.phone ?? "—"}</Td>
                    <Td className="font-mono text-xs">{s.gstin ?? "—"}</Td>
                    <Td>{s.linked_org_id ? <Badge tone="green">On StockSetu</Badge> : <Badge>Invite via PO</Badge>}</Td>
                    <Td className="text-right font-mono">{s.linked_org_id ? rupees(owed.get(s.linked_org_id) ?? 0) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Truck className="size-5" />} title="No suppliers yet" />
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Add supplier</h2>
          <ActionForm action={addSupplier} className="mt-4 space-y-3" resetOnSuccess>
            <Field label="Name">
              <input name="name" required className={inputClass} placeholder="Gupta Dairy" />
            </Field>
            <Field label="WhatsApp number">
              <input name="phone" inputMode="tel" className={inputClass} placeholder="98200 00000" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" className={inputClass} />
            </Field>
            <Field label="GSTIN">
              <input name="gstin" className={inputClass + " uppercase"} />
            </Field>
            <SubmitButton className="w-full">Add supplier</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
