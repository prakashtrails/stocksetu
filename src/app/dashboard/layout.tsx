import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Logo } from "@/components/logo";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { modeLabels, requireOrg, roleLabels } from "@/lib/context";
import { navGroups, visibleNav } from "@/lib/nav";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const ctx = await requireOrg();
  const items = visibleNav(ctx);
  const initials = ctx.user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const current = {
    id: ctx.org.id,
    name: ctx.org.name,
    mode: `Mode ${ctx.org.mode} · ${modeLabels[ctx.org.mode]}`,
    role: ctx.user.isPlatformAdmin ? "Platform admin" : roleLabels[ctx.role],
  };
  const orgs = ctx.memberships.map((m) => ({ id: m.org.id, name: m.org.name }));
  if (!orgs.some((org) => org.id === ctx.org.id)) {
    orgs.unshift({ id: ctx.org.id, name: ctx.org.name });
  }

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-paper p-4 lg:flex print:hidden">
        <div className="mb-5 px-2 pt-1">
          <Logo />
        </div>
        <OrgSwitcher current={current} orgs={orgs} />
        <div className="mt-5 flex-1">
          <SidebarNav items={items} groups={navGroups} platformAdmin={ctx.user.isPlatformAdmin} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-8 print:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <MobileNav items={items} groups={navGroups} platformAdmin={ctx.user.isPlatformAdmin} orgName={ctx.org.name} />
            <p className="truncate text-sm text-muted lg:hidden">{ctx.org.name}</p>
            <p className="hidden truncate text-sm text-muted lg:block">
              {current.mode}
              {ctx.locations.length > 0 && ctx.locations.length < ctx.allLocations.length && (
                <> · {ctx.locations.map((l) => l.name).join(", ")}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-medium">{ctx.user.name}</p>
              <p className="text-xs text-muted">{current.role}</p>
            </div>
            <span className="grid size-9 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {initials || "?"}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Log out"
                title="Log out"
                className="grid size-9 place-items-center rounded-xl text-muted hover:bg-paper hover:text-ink"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
