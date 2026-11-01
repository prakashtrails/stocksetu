"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { friendly, str, type ActionResult } from "@/lib/action";
import { getContext, ORG_COOKIE } from "@/lib/context";

const KINDS = ["warehouse", "outlet", "kitchen", "store"];

export async function createOrganisation(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await getContext();
  const mode = str(form, "mode");
  if (!["A", "B", "C", "D"].includes(mode)) return { error: "Choose how you'll use StockSetu" };
  const name = str(form, "name");
  if (!name) return { error: "Enter your business name" };

  const locations: { name: string; kind: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const n = str(form, `loc_name_${i}`);
    const k = str(form, `loc_kind_${i}`);
    if (n && KINDS.includes(k)) locations.push({ name: n, kind: k });
  }
  if (!locations.length) return { error: "Add at least one location" };

  const { data, error } = await ctx.supabase.rpc("create_organisation", {
    p_name: name,
    p_mode: mode,
    p_locations: locations,
  });
  if (error) return { error: friendly(error) };

  (await cookies()).set(ORG_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}
