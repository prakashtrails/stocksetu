"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE, PLATFORM_ORG_COOKIE } from "@/lib/context";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ORG_COOKIE);
  cookieStore.delete(PLATFORM_ORG_COOKIE);
  redirect("/login");
}
