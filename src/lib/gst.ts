// GST totals for document lines. Amounts are integer paise; tax is rounded per
// line (half-up) and split CGST/SGST for intra-state supply.
export type TaxLine = { qty: number; rate_paise: number; gst_bp: number };

export function lineTotals(l: TaxLine) {
  const taxable = l.qty * l.rate_paise;
  const tax = Math.round((taxable * l.gst_bp) / 10000);
  return { taxable, tax, total: taxable + tax };
}

export function docTotals(lines: TaxLine[]) {
  return lines.reduce(
    (s, l) => {
      const t = lineTotals(l);
      return { taxable: s.taxable + t.taxable, tax: s.tax + t.tax, total: s.total + t.total };
    },
    { taxable: 0, tax: 0, total: 0 },
  );
}
