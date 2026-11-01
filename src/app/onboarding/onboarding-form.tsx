"use client";

import { useState } from "react";
import { Boxes, Building2, Check, Store, Truck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, inputClass, selectClass } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import { createOrganisation } from "./actions";

const modes = [
  {
    key: "A",
    icon: Boxes,
    title: "Inventory only",
    text: "I receive stock (e.g. from a central warehouse) and want to know what came in, what went out and what's on hand.",
    modules: ["Stock ledger", "Barcode scan in/out", "Receive deliveries", "Basic reports"],
    locations: [{ name: "Main store", kind: "store" }],
  },
  {
    key: "B",
    icon: Building2,
    title: "Warehouse + outlets",
    text: "I keep central stock and send it to my outlets, and want every transfer verified.",
    modules: ["Everything in Inventory", "Locations & transfers", "Transfer barcodes", "Mismatch handling"],
    locations: [
      { name: "Central warehouse", kind: "warehouse" },
      { name: "Outlet 1", kind: "outlet" },
    ],
  },
  {
    key: "C",
    icon: Store,
    title: "Full procurement",
    text: "I buy from several suppliers and want POs, receiving, reorders and food-cost control.",
    modules: ["Everything above", "Suppliers & POs", "Goods-receipt matching", "Recipes, sales & variance"],
    locations: [
      { name: "Main store", kind: "store" },
      { name: "Kitchen", kind: "kitchen" },
    ],
  },
  {
    key: "D",
    icon: Truck,
    title: "I'm a supplier",
    text: "I receive orders from kitchens, dispatch them and track who owes what.",
    modules: ["Order inbox", "Dispatch & GST invoices", "Khata / udhaar", "Optional stock tracking"],
    locations: [{ name: "Godown", kind: "warehouse" }],
  },
] as const;

export function OnboardingForm() {
  const [mode, setMode] = useState<(typeof modes)[number]["key"]>("C");
  const current = modes.find((m) => m.key === mode)!;

  return (
    <ActionForm action={createOrganisation} className="mt-8 space-y-8">
      <input type="hidden" name="mode" value={mode} />
      <div className="grid gap-3 sm:grid-cols-2">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={cn(
              "rounded-2xl border bg-white p-5 text-left transition",
              mode === m.key ? "border-brand-500 ring-4 ring-brand-500/15" : "border-line hover:border-ink/25",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <m.icon className="size-5" />
              </span>
              <span className="text-xs font-semibold text-muted">Mode {m.key}</span>
            </div>
            <p className="mt-3 font-semibold">{m.title}</p>
            <p className="mt-1 text-sm text-muted">{m.text}</p>
            <ul className="mt-3 space-y-1">
              {m.modules.map((x) => (
                <li key={x} className="flex items-center gap-1.5 text-xs text-ink/80">
                  <Check className="size-3.5 text-brand-600" /> {x}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-white p-6">
        <Field label={mode === "D" ? "Business name (as on your invoices)" : "Business name"}>
          <input name="name" required maxLength={120} className={inputClass} placeholder="e.g. Spice Route Kitchens" />
        </Field>
        <p className="mt-6 text-sm font-medium">Locations</p>
        <p className="text-xs text-muted">Each place that holds stock. You can add more later.</p>
        <div key={mode} className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => {
            const preset = current.locations[i];
            return (
              <div key={i} className="grid grid-cols-3 gap-2">
                <input
                  name={`loc_name_${i}`}
                  defaultValue={preset?.name ?? ""}
                  placeholder={i === 0 ? "Location name" : "Optional"}
                  aria-label={`Location ${i + 1} name`}
                  className={inputClass + " col-span-2"}
                />
                <select name={`loc_kind_${i}`} defaultValue={preset?.kind ?? "outlet"} aria-label={`Location ${i + 1} type`} className={selectClass}>
                  <option value="warehouse">Warehouse</option>
                  <option value="outlet">Outlet</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="store">Store</option>
                </select>
              </div>
            );
          })}
        </div>
      </div>

      <SubmitButton size="lg" className="w-full sm:w-auto">
        Create workspace
      </SubmitButton>
    </ActionForm>
  );
}
