import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, Field, inputClass, PageHeader, selectClass, Stat, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { dateOnly, rupees } from "@/lib/format";
import { recordPayment } from "../../inbox/actions";

export const metadata: Metadata = { title: "Khata statement" };

export default async function KhataStatement({ params }: PageProps<"/dashboard/khata/[customerId]">) {
  const ctx = await requireModule("khata", ["supplier_admin"]);
  const { customerId } = await params;
  const [{ data: c }, { data: entries }] = await Promise.all([
    ctx.supabase.from("customers").select("id, name, phone").eq("id", customerId).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase
      .from("khata_entries")
      .select("id, kind, amount_paise, note, created_at")
      .eq("supplier_org_id", ctx.org.id)
      .eq("customer_id", customerId)
      .order("created_at"),
  ]);
  if (!c) notFound();
  const rows: (NonNullable<typeof entries>[number] & { running: number })[] = [];
  for (const e of entries ?? []) {
    const prev = rows.length ? rows[rows.length - 1].running : 0;
    rows.push({ ...e, running: prev + (e.kind === "debit" ? 1 : -1) * Number(e.amount_paise) });
  }
  const balance = rows.length ? rows[rows.length - 1].running : 0;
  const phone = (c.phone ?? "").replace(/\D/g, "");
  const recent = rows.slice(-5).map((r) => `${dateOnly(r.created_at)}: ${r.kind === "debit" ? "" : "Paid "}${rupees(Number(r.amount_paise))} ${r.note ?? ""}`);
  const message = [
    `Namaste ${c.name},`,
    `Your balance with ${ctx.org.name} is *${rupees(balance)}*.`,
    ``,
    `Recent entries:`,
    ...recent,
    ``,
    `Please arrange payment at your earliest. Thank you!`,
  ].join("\n");
  const wa = `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(message)}`;

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/khata", label: "Khata" }}
        title={c.name}
        description="Running statement — entries are never edited; a correction is a new entry."
        actions={
          balance > 0 ? (
            <a href={wa} target="_blank" rel="noreferrer" className={buttonClass({ size: "sm" }, "bg-[#25d366] hover:bg-[#1fb457]")}>
              <MessageCircle className="size-4" /> WhatsApp reminder
            </a>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Stat label="Balance due" value={rupees(balance)} tone={balance > 0 ? "red" : "green"} />
          <Card>
            <CardHeader title="Statement" />
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Details</Th>
                  <Th className="text-right">Debit</Th>
                  <Th className="text-right">Credit</Th>
                  <Th className="text-right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.id}>
                    <Td>{dateOnly(r.created_at)}</Td>
                    <Td>{r.note ?? "—"}</Td>
                    <Td className="text-right font-mono">{r.kind === "debit" ? rupees(Number(r.amount_paise), { exact: true }) : ""}</Td>
                    <Td className="text-right font-mono text-brand-700">{r.kind === "credit" ? rupees(Number(r.amount_paise), { exact: true }) : ""}</Td>
                    <Td className="text-right font-mono font-semibold">{rupees(r.running, { exact: true })}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
        <Card className="h-fit p-5">
          <h2 className="font-semibold">Record a payment</h2>
          <ActionForm action={recordPayment} className="mt-4 space-y-3" resetOnSuccess>
            <input type="hidden" name="customer_id" value={c.id} />
            <Field label="Amount (₹)">
              <input name="amount" inputMode="decimal" required className={inputClass} placeholder="5000" />
            </Field>
            <Field label="Mode">
              <select name="mode" className={selectClass}>
                <option>UPI</option>
                <option>Cash</option>
                <option>NEFT / RTGS</option>
                <option>Cheque</option>
              </select>
            </Field>
            <Field label="Reference">
              <input name="note" className={inputClass} placeholder="UTR / cheque no." />
            </Field>
            <SubmitButton className="w-full" variant="brand">
              Save payment
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
