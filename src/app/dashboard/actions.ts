"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext, ORG_COOKIE } from "@/lib/context";

export async function switchOrg(orgId: string) {
  const ctx = await getContext();
  if (!ctx.memberships.some((m) => m.org.id === orgId)) {
    if (!ctx.user.isPlatformAdmin) return;
    const { data: org } = await ctx.supabase.from("organisations").select("id").eq("id", orgId).maybeSingle();
    if (!org) return;
  }
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
