import { rupees } from "@/lib/format";
import { docTotals, lineTotals } from "@/lib/gst";

type Party = { name: string; gstin?: string | null; phone?: string | null; city?: string | null; extra?: string };

// Printable PO / tax invoice with GSTIN, HSN and a CGST+SGST breakup.
export function TaxDocument({
  title,
  number,
  date,
  from,
  to,
  lines,
  footer,
}: {
  title: string;
  number: string;
  date: string;
  from: Party;
  to: Party;
  lines: { name: string; pack_label: string; hsn?: string | null; qty: number; rate_paise: number; gst_bp: number }[];
  footer?: string;
}) {
  const totals = docTotals(lines.map((l) => ({ qty: l.qty, rate_paise: l.rate_paise, gst_bp: l.gst_bp })));
  return (
    <div className="rounded-2xl border border-line bg-white p-8 text-sm print:border-0 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{number}</p>
          <p className="text-muted">{date}</p>
        </div>
        <PartyBlock label="From" party={from} />
      </div>
      <div className="grid gap-4 border-b border-line py-5 sm:grid-cols-2">
        <PartyBlock label="To" party={to} />
      </div>
      <table className="mt-4 w-full">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted uppercase">
            <th className="py-2">Item</th>
            <th className="py-2">HSN</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Rate</th>
            <th className="py-2 text-right">GST</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const t = lineTotals({ qty: l.qty, rate_paise: l.rate_paise, gst_bp: l.gst_bp });
            return (
              <tr key={i} className="border-b border-line/60">
                <td className="py-2">
                  {l.name}
                  <span className="block text-xs text-muted">{l.pack_label} per pack</span>
                </td>
                <td className="py-2 font-mono text-xs">{l.hsn ?? "—"}</td>
                <td className="py-2 text-right font-mono">{l.qty}</td>
                <td className="py-2 text-right font-mono">{rupees(l.rate_paise, { exact: true })}</td>
                <td className="py-2 text-right font-mono">{l.gst_bp / 100}%</td>
                <td className="py-2 text-right font-mono">{rupees(t.total, { exact: true })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-4 ml-auto w-full max-w-xs space-y-1">
        <Row label="Taxable value" value={rupees(totals.taxable, { exact: true })} />
        <Row label="CGST" value={rupees(Math.floor(totals.tax / 2), { exact: true })} />
        <Row label="SGST" value={rupees(totals.tax - Math.floor(totals.tax / 2), { exact: true })} />
        <div className="border-t border-line pt-1">
          <Row label="Total" value={rupees(totals.total, { exact: true })} strong />
        </div>
      </div>
      {footer && <p className="mt-8 text-xs text-muted">{footer}</p>}
    </div>
  );
}

function PartyBlock({ label, party }: { label: string; party: Party }) {
  return (
    <div>
      <p className="text-xs text-muted uppercase">{label}</p>
      <p className="font-semibold">{party.name}</p>
      {party.extra && <p className="text-muted">{party.extra}</p>}
      {party.city && <p className="text-muted">{party.city}</p>}
      {party.gstin && <p className="font-mono text-xs">GSTIN {party.gstin}</p>}
      {party.phone && <p className="text-muted">{party.phone}</p>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
