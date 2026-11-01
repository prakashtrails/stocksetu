import type { Metadata } from "next";
import Link from "next/link";
import { PasswordField } from "@/components/app/password-field";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, CardHeader, Field, inputClass, Notice, PageHeader, selectClass, Stat, Table, Td, Th } from "@/components/ui/kit";
import { getContext, modeLabels, type Mode } from "@/lib/context";
import { dateOnly, daysAgo } from "@/lib/format";
import { moduleInfo, modulesFor } from "@/lib/modules-info";
import { createOrg } from "./actions";

export const metadata: Metadata = { title: "Platform admin" };

export default async function AdminPage() {
  const ctx = await getContext();
  const [{ data: orgs, error: orgsError }, { data: members }, { data: moves }, { data: locs }] = await Promise.all([
    ctx.supabase.from("organisations").select("id, name, kind, mode, plan, max_users, max_locations, active, city, created_at").order("created_at"),
    ctx.supabase.from("org_members").select("org_id"),
    ctx.supabase.from("stock_movements").select("org_id").gte("occurred_at", daysAgo(7)),
    ctx.supabase.from("locations").select("org_id").eq("archived", false),
  ]);
  const count = (rows: { org_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.org_id === id).length;

  return (
    <div>
      <PageHeader
        title="Platform admin"
        description="Provision businesses and suppliers, set their plan limits and modules, manage any team. Every change is audited."
      />
      {orgsError && (
        <div className="mb-6">
          <Notice tone="red">
            Could not load organisations: {orgsError.message}. If a column is missing, the latest database upgrade (supabase/deploy-02-haldiram.sql) has not been run yet.
          </Notice>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Organisations" value={orgs?.length ?? 0} />
        <Stat label="Businesses" value={(orgs ?? []).filter((o) => o.kind === "business").length} />
        <Stat label="Suppliers" value={(orgs ?? []).filter((o) => o.kind === "supplier").length} />
        <Stat label="Stock events (7 days)" value={moves?.length ?? 0} />
      </div>

      <Card className="mb-8">
        <CardHeader title="Workspaces" description="Open one to change its plan, team or connections" />
        <Table>
          <thead>
            <tr>
              <Th>Organisation</Th>
              <Th>Mode</Th>
              <Th>Plan</Th>
              <Th>Users</Th>
              <Th>Locations</Th>
              <Th>Activity (7d)</Th>
              <Th>Since</Th>
            </tr>
          </thead>
          <tbody>
            {(orgs ?? []).map((o) => (
              <tr key={o.id} className="hover:bg-paper/50">
                <Td>
                  <Link href={`/admin/org/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    {o.name}
                  </Link>
                  <p className="text-xs text-muted">{o.city ?? ""}</p>
                </Td>
                <Td>
                  <Badge tone={o.kind === "supplier" ? "blue" : "green"}>
                    {o.mode} · {modeLabels[o.mode as Mode]}
                  </Badge>
                </Td>
                <Td className="capitalize">
                  {o.plan} {!o.active && <Badge tone="red">suspended</Badge>}
                </Td>
                <Td>
                  {count(members, o.id)} / {o.max_users}
                </Td>
                <Td>
                  {count(locs, o.id)} / {o.max_locations}
                </Td>
                <Td>{count(moves, o.id)}</Td>
                <Td>{dateOnly(o.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold">Provision a new business or supplier</h2>
        <p className="mt-1 text-sm text-muted">Creates the workspace, its locations and the first admin login. The admin can then create their own team within the limits.</p>
        <ActionForm action={createOrg} className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Name" className="md:col-span-2">
              <input name="name" required className={inputClass} placeholder="e.g. Bikaner Sweets" />
            </Field>
            <Field label="Type">
              <select name="mode" className={selectClass} defaultValue="C">
                <option value="A">Business — inventory only</option>
                <option value="B">Business — warehouse + outlets</option>
                <option value="C">Business — full procurement</option>
                <option value="D">Supplier</option>
              </select>
            </Field>
            <Field label="City">
              <input name="city" className={inputClass} />
            </Field>
            <Field label="Plan name">
              <input name="plan" defaultValue="business" className={inputClass} />
            </Field>
            <Field label="Max users">
              <input name="max_users" inputMode="numeric" defaultValue="10" className={inputClass} />
            </Field>
            <Field label="Max locations">
              <input name="max_locations" inputMode="numeric" defaultValue="5" className={inputClass} />
            </Field>
            <Field label="GSTIN">
              <input name="gstin" className={inputClass + " uppercase"} />
            </Field>
          </div>

          <div>
            <p className="text-sm font-medium">Modules</p>
            <p className="text-xs text-muted">Business modules apply to types A–C; supplier modules to suppliers. Mode is worked out from what you tick.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[...modulesFor("business"), ...modulesFor("supplier").filter((m) => m !== "procurement")].map((m) => (
                <label key={m} className="flex items-start gap-2 rounded-xl border border-line bg-white p-3 text-sm">
                  <input type="checkbox" name={`m_${m}`} defaultChecked={["inventory", "transfers", "procurement", "food_cost", "supplier", "khata"].includes(m)} className="mt-0.5 size-4 accent-brand-600" />
                  <span>
                    <span className="block font-medium">{moduleInfo[m].title}</span>
                    <span className="block text-xs text-muted">{moduleInfo[m].text}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Locations</p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {[
                { n: "Central Warehouse", k: "warehouse" },
                { n: "Outlet 1", k: "outlet" },
                { n: "", k: "outlet" },
              ].map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input name={`loc_name_${i}`} defaultValue={l.n} placeholder="Optional" aria-label={`Location ${i + 1}`} className={inputClass} />
                  <select name={`loc_kind_${i}`} defaultValue={l.k} aria-label={`Location ${i + 1} type`} className={selectClass + " w-32"}>
                    <option value="warehouse">Warehouse</option>
                    <option value="outlet">Outlet</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="store">Store</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">First admin login</p>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              <Field label="Name">
                <input name="admin_name" required className={inputClass} />
              </Field>
              <Field label="Email (login id)">
                <input name="admin_email" type="email" required className={inputClass} />
              </Field>
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Password</span>
                <PasswordField name="admin_password" />
              </div>
            </div>
          </div>

          <SubmitButton variant="brand" size="lg">
            Create workspace
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
