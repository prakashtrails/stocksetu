"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext, ORG_COOKIE, PLATFORM_ORG_COOKIE } from "@/lib/context";

export async function switchOrg(orgId: string) {
  const ctx = await getContext();
  const cookieStore = await cookies();
  if (!ctx.memberships.some((m) => m.org.id === orgId)) {
    if (!ctx.user.isPlatformAdmin) return;
    const { data: org } = await ctx.supabase.from("organisations").select("id").eq("id", orgId).maybeSingle();
    if (!org) return;
    cookieStore.set(PLATFORM_ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    cookieStore.delete(ORG_COOKIE);
  } else {
    cookieStore.set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    cookieStore.delete(PLATFORM_ORG_COOKIE);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
