"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { icons } from "./icons";

export function SidebarNav({
  items,
  groups,
  platformAdmin,
  onNavigate,
}: {
  items: NavItem[];
  groups: readonly string[];
  platformAdmin: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const link = (href: string, label: string, iconKey: string) => {
    const Icon = icons[iconKey] ?? Shield;
    const active = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
          active ? "bg-white font-medium text-ink shadow-sm ring-1 ring-line" : "text-muted hover:bg-white/60 hover:text-ink",
        )}
      >
        <Icon className={cn("size-4 shrink-0", active && "text-brand-600")} />
        {label}
      </Link>
    );
  };

  return (
    <nav className="space-y-5">
      <div>{link("/dashboard", "Overview", "home")}</div>
      {groups.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (!groupItems.length) return null;
        return (
          <div key={group}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted/80 uppercase">{group}</p>
            <div className="space-y-0.5">{groupItems.map((i) => link(i.href, i.label, i.icon))}</div>
          </div>
        );
      })}
      {platformAdmin && (
        <div>
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted/80 uppercase">Platform</p>
          {link("/admin", "Platform admin", "shield")}
        </div>
      )}
    </nav>
  );
}
