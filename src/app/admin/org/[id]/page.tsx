import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { archiveLocation, addLocation } from "@/app/dashboard/settings/actions";
import { TeamPanel } from "@/components/app/team-panel";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, CardHeader, Field, inputClass, Notice, PageHeader, selectClass } from "@/components/ui/kit";
import { getContext, modeLabels, type Mode } from "@/lib/context";
import { dateTime } from "@/lib/format";
import { moduleInfo, modulesFor } from "@/lib/modules-info";
import { linkSupplier, setOrgPlan } from "../../actions";

export const metadata: Metadata = { title: "Organisation" };

export default async function AdminOrgPage({ params, searchParams }: PageProps<"/admin/org/[id]">) {
  const ctx = await getContext();
  const { id } = await params;
  const sp = (await searchParams) as { created?: string };
  const { data: org } = await ctx.supabase
    .from("organisations")
    .select("id, name, kind, mode, modules, plan, max_users, max_locations, active, city, gstin, phone")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const [{ data: locations }, { data: suppliers }, { data: customers }, { data: allOrgs }, { data: audit }] = await Promise.all([
    ctx.supabase.from("locations").select("id, name, kind").eq("org_id", id).eq("archived", false).order("name"),
    ctx.supabase.from("suppliers").select("id, name, linked_org_id, phone").eq("org_id", id).order("name"),
    ctx.supabase.from("customers").select("id, name, linked_org_id, phone").eq("org_id", id).order("name"),
    ctx.supabase.from("organisations").select("id, name, kind").order("name"),
    ctx.supabase.from("audit_log").select("id, action, created_at").eq("org_id", id).order("created_at", { ascending: false }).limit(8),
  ]);
  const kind = org.kind as "business" | "supplier";
  const otherSide = (allOrgs ?? []).filter((o) => o.kind !== kind);
  const linkedIds = new Set([...(suppliers ?? []), ...(customers ?? [])].map((x) => x.linked_org_id).filter(Boolean));

  return (
    <div>
      <PageHeader
        back={{ href: "/admin", label: "All organisations" }}
        title={org.name}
        description={`Mode ${org.mode} · ${modeLabels[org.mode as Mode]}${org.city ? ` · ${org.city}` : ""}`}
        actions={org.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>}
      />
      {sp.created && (
        <div className="mb-6">
          <Notice tone="green">Workspace created. Share the admin login you set — they can sign in now and create their team.</Notice>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-semibold">Plan, limits &amp; modules</h2>
            <ActionForm action={setOrgPlan} className="mt-4 space-y-4">
              <input type="hidden" name="org_id" value={org.id} />
              <input type="hidden" name="kind" value={kind} />
              <div className="grid grid-cols-3 gap-2">
                <Field label="Plan">
                  <input name="plan" defaultValue={org.plan} className={inputClass} />
                </Field>
                <Field label="Max users">
                  <input name="max_users" inputMode="numeric" defaultValue={org.max_users} className={inputClass} />
                </Field>
                <Field label="Max locations">
                  <input name="max_locations" inputMode="numeric" defaultValue={org.max_locations} className={inputClass} />
                </Field>
              </div>
              <div className="space-y-2">
                {modulesFor(kind).map((m) => (
                  <label key={m} className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm hover:bg-paper/50">
                    <input type="checkbox" name={`m_${m}`} defaultChecked={(org.modules as string[]).includes(m)} className="mt-0.5 size-4 accent-brand-600" />
                    <span>
                      <span className="block font-medium">{moduleInfo[m].title}</span>
                      <span className="block text-xs text-muted">{moduleInfo[m].text}</span>
                    </span>
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={org.active} className="size-4 accent-brand-600" /> Active (untick to suspend access)
              </label>
              <SubmitButton variant="brand">Save plan</SubmitButton>
            </ActionForm>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Locations"
                actions={
                  <Badge>
                    {locations?.length ?? 0} / {org.max_locations}
                  </Badge>
                }
              />
              <ul className="divide-y divide-line">
                {(locations ?? []).map((l) => (
                  <li key={l.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span>
                      {l.name} <Badge>{l.kind}</Badge>
                    </span>
                    <form action={archiveLocation}>
                      <input type="hidden" name="id" value={l.id} />
                      <button className="text-xs text-muted hover:text-danger-600">Archive</button>
                    </form>
                  </li>
                ))}
              </ul>
              <ActionForm action={addLocation} className="flex flex-wrap items-end gap-2 border-t border-line p-4" resetOnSuccess>
                <input type="hidden" name="org_id" value={org.id} />
                <input name="name" required placeholder="New location" aria-label="New location" className={inputClass + " flex-1"} />
                <select name="kind" aria-label="Type" className={selectClass + " w-32"}>
                  <option value="outlet">Outlet</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="store">Store</option>
                </select>
                <SubmitButton size="sm">Add</SubmitButton>
              </ActionForm>
            </Card>

            <Card>
              <CardHeader
                title={kind === "business" ? "Connected suppliers" : "Connected customers"}
                description="Connected organisations exchange POs, shipments and khata in-app"
              />
              <ul className="divide-y divide-line">
                {(kind === "business" ? suppliers : customers)?.map((x) => (
                  <li key={x.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span>{x.name}</span>
                    {x.linked_org_id ? <Badge tone="green">on StockSetu</Badge> : <Badge>offline · {x.phone ?? "no phone"}</Badge>}
                  </li>
                ))}
              </ul>
              <ActionForm action={linkSupplier} className="flex flex-wrap items-end gap-2 border-t border-line p-4">
                {kind === "business" ? (
                  <>
                    <input type="hidden" name="business_id" value={org.id} />
                    <select name="supplier_id" aria-label="Supplier" className={selectClass + " flex-1"}>
                      {otherSide
                        .filter((o) => !linkedIds.has(o.id))
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                    <select name="location_id" aria-label="Deliver to" className={selectClass + " w-44"}>
                      {(locations ?? []).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <input type="hidden" name="supplier_id" value={org.id} />
                    <select name="business_id" aria-label="Business" className={selectClass + " flex-1"}>
                      {otherSide
                        .filter((o) => !linkedIds.has(o.id))
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                    </select>
                  </>
                )}
                <SubmitButton size="sm">Connect</SubmitButton>
              </ActionForm>
            </Card>
          </div>
        </div>

        <TeamPanel
          supabase={ctx.supabase}
          org={{ id: org.id, kind, max_users: org.max_users }}
          locations={locations ?? []}
          currentUserId={ctx.user.id}
        />

        <Card>
          <CardHeader title="Recent activity" />
          <ul className="divide-y divide-line">
            {(audit ?? []).map((a) => (
              <li key={a.id} className="flex justify-between px-5 py-2.5 text-sm">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="text-xs text-muted">{dateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
