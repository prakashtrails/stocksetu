import type { Metadata } from "next";
import { Check, Lock } from "lucide-react";
import { TeamPanel } from "@/components/app/team-panel";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, CardHeader, Field, inputClass, PageHeader, selectClass } from "@/components/ui/kit";
import { modeLabels, requireOrg } from "@/lib/context";
import { moduleInfo, modulesFor } from "@/lib/modules-info";
import { addLocation, archiveLocation, saveOrg } from "./actions";

export const metadata: Metadata = { title: "Team & settings" };

export default async function SettingsPage() {
  const ctx = await requireOrg();
  if (!ctx.is("admin", "supplier_admin")) {
    return <PageHeader title="Team & settings" description="Only an admin can change settings." />;
  }
  const atLocationLimit = ctx.allLocations.length >= ctx.org.max_locations;

  return (
    <div>
      <PageHeader title="Team & settings" description={`Mode ${ctx.org.mode} · ${modeLabels[ctx.org.mode]}`} />
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-5">
            <h2 className="font-semibold">Your plan</h2>
            <p className="mt-1 text-2xl font-semibold capitalize">{ctx.org.plan}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Users allowed</dt>
                <dd className="font-medium">{ctx.org.max_users}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Locations</dt>
                <dd className="font-medium">
                  {ctx.allLocations.length} / {ctx.org.max_locations}
                </dd>
              </div>
            </dl>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-paper p-3 text-xs text-muted">
              <Lock className="mt-0.5 size-3.5 shrink-0" /> Plan, limits and modules are managed by the StockSetu team. Ask us to upgrade.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">Enabled modules</h2>
            <ul className="mt-3 space-y-2">
              {modulesFor(ctx.org.kind).map((m) => {
                const on = ctx.org.modules.includes(m);
                return (
                  <li key={m} className={`flex items-start gap-2.5 text-sm ${on ? "" : "opacity-50"}`}>
                    <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded ${on ? "bg-brand-600 text-white" : "bg-line"}`}>
                      {on && <Check className="size-3" />}
                    </span>
                    <span>
                      <span className="block font-medium">{moduleInfo[m].title}</span>
                      <span className="block text-xs text-muted">{moduleInfo[m].text}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">Business details</h2>
            <ActionForm action={saveOrg} className="mt-4 space-y-3">
              <Field label="Name">
                <input name="name" defaultValue={ctx.org.name} required className={inputClass} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="GSTIN">
                  <input name="gstin" defaultValue={ctx.org.gstin ?? ""} className={inputClass + " uppercase"} />
                </Field>
                <Field label="Phone">
                  <input name="phone" defaultValue={ctx.org.phone ?? ""} className={inputClass} />
                </Field>
              </div>
              <Field label="City">
                <input name="city" defaultValue={ctx.org.city ?? ""} className={inputClass} />
              </Field>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <TeamPanel supabase={ctx.supabase} org={ctx.org} locations={ctx.allLocations} currentUserId={ctx.user.id} />

        <Card>
          <CardHeader
            title="Locations"
            description="Each place that holds stock"
            actions={
              <Badge tone={atLocationLimit ? "red" : "green"}>
                {ctx.allLocations.length} / {ctx.org.max_locations}
              </Badge>
            }
          />
          <ul className="divide-y divide-line">
            {ctx.allLocations.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-medium">{l.name}</span> <Badge>{l.kind}</Badge>
                </span>
                <form action={archiveLocation}>
                  <input type="hidden" name="id" value={l.id} />
                  <button className="text-xs text-muted hover:text-danger-600">Archive</button>
                </form>
              </li>
            ))}
          </ul>
          {!atLocationLimit && (
            <ActionForm action={addLocation} className="flex flex-wrap items-end gap-3 border-t border-line p-5" resetOnSuccess>
              <Field label="New location" className="flex-1">
                <input name="name" required className={inputClass} placeholder="Outlet Gurgaon" />
              </Field>
              <Field label="Type">
                <select name="kind" className={selectClass}>
                  <option value="outlet">Outlet</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="store">Store</option>
                </select>
              </Field>
              <SubmitButton>Add location</SubmitButton>
            </ActionForm>
          )}
        </Card>
      </div>
    </div>
  );
}
