import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type Role = "admin" | "warehouse" | "outlet" | "staff" | "supplier_admin" | "supplier_staff";
export type Mode = "A" | "B" | "C" | "D";
export type ModuleKey =
  | "inventory"
  | "transfers"
  | "procurement"
  | "food_cost"
  | "supplier"
  | "khata"
  | "supplier_inventory";

export type Org = {
  id: string;
  name: string;
  kind: "business" | "supplier";
  mode: Mode;
  modules: ModuleKey[];
  gstin: string | null;
  phone: string | null;
  city: string | null;
  plan: string;
  max_users: number;
  max_locations: number;
  active: boolean;
};

export type Location = { id: string; name: string; kind: "warehouse" | "outlet" | "kitchen" | "store"; org_id: string };

export type Membership = { org: Org; role: Role; location_ids: string[] | null };

export type AppContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
  memberships: Membership[];
  org: Org | null;
  role: Role | null;
  // Locations this member may work in (scope applied)
  locations: Location[];
  // Every location of the org (names only, for transfer destinations)
  allLocations: Location[];
  has: (m: ModuleKey) => boolean;
  is: (...roles: Role[]) => boolean;
};

export const ORG_COOKIE = "ss_org";

export const roleLabels: Record<Role, string> = {
  admin: "Business admin",
  warehouse: "Warehouse manager",
  outlet: "Outlet manager",
  staff: "Staff",
  supplier_admin: "Supplier admin",
  supplier_staff: "Supplier staff",
};

export const modeLabels: Record<Mode, string> = {
  A: "Inventory only",
  B: "Warehouse + outlets",
  C: "Full procurement",
  D: "Supplier",
};

// Read once per request: who is signed in, which organisation they're working in,
// their role, enabled modules and permitted locations.
export const getContext = cache(async (): Promise<AppContext> => {
  if (!isSupabaseConfigured) redirect("/login?setup=1");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, is_platform_admin").eq("id", auth.user.id).maybeSingle(),
    supabase
      .from("org_members")
      .select("role, location_ids, organisations(id, name, kind, mode, modules, gstin, phone, city, plan, max_users, max_locations, active)")
      .eq("user_id", auth.user.id),
  ]);

  const memberships: Membership[] = (rows ?? [])
    .filter((r) => r.organisations)
    .map((r) => ({
      org: r.organisations as unknown as Org,
      role: r.role as Role,
      location_ids: r.location_ids as string[] | null,
    }))
    .sort((a, b) => a.org.name.localeCompare(b.org.name));

  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.org.id === wanted) ?? memberships[0] ?? null;

  let allLocations: Location[] = [];
  if (active) {
    const { data } = await supabase
      .from("locations")
      .select("id, name, kind, org_id")
      .eq("org_id", active.org.id)
      .eq("archived", false)
      .order("name");
    allLocations = (data ?? []) as Location[];
  }
  const locations = active?.location_ids
    ? allLocations.filter((l) => active.location_ids!.includes(l.id))
    : allLocations;

  const name = profile?.full_name || auth.user.email?.split("@")[0] || "there";

  return {
    supabase,
    user: {
      id: auth.user.id,
      email: auth.user.email ?? "",
      name,
      isPlatformAdmin: Boolean(profile?.is_platform_admin),
    },
    memberships,
    org: active?.org ?? null,
    role: active?.role ?? null,
    locations,
    allLocations,
    has: (m) => Boolean(active?.org.modules.includes(m)),
    is: (...roles) => Boolean(active && roles.includes(active.role)),
  };
});

// For pages inside the workspace: requires an organisation.
export async function requireOrg() {
  const ctx = await getContext();
  if (!ctx.org || !ctx.role) redirect(ctx.user.isPlatformAdmin ? "/admin" : "/onboarding");
  if (!ctx.org.active) redirect("/suspended");
  return ctx as AppContext & { org: Org; role: Role };
}

export async function requireModule(module: ModuleKey, roles?: Role[]) {
  const ctx = await requireOrg();
  if (!ctx.has(module) || (roles && !ctx.is(...roles))) redirect("/dashboard?denied=1");
  return ctx;
}
