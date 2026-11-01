import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { dateOnly, rupees } from "@/lib/format";

export const metadata: Metadata = { title: "Khata" };

export default async function KhataPage() {
  const ctx = await requireModule("khata", ["supplier_admin"]);
  const [{ data: customers }, { data: entries }] = await Promise.all([
    ctx.supabase.from("customers").select("id, name, phone").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("khata_entries").select("customer_id, kind, amount_paise, created_at").eq("supplier_org_id", ctx.org.id),
  ]);
  const rows = (customers ?? []).map((c) => {
    const mine = (entries ?? []).filter((e) => e.customer_id === c.id);
    const balance = mine.reduce((s, e) => s + (e.kind === "debit" ? 1 : -1) * Number(e.amount_paise), 0);
    const lastPayment = mine.filter((e) => e.kind === "credit").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const oldestDebit = mine.filter((e) => e.kind === "debit").sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    return { ...c, balance, lastPayment: lastPayment?.created_at, since: oldestDebit?.created_at };
  });
  const receivable = rows.reduce((s, r) => s + Math.max(r.balance, 0), 0);
  const thisMonth = (entries ?? [])
    .filter((e) => e.kind === "credit" && e.created_at >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
    .reduce((s, e) => s + Number(e.amount_paise), 0);

  return (
    <div>
      <PageHeader title="Khata (udhaar)" description="Every dispatch posts to the customer's running balance automatically. Record payments as they come in and send reminders on WhatsApp." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Total receivable" value={rupees(receivable)} tone="red" />
        <Stat label="Collected this month" value={rupees(thisMonth)} tone="green" />
        <Stat label="Customers with a balance" value={rows.filter((r) => r.balance > 0).length} />
      </div>
      <Card>
        <CardHeader title="Balances" />
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Last payment</Th>
                <Th className="text-right">Balance due</Th>
              </tr>
            </thead>
            <tbody>
              {rows
                .sort((a, b) => b.balance - a.balance)
                .map((r) => (
                  <tr key={r.id} className="hover:bg-paper/50">
                    <Td>
                      <Link href={`/dashboard/khata/${r.id}`} className="font-medium text-brand-700 hover:underline">
                        {r.name}
                      </Link>
                    </Td>
                    <Td>{r.lastPayment ? dateOnly(r.lastPayment) : "—"}</Td>
                    <Td className={`text-right font-mono font-semibold ${r.balance > 0 ? "text-danger-600" : "text-brand-700"}`}>{rupees(r.balance)}</Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<BookOpenText className="size-5" />} title="No customers yet" />
        )}
      </Card>
    </div>
  );
}
