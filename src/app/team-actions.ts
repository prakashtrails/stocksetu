"use server";

import { revalidatePath } from "next/cache";
import { friendly, str, type ActionResult } from "@/lib/action";
import { getContext } from "@/lib/context";

// Rights are enforced in the database functions (org admin of that
// organisation, or platform admin); these actions only pass the form along.

export async function createLogin(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  const locations = form.getAll("locations").map(String).filter(Boolean);
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const { error } = await ctx.supabase.rpc("create_user_account", {
    p_org: str(form, "org_id"),
    p_email: email,
    p_name: str(form, "name"),
    p_password: password,
    p_role: str(form, "role"),
    p_locations: locations.length ? locations : null,
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard/settings");
  revalidatePath("/admin", "layout");
  return { ok: `Login ready — ${email} / ${password}. Share it with them; they can log in right away.` };
}

export async function resetPassword(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  const password = str(form, "password");
  const { error } = await ctx.supabase.rpc("set_user_password", { p_user: str(form, "user_id"), p_password: password });
  if (error) return { error: friendly(error) };
  return { ok: `New password: ${password}` };
}

export async function removeMember(form: FormData) {
  const ctx = await getContext();
  const userId = str(form, "user_id");
  const orgId = str(form, "org_id");
  if (userId === ctx.user.id) return;
  await ctx.supabase.from("org_members").delete().eq("org_id", orgId).eq("user_id", userId);
  await ctx.supabase.from("audit_log").insert({
    org_id: orgId,
    actor: ctx.user.id,
    action: "member.removed",
    entity: "user",
    entity_id: userId,
    details: {},
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/admin", "layout");
}
