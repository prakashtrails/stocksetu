import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/kit";
import { requireOrg } from "@/lib/context";
import { dateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  const ctx = await requireOrg();
  const [{ data }, { data: people }] = await Promise.all([
    ctx.supabase.from("audit_log").select("id, action, entity, details, created_at, actor").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.from("profiles").select("id, full_name, email"),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Who approved what: receipts with differences, dispatches, transfers, count adjustments, role and module changes."
      />
      <Card>
        {data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap">{dateTime(a.created_at)}</Td>
                  <Td>{(a.actor && who.get(a.actor)) || "—"}</Td>
                  <Td className="font-mono text-xs">{a.action}</Td>
                  <Td className="max-w-md truncate font-mono text-xs text-muted">{JSON.stringify(a.details)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<ShieldCheck className="size-5" />} title="Nothing logged yet" />
        )}
      </Card>
    </div>
  );
}
