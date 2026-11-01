"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Reveal, SectionHeading } from "./reveal";

const plans = [
  {
    name: "Supplier",
    monthly: 0,
    annual: 0,
    blurb: "For wholesalers and distributors serving kitchens.",
    features: ["Order inbox", "Khata / udhaar ledger", "GST invoices", "Packet-level inventory", "WhatsApp reminders"],
    cta: "Join as a supplier",
  },
  {
    name: "Kitchen",
    monthly: 999,
    annual: 832,
    blurb: "For a single restaurant, café or bakery.",
    features: ["Barcode stock-in & counts", "Recipe cost & food-cost %", "Variance & wastage", "FEFO expiry alerts", "POs with GST, on WhatsApp"],
    cta: "Start free",
    featured: true,
  },
  {
    name: "Multi-outlet",
    monthly: 1999,
    annual: 1666,
    blurb: "For central kitchens supplying outlets or franchises.",
    features: ["Everything in Kitchen", "Transfers with batch labels", "Scan-on-receipt at outlets", "Per-location variance", "Priority onboarding"],
    cta: "Talk to us",
  },
];

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Pricing"
          title="Priced for a local kitchen, not a chain"
          description="Flat per-location pricing. No hardware, no multi-year lock-in. Suppliers are always free."
        />

        <Reveal className="mt-10 flex justify-center">
          <div className="relative inline-flex rounded-full border border-line bg-white p-1 text-sm font-medium">
            {[
              { label: "Monthly", value: false },
              { label: "Annual · save 17%", value: true },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setAnnual(o.value)}
                className={`relative z-10 rounded-full px-5 py-2 transition-colors ${annual === o.value ? "text-white" : "text-muted"}`}
              >
                {annual === o.value && (
                  <motion.span layoutId="billing-pill" className="absolute inset-0 -z-10 rounded-full bg-ink" />
                )}
                {o.label}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((p, i) => {
            const price = annual ? p.annual : p.monthly;
            return (
              <Reveal
                key={p.name}
                delay={i * 0.08}
                className={`relative flex flex-col rounded-3xl p-8 ${
                  p.featured
                    ? "bg-ink text-white shadow-[0_40px_80px_-30px_rgb(11_18_21/0.6)] lg:-my-4 lg:py-12"
                    : "border border-line bg-white"
                }`}
              >
                {p.featured && (
                  <span className="absolute top-6 right-6 rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className={`mt-1 text-sm ${p.featured ? "text-white/60" : "text-muted"}`}>{p.blurb}</p>
                <p className="mt-6 flex items-baseline gap-1.5">
                  <motion.span
                    key={price}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-5xl font-semibold tracking-tight"
                  >
                    {price === 0 ? "Free" : `₹${price.toLocaleString("en-IN")}`}
                  </motion.span>
                  {price > 0 && (
                    <span className={`text-sm ${p.featured ? "text-white/60" : "text-muted"}`}>/ location / month</span>
                  )}
                </p>
                <ul className="mt-8 flex-1 space-y-3 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5">
                      <Check className={`size-4 shrink-0 ${p.featured ? "text-brand-400" : "text-brand-600"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <ButtonLink
                  href="/signup"
                  variant={p.featured ? "brand" : "outline"}
                  className="mt-8 w-full"
                >
                  {p.cta}
                </ButtonLink>
              </Reveal>
            );
          })}
        </div>
        <p className="mt-10 text-center text-sm text-muted">Pilot pricing. Prices exclude GST.</p>
      </div>
    </section>
  );
}
