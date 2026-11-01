"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendly, int, str, type ActionResult } from "@/lib/action";
import { getContext } from "@/lib/context";
import { modeFor, modulesFor } from "@/lib/modules-info";

async function platform() {
  const ctx = await getContext();
  if (!ctx.user.isPlatformAdmin) throw new Error("Platform admins only.");
  return ctx;
}

export async function setOrgPlan(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await platform();
  const orgId = str(form, "org_id");
  const kind = str(form, "kind") as "business" | "supplier";
  const modules = modulesFor(kind).filter((m) => form.get(`m_${m}`));
  const maxUsers = int(form, "max_users");
  const maxLocations = int(form, "max_locations");
  if (!maxUsers || !maxLocations) return { error: "Limits must be whole numbers above 0." };
  const { error } = await ctx.supabase
    .from("organisations")
    .update({
      modules,
      mode: modeFor(kind, modules),
      plan: str(form, "plan") || "standard",
      max_users: maxUsers,
      max_locations: maxLocations,
      active: form.get("active") === "on",
    })
    .eq("id", orgId);
  if (error) return { error: friendly(error) };
  await ctx.supabase.from("audit_log").insert({
    org_id: orgId,
    actor: ctx.user.id,
    action: "platform.plan_changed",
    entity: "organisation",
    entity_id: orgId,
    details: { modules, max_users: maxUsers, max_locations: maxLocations, active: form.get("active") === "on" },
  });
  revalidatePath("/admin", "layout");
  return { ok: `Saved — Mode ${modeFor(kind, modules)}, ${maxUsers} users, ${maxLocations} locations.` };
}

export async function createOrg(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await platform();
  const mode = str(form, "mode") as "A" | "B" | "C" | "D";
  const kind = mode === "D" ? "supplier" : "business";
  const modules = modulesFor(kind).filter((m) => form.get(`m_${m}`));
  if (kind === "business" && !modules.includes("inventory")) modules.unshift("inventory");
  if (kind === "supplier" && !modules.includes("supplier")) modules.unshift("supplier");
  const locations: { name: string; kind: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const name = str(form, `loc_name_${i}`);
    if (name) locations.push({ name, kind: str(form, `loc_kind_${i}`) || "outlet" });
  }
  const { data, error } = await ctx.supabase.rpc("platform_create_org", {
    p_name: str(form, "name"),
    p_mode: modeFor(kind, modules),
    p_modules: modules,
    p_plan: str(form, "plan"),
    p_max_users: int(form, "max_users") ?? 10,
    p_max_locations: int(form, "max_locations") ?? 5,
    p_locations: locations,
    p_admin_email: str(form, "admin_email").toLowerCase(),
    p_admin_name: str(form, "admin_name"),
    p_admin_password: str(form, "admin_password"),
    p_city: str(form, "city"),
    p_gstin: str(form, "gstin"),
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/admin", "layout");
  redirect(`/admin/org/${data}?created=1`);
}

export async function linkSupplier(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await platform();
  const { error } = await ctx.supabase.rpc("platform_link_supplier", {
    p_business: str(form, "business_id"),
    p_supplier: str(form, "supplier_id"),
    p_location: str(form, "location_id") || null,
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/admin", "layout");
  return { ok: "Connected. They now appear in each other's supplier / customer lists." };
}
