"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";

export function LocationFilter({
  locations,
  value,
  allowAll = true,
  param = "loc",
}: {
  locations: { id: string; name: string }[];
  value: string;
  allowAll?: boolean;
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  if (locations.length < 2 && allowAll) return null;

  return (
    <label className="relative inline-flex items-center">
      <MapPin className="pointer-events-none absolute left-3 size-4 text-muted" />
      <span className="sr-only">Location</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          if (e.target.value) next.set(param, e.target.value);
          else next.delete(param);
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="h-10 appearance-none rounded-full border border-line bg-white pr-8 pl-9 text-sm font-medium"
      >
        {allowAll && <option value="">All my locations</option>}
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
