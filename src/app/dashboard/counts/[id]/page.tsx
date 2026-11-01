import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, inputClass, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireOrg } from "@/lib/context";
import { loadProducts } from "@/lib/data";
import { dateTime, qty } from "@/lib/format";
import { saveCount } from "../actions";

export const metadata: Metadata = { title: "Count" };

const displayUnit = { g: "kg", ml: "L", pc: "pc" } as const;

export default async function CountPage({ params }: PageProps<"/dashboard/counts/[id]">) {
  const ctx = await requireOrg();
  const { id } = await params;
  const [{ data: c }, products] = await Promise.all([
    ctx.supabase
      .from("counts")
      .select("id, status, location_id, started_at, completed_at, count_lines(id, product_id, system_qty, counted_qty)")
      .eq("id", id)
      .maybeSingle(),
    loadProducts(ctx.supabase, ctx.org.id),
  ]);
  if (!c) notFound();
  const byId = new Map(products.map((p) => [p.id, p]));
  const location = ctx.allLocations.find((l) => l.id === c.location_id);
  const lines = (c.count_lines as { id: string; product_id: string; system_qty: number; counted_qty: number | null }[])
    .map((l) => ({ ...l, p: byId.get(l.product_id)! }))
    .filter((l) => l.p)
    .sort((a, b) => a.p.item.category.localeCompare(b.p.item.category) || a.p.name.localeCompare(b.p.name));
  const open = c.status === "open";

  return (
    <div>
      <PageHeader
        back={{ href: "/dashboard/counts", label: "Counts" }}
        title={`Count · ${location?.name ?? ""}`}
        description={open ? "Enter what you actually see. Leave blank anything you didn't count." : `Completed ${dateTime(c.completed_at)}`}
        actions={<StatusBadge status={c.status} />}
      />
      <ActionForm action={saveCount}>
        <input type="hidden" name="count_id" value={c.id} />
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th className="text-right">System</Th>
                <Th>Counted</Th>
                {!open && <Th className="text-right">Gap</Th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const unit = l.p.item.base_unit;
                const du = displayUnit[unit];
                const gap = l.counted_qty === null ? null : Number(l.counted_qty) - Number(l.system_qty);
                return (
                  <tr key={l.id}>
                    <Td>
                      <p className="font-medium">{l.p.name}</p>
                      <p className="text-xs text-muted">
                        {l.p.item.category} · {l.p.pack_label} per pack
                      </p>
                    </Td>
                    <Td className="text-right font-mono text-muted">{qty(l.system_qty, unit)}</Td>
                    <Td>
                      {open ? (
                        <div className="flex items-center gap-2">
                          <input
                            name={`line_${l.id}_${l.product_id}`}
                            defaultValue={l.counted_qty === null ? "" : unit === "pc" ? l.counted_qty : Number(l.counted_qty) / 1000}
                            inputMode="decimal"
                            aria-label={`Counted ${l.p.name}`}
                            className={inputClass + " w-28 font-mono"}
                          />
                          <input type="hidden" name={`unit_${l.id}`} value={du} />
                          <span className="text-sm text-muted">{du}</span>
                        </div>
                      ) : (
                        <span className="font-mono">{l.counted_qty === null ? "—" : qty(l.counted_qty, unit)}</span>
                      )}
                    </Td>
                    {!open && (
                      <Td className="text-right">
                        {gap === null ? (
                          "—"
                        ) : gap === 0 ? (
                          <Badge tone="green">exact</Badge>
                        ) : (
                          <span className={`font-mono ${gap < 0 ? "text-danger-600" : "text-brand-700"}`}>
                            {gap > 0 ? "+" : ""}
                            {qty(gap, unit)}
                          </span>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {open && (
            <div className="flex flex-wrap justify-end gap-2 p-5">
              <SubmitButton name="intent" value="save" variant="outline">
                Save progress
              </SubmitButton>
              <SubmitButton name="intent" value="complete" variant="brand" confirm="Complete the count? Stock will be set to what you counted.">
                Complete count
              </SubmitButton>
            </div>
          )}
        </Card>
      </ActionForm>
    </div>
  );
}
