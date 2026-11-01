import { KeyRound, X } from "lucide-react";
import { createLogin, removeMember, resetPassword } from "@/app/team-actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Card, CardHeader, Field, inputClass, selectClass, Table, Td, Th } from "@/components/ui/kit";
import { roleLabels, type AppContext, type Role } from "@/lib/context";
import { PasswordField } from "./password-field";

// Team management for one organisation: used by the business admin (Settings)
// and by the platform admin (Admin → organisation).
export async function TeamPanel({
  supabase,
  org,
  locations,
  currentUserId,
}: {
  supabase: AppContext["supabase"];
  org: { id: string; kind: "business" | "supplier"; max_users: number };
  locations: { id: string; name: string }[];
  currentUserId: string;
}) {
  const { data: members } = await supabase.from("org_members").select("user_id, role, location_ids, created_at").eq("org_id", org.id).order("created_at");
  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", (members ?? []).map((m) => m.user_id));
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const roles: Role[] = org.kind === "supplier" ? ["supplier_admin", "supplier_staff"] : ["admin", "warehouse", "outlet", "staff"];
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const used = members?.length ?? 0;
  const full = used >= org.max_users;

  return (
    <Card>
      <CardHeader
        title="Team"
        description="Role decides what someone can do; locations decide which stock they can see."
        actions={
          <Badge tone={full ? "red" : used / org.max_users > 0.8 ? "amber" : "green"}>
            {used} / {org.max_users} users
          </Badge>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th>Locations</Th>
            <Th>Reset password</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {(members ?? []).map((m) => {
            const p = person.get(m.user_id);
            const isMe = m.user_id === currentUserId;
            return (
              <tr key={m.user_id}>
                <Td>
                  <p className="font-medium">
                    {p?.full_name || p?.email} {isMe && <span className="text-xs text-muted">(you)</span>}
                  </p>
                  <p className="font-mono text-xs text-muted">{p?.email}</p>
                </Td>
                <Td>
                  <Badge tone={m.role.includes("admin") ? "dark" : "gray"}>{roleLabels[m.role as Role]}</Badge>
                </Td>
                <Td className="text-sm">{m.location_ids ? (m.location_ids as string[]).map((id) => locName.get(id)).join(", ") : "All locations"}</Td>
                <Td className="w-56">
                  {!isMe && (
                    <ActionForm action={resetPassword} className="flex items-start gap-1">
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <div className="flex-1">
                        <PasswordField compact />
                      </div>
                      <SubmitButton size="sm" variant="outline" className="h-8 px-2.5">
                        <KeyRound className="size-3.5" />
                      </SubmitButton>
                    </ActionForm>
                  )}
                </Td>
                <Td className="text-right">
                  {!isMe && (
                    <form action={removeMember}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <input type="hidden" name="org_id" value={org.id} />
                      <button aria-label="Remove from team" title="Remove from team" className="text-muted hover:text-danger-600">
                        <X className="size-4" />
                      </button>
                    </form>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="border-t border-line p-5">
        <p className="font-medium">Create a login</p>
        <p className="mt-0.5 text-sm text-muted">
          {full
            ? "You've used every seat on your plan. Remove someone or ask StockSetu to raise the limit."
            : "They can log in straight away with this email and password — no email confirmation needed."}
        </p>
        {!full && (
          <ActionForm action={createLogin} className="mt-4 grid items-end gap-3 md:grid-cols-12" resetOnSuccess>
            <input type="hidden" name="org_id" value={org.id} />
            <Field label="Full name" className="md:col-span-3">
              <input name="name" required className={inputClass} placeholder="Ravi Kumar" />
            </Field>
            <Field label="Email (login id)" className="md:col-span-3">
              <input name="email" type="email" required className={inputClass} placeholder="ravi@business.in" />
            </Field>
            <div className="space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium">Password</span>
              <PasswordField />
            </div>
            <Field label="Role" className="md:col-span-2">
              <select name="role" className={selectClass}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Locations" hint="Ctrl-click for several; none = all" className="md:col-span-2">
              <select name="locations" multiple className={inputClass + " h-20 py-1"}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-12">
              <SubmitButton variant="brand">Create login</SubmitButton>
            </div>
          </ActionForm>
        )}
      </div>
    </Card>
  );
}
