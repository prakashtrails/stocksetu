"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { ProductOption } from "@/lib/data";
import { inputClass } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

// Type to search by product, item (English or Hindi) or barcode.
export function ProductSearch({
  products,
  value,
  onChange,
  placeholder = "Search product, item or barcode",
  autoFocus,
}: {
  products: ProductOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = products.find((p) => p.id === value);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.item.toLowerCase().includes(q) ||
          (p.item_hi ?? "").includes(q) ||
          p.barcodes.some((b) => b.includes(q)),
      )
      .slice(0, 30);
  }, [products, query]);

  const choose = (id: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted" />
      <input
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(inputClass, "pl-9")}
        placeholder={selected ? selected.name : placeholder}
        value={open ? query : selected?.name ?? ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && results[active]) {
            e.preventDefault();
            choose(results[active].id);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-xl"
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
        >
          {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">No match</li>}
          {results.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={p.id === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(p.id)}
              className={cn("cursor-pointer rounded-lg px-3 py-2 text-sm", i === active && "bg-paper")}
            >
              <span className="font-medium">{p.name}</span>
              <span className="ml-2 text-xs text-muted">
                {p.item}
                {p.item_hi ? ` / ${p.item_hi}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
