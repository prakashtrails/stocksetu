import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, inputClass, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/kit";
import { requireModule } from "@/lib/context";
import { dateTime } from "@/lib/format";
import { findByCode } from "../receive/actions";

export const metadata: Metadata = { title: "Transfers" };

export default async function TransfersPage({ searchParams }: PageProps<"/dashboard/transfers">) {
  const ctx = await requireModule("transfers");
  const { status = "" } = (await searchParams) as { status?: string };
  let query = ctx.supabase
    .from("transfers")
    .select("id, code, status, from_location_id, to_location_id, created_at, dispatched_at, received_at, transfer_lines(id)")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));
  const filters = ["", "requested", "draft", "in_transit", "discrepancy", "received"];

  return (
    <div>
      <PageHeader
        title="Transfers"
        description="Move stock between your warehouse and outlets. One barcode per transfer note; the receiving outlet scans it and confirms the count."
        actions={
          <ButtonLink href="/dashboard/transfers/new" size="sm">
            <Plus className="size-4" /> {ctx.is("outlet", "staff") ? "Request stock" : "New transfer"}
          </ButtonLink>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <Link
              key={f || "all"}
              href={f ? `?status=${f}` : "?"}
              className={`rounded-full px-3.5 py-1.5 text-sm ${status === f ? "bg-ink text-white" : "border border-line text-muted hover:text-ink"}`}
            >
              {f ? f.replace("_", " ") : "All"}
            </Link>
          ))}
        </div>
        <form action={findByCode} className="flex gap-2">
          <input name="code" required placeholder="Scan TRF- code" className={inputClass + " w-44 font-mono uppercase"} />
          <button className="rounded-full bg-ink px-4 text-sm font-medium text-white">Open</button>
        </form>
      </div>
      <Card>
        {data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>From → To</Th>
                <Th>Lines</Th>
                <Th>Created</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id} className="hover:bg-paper/50">
                  <Td>
                    <Link href={`/dashboard/transfers/${t.id}`} className="font-mono font-medium text-brand-700 hover:underline">
                      {t.code}
                    </Link>
                  </Td>
                  <Td>
                    {locName.get(t.from_location_id)} → {locName.get(t.to_location_id)}
                  </Td>
                  <Td>{(t.transfer_lines as unknown[]).length}</Td>
                  <Td>{dateTime(t.created_at)}</Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<ArrowLeftRight className="size-5" />} title="No transfers here">
            Create one to send stock from the warehouse to an outlet.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
