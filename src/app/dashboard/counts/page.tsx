import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, EmptyState, Field, PageHeader, selectClass, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireOrg } from "@/lib/context";
import { dateTime } from "@/lib/format";
import { startCount } from "./actions";

export const metadata: Metadata = { title: "Counts" };

export default async function CountsPage() {
  const ctx = await requireOrg();
  const ids = ctx.locations.map((l) => l.id);
  const { data } = await ctx.supabase
    .from("counts")
    .select("id, status, location_id, started_at, completed_at, count_lines(id, counted_qty)")
    .in("location_id", ids.length ? ids : [""])
    .order("started_at", { ascending: false })
    .limit(30);
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));

  return (
    <div>
      <PageHeader
        title="Stock counts"
        description="Count what's physically there. The counted quantity becomes the truth, and the gap is recorded as usage — that's how consumption is measured without scanning every use."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-semibold">Start a count</h2>
          <ActionForm action={startCount} className="mt-4 space-y-4">
            <Field label="Location">
              <select name="location_id" className={selectClass}>
                {ctx.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="What to count" hint="Daily: high-value items. Weekly: everything.">
              <select name="scope" className={selectClass}>
                <option value="stocked">Items in stock or with a minimum here</option>
                <option value="all">All catalogue products</option>
              </select>
            </Field>
            <SubmitButton className="w-full">Start count</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Recent counts" />
          {data?.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Location</Th>
                  <Th>Started</Th>
                  <Th>Progress</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => {
                  const lines = c.count_lines as { counted_qty: number | null }[];
                  return (
                    <tr key={c.id} className="hover:bg-paper/50">
                      <Td>
                        <Link href={`/dashboard/counts/${c.id}`} className="font-medium text-brand-700 hover:underline">
                          {locName.get(c.location_id)}
                        </Link>
                      </Td>
                      <Td>{dateTime(c.started_at)}</Td>
                      <Td>
                        {lines.filter((l) => l.counted_qty !== null).length} / {lines.length}
                      </Td>
                      <Td>
                        <StatusBadge status={c.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<ClipboardList className="size-5" />} title="No counts yet">
              Start your first count to set opening stock.
            </EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}
