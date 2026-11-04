import type { Metadata } from "next";
import Link from "next/link";
import { PasswordField } from "@/components/app/password-field";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, CardHeader, Field, inputClass, Notice, PageHeader, selectClass, Stat, Table, Td, Th } from "@/components/ui/kit";
import { getContext, modeLabels, type Mode } from "@/lib/context";
import { dateOnly, rupees } from "@/lib/format";
import { moduleInfo, modulesFor } from "@/lib/modules-info";
import { createOrg } from "./actions";

export const metadata: Metadata = { title: "Platform admin" };

type OrgMetric = {
  org_id: string;
  user_count: number;
  location_count: number;
  recipe_count: number;
  stocked_products: number;
  stock_value_paise: number;
  stock_events_7d: number;
  sales_7d_paise: number;
  sales_30d_paise: number;
  portions_30d: number;
};

type DailySale = { sale_day: string; revenue_paise: number; portions: number };

export default async function AdminPage() {
  const ctx = await getContext();
  const [{ data: orgs, error: orgsError }, { data: metricRows, error: metricsError }, { data: dailyRows, error: dailyError }] = await Promise.all([
    ctx.supabase.from("organisations").select("id, name, kind, mode, plan, max_users, max_locations, active, city, created_at").order("created_at"),
    ctx.supabase.rpc("platform_org_metrics"),
    ctx.supabase.rpc("platform_daily_sales"),
  ]);
  const metrics = new Map(((metricRows ?? []) as OrgMetric[]).map((row) => [row.org_id, row]));
  const daily = (dailyRows ?? []) as DailySale[];
  const maxRevenue = Math.max(1, ...daily.map((row) => Number(row.revenue_paise)));
  const businesses = (orgs ?? []).filter((org) => org.kind === "business");
  const total = (field: keyof OrgMetric) => businesses.reduce((sum, org) => sum + Number(metrics.get(org.id)?.[field] ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Platform admin"
        description="Provision businesses and suppliers, set their plan limits and modules, manage any team. Every change is audited."
      />
      {orgsError && (
        <div className="mb-6">
          <Notice tone="red">
            Could not load organisations: {orgsError.message}.
          </Notice>
        </div>
      )}
      {(metricsError || dailyError) && (
        <div className="mb-6"><Notice tone="red">Could not load platform analytics: {metricsError?.message ?? dailyError?.message}</Notice></div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Businesses" value={businesses.length} />
        <Stat label="Suppliers" value={(orgs ?? []).filter((org) => org.kind === "supplier").length} />
        <Stat label="Sales (30 days)" value={rupees(total("sales_30d_paise"))} />
        <Stat label="Stock value" value={rupees(total("stock_value_paise"))} />
        <Stat label="Stock events (7 days)" value={total("stock_events_7d")} />
      </div>

      <Card className="mb-8 p-5">
        <h2 className="font-semibold">Sales across businesses</h2>
        <p className="mt-1 text-sm text-muted">Last 14 calendar days · recorded recipe sales</p>
        <div className="mt-5 flex h-40 items-end gap-1.5" role="img" aria-label="Daily sales revenue across all businesses for the last 14 days">
          {daily.map((row) => (
            <div key={row.sale_day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${row.sale_day}: ${rupees(row.revenue_paise)}, ${row.portions} portions`}>
              <div className="w-full rounded-t bg-brand-500" style={{ height: `${Math.max(3, Number(row.revenue_paise) / maxRevenue * 115)}px` }} />
              <span className="text-[10px] text-muted">{row.sale_day.slice(5)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-8">
        <CardHeader title="Business overview" description="Open any workspace to manage its plan, team, locations and connections. Values reflect recorded data." />
        <Table>
          <thead>
            <tr>
              <Th>Organisation</Th>
              <Th>Mode</Th>
              <Th>Plan</Th>
              <Th>Users</Th>
              <Th>Locations</Th>
              <Th>Products</Th>
              <Th>Recipes</Th>
              <Th>Stock value</Th>
              <Th>Sales (30d)</Th>
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
                  {o.name.includes("(Demo)") && <Badge tone="amber">Sample data</Badge>}
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
                  {metrics.get(o.id)?.user_count ?? 0} / {o.max_users}
                </Td>
                <Td>
                  {metrics.get(o.id)?.location_count ?? 0} / {o.max_locations}
                </Td>
                <Td>{metrics.get(o.id)?.stocked_products ?? 0}</Td>
                <Td>{metrics.get(o.id)?.recipe_count ?? 0}</Td>
                <Td>{rupees(metrics.get(o.id)?.stock_value_paise)}</Td>
                <Td>{rupees(metrics.get(o.id)?.sales_30d_paise)}</Td>
                <Td>{metrics.get(o.id)?.stock_events_7d ?? 0}</Td>
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
