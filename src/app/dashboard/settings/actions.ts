"use server";

import { revalidatePath } from "next/cache";
import { friendly, str, type ActionResult } from "@/lib/action";
import { getContext, requireOrg } from "@/lib/context";

async function adminCtx() {
  const ctx = await requireOrg();
  if (!ctx.is("admin", "supplier_admin")) throw new Error("Only an admin can change settings.");
  return ctx;
}

export async function saveOrg(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await adminCtx();
  const { error } = await ctx.supabase
    .from("organisations")
    .update({
      name: str(form, "name"),
      gstin: str(form, "gstin").toUpperCase() || null,
      phone: str(form, "phone") || null,
      city: str(form, "city") || null,
    })
    .eq("id", ctx.org.id);
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: "Saved." };
}

// Used by the business admin (own org) and the platform admin (org_id in the form).
export async function addLocation(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  const orgId = str(form, "org_id") || ctx.org?.id;
  if (!orgId) return { error: "No organisation selected." };
  const name = str(form, "name");
  if (!name) return { error: "Name the location." };
  const { error } = await ctx.supabase.from("locations").insert({ org_id: orgId, name, kind: str(form, "kind") });
  if (error) return { error: friendly(error) };
  await ctx.supabase.from("audit_log").insert({ org_id: orgId, actor: ctx.user.id, action: "location.added", entity: "location", details: { name } });
  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
  return { ok: `${name} added.` };
}

export async function archiveLocation(form: FormData) {
  const ctx = await getContext();
  const id = str(form, "id");
  const { data } = await ctx.supabase.from("locations").update({ archived: true }).eq("id", id).select("org_id").maybeSingle();
  if (data) {
    await ctx.supabase.from("audit_log").insert({ org_id: data.org_id, actor: ctx.user.id, action: "location.archived", entity: "location", entity_id: id });
  }
  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
}
