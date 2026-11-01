import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, CardHeader, EmptyState, Field, inputClass, PageHeader, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { rupees } from "@/lib/format";
import { addCustomer } from "../inbox/actions";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const ctx = await requireModule("supplier", ["supplier_admin"]);
  const [{ data: customers }, { data: khata }] = await Promise.all([
    ctx.supabase.from("customers").select("id, name, phone, gstin, linked_org_id").eq("org_id", ctx.org.id).order("name"),
    ctx.has("khata") ? ctx.supabase.from("khata_entries").select("customer_id, kind, amount_paise").eq("supplier_org_id", ctx.org.id) : Promise.resolve({ data: [] as never[] }),
  ]);
  const bal = new Map<string, number>();
  for (const k of (khata ?? []) as { customer_id: string; kind: string; amount_paise: number }[]) {
    bal.set(k.customer_id, (bal.get(k.customer_id) ?? 0) + (k.kind === "debit" ? 1 : -1) * Number(k.amount_paise));
  }

  return (
    <div>
      <PageHeader title="Customers" description="Kitchens and shops you supply. Customers on StockSetu send POs to your inbox and scan your deliveries on arrival." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`${customers?.length ?? 0} customers`} />
          {customers?.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Phone</Th>
                  <Th>GSTIN</Th>
                  <Th>Status</Th>
                  {ctx.has("khata") && <Th className="text-right">Balance</Th>}
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium">
                      {ctx.has("khata") ? (
                        <Link href={`/dashboard/khata/${c.id}`} className="text-brand-700 hover:underline">
                          {c.name}
                        </Link>
                      ) : (
                        c.name
                      )}
                    </Td>
                    <Td>{c.phone ?? "—"}</Td>
                    <Td className="font-mono text-xs">{c.gstin ?? "—"}</Td>
                    <Td>{c.linked_org_id ? <Badge tone="green">On StockSetu</Badge> : <Badge>Offline</Badge>}</Td>
                    {ctx.has("khata") && <Td className="text-right font-mono">{rupees(bal.get(c.id) ?? 0)}</Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Users className="size-5" />} title="No customers yet" />
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Add an offline customer</h2>
          <p className="mt-1 text-xs text-muted">Customers who join StockSetu and invite you are linked automatically.</p>
          <ActionForm action={addCustomer} className="mt-4 space-y-3" resetOnSuccess>
            <Field label="Name">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="WhatsApp number">
              <input name="phone" inputMode="tel" className={inputClass} />
            </Field>
            <Field label="GSTIN">
              <input name="gstin" className={inputClass + " uppercase"} />
            </Field>
            <SubmitButton className="w-full">Add customer</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
