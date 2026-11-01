"use client";

import { useTransition } from "react";
import { ChevronsUpDown, Loader2 } from "lucide-react";
import { switchOrg } from "@/app/dashboard/actions";

export function OrgSwitcher({
  current,
  orgs,
}: {
  current: { id: string; name: string; mode: string; role: string };
  orgs: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();

  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <p className="truncate font-semibold">{current.name}</p>
      <p className="truncate text-xs text-muted">
        {current.mode} · {current.role}
      </p>
      {orgs.length > 1 && (
        <label className="relative mt-2 block">
          <span className="sr-only">Switch organisation</span>
          <select
            value={current.id}
            disabled={pending}
            onChange={(e) => start(() => switchOrg(e.target.value))}
            className="h-8 w-full appearance-none rounded-lg border border-line bg-paper pr-7 pl-2 text-xs"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {pending ? (
            <Loader2 className="pointer-events-none absolute top-2 right-2 size-4 animate-spin text-muted" />
          ) : (
            <ChevronsUpDown className="pointer-events-none absolute top-2 right-2 size-4 text-muted" />
          )}
        </label>
      )}
    </div>
  );
}
