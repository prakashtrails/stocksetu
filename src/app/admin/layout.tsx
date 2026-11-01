import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/kit";
import { getContext } from "@/lib/context";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await getContext();
  if (!ctx.user.isPlatformAdmin) redirect("/dashboard");

  return (
    <div className="min-h-screen flex-1 bg-paper">
      <header className="flex h-16 items-center justify-between border-b border-line bg-white px-4 sm:px-8">
        <div className="flex items-center gap-4">
          <Logo />
          <Link href="/admin" className="text-sm font-medium text-muted hover:text-ink">
            All organisations
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {ctx.org && (
            <Link href="/dashboard" className="text-muted hover:text-ink">
              My workspace
            </Link>
          )}
          <Badge tone="dark">Platform admin</Badge>
          <span className="hidden text-muted sm:inline">{ctx.user.email}</span>
          <form action={signOut}>
            <button aria-label="Log out" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-paper">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
