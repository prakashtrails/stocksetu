"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Blend, Building2, Store, Warehouse } from "lucide-react";
import { Reveal, SectionHeading } from "./reveal";

const steps = [
  { n: "01", title: "Pick your items", text: "Choose from a ready Hindi + English catalog. Set units and which items you count daily." },
  { n: "02", title: "Scan deliveries in", text: "Type the bill lines, scan what arrived. Short by 2? You'll know before you pay." },
  { n: "03", title: "Count at close", text: "A short list of today's items, in storeroom order. Under 10 minutes." },
  { n: "04", title: "See the leaks", text: "Sales × recipes vs. what counts say was used. Low stock turns into a draft PO." },
];

const movements = [
  {
    key: "IN",
    icon: ArrowDownToLine,
    title: "IN — stock arrives",
    text: "10 packs of dal scanned into the store. The bill and the scan are matched line by line.",
    from: "Supplier",
    to: "Store",
    item: "+10 Toor Dal 1kg",
  },
  {
    key: "OUT",
    icon: ArrowUpFromLine,
    title: "OUT — stock is used or sold",
    text: "Used by the kitchen, sold at the counter, wasted with a reason. Every gram has a story.",
    from: "Store",
    to: "Used",
    item: "−620 g Butter",
  },
  {
    key: "TRANSFORM",
    icon: Blend,
    title: "TRANSFORM — raw becomes finished",
    text: "Flour + butter → 10 croissants. Raw stock goes down, finished stock goes up, cost carries over.",
    from: "Flour + Butter",
    to: "Croissants",
    item: "→ 10 Croissants",
  },
  {
    key: "TRANSFER",
    icon: ArrowRightLeft,
    title: "TRANSFER — between locations",
    text: "One label per batch. The outlet scans it on arrival: sent 10, received 9 → flagged instantly.",
    from: "Central kitchen",
    to: "Outlet A",
    item: "Batch #123 · 10 pcs",
  },
] as const;

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const m = movements[active];

  return (
    <section id="how-it-works" className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="How it works"
          title={
            <>
              Up and running in <span className="font-serif font-normal italic text-brand-700">one afternoon</span>
            </>
          }
        />

        <div className="relative mt-16 grid gap-6 md:grid-cols-4">
          <div className="absolute top-6 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-brand-200 via-brand-400 to-brand-200 md:block" />
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1} className="relative text-center md:text-left">
              <span className="relative z-10 mx-auto grid size-12 place-items-center rounded-full border border-brand-200 bg-white font-mono text-sm font-semibold text-brand-700 shadow-sm md:mx-0">
                {s.n}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-24 overflow-hidden rounded-[2rem] border border-line bg-white">
          <div className="grid lg:grid-cols-5">
            <div className="border-b border-line p-6 sm:p-10 lg:col-span-2 lg:border-r lg:border-b-0">
              <p className="text-sm font-semibold tracking-[0.18em] text-brand-600 uppercase">One simple engine</p>
              <h3 className="mt-3 text-3xl font-semibold tracking-tight">Four movements explain every rupee of stock</h3>
              <p className="mt-3 text-muted">
                Dal, croissants, franchise transfers, open sales — all the same four moves, recorded per location. The
                history is never edited, only corrected, so the numbers always add up.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-2" role="tablist" aria-label="Stock movements">
                {movements.map((mv, i) => (
                  <button
                    key={mv.key}
                    role="tab"
                    aria-selected={active === i}
                    onClick={() => setActive(i)}
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-all ${
                      active === i
                        ? "border-ink bg-ink text-white shadow-lg"
                        : "border-line bg-paper text-ink hover:border-ink/30"
                    }`}
                  >
                    <mv.icon className="size-4" />
                    {mv.key}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative flex min-h-[380px] flex-col justify-center overflow-hidden bg-paper p-6 sm:p-10 lg:col-span-3">
              <div className="bg-grid absolute inset-0 opacity-70" />
              <AnimatePresence mode="wait">
                <motion.div
                  key={m.key}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.35 }}
                  className="relative"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Node label={m.from} icon={active === 3 ? Building2 : Warehouse} />
                    <div className="relative h-14 flex-1">
                      <div className="absolute top-1/2 right-0 left-0 h-0.5 -translate-y-1/2 border-t-2 border-dashed border-brand-300" />
                      <motion.div
                        initial={{ left: "0%", x: "0%", y: "-50%" }}
                        animate={{ left: "100%", x: "-100%", y: "-50%" }}
                        transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }}
                        className="absolute top-1/2 w-36 rounded-full bg-brand-600 px-3 py-1.5 text-center text-xs font-semibold whitespace-nowrap text-white shadow-lg"
                      >
                        {m.item}
                      </motion.div>
                    </div>
                    <Node label={m.to} icon={active === 3 ? Store : Warehouse} />
                  </div>
                  <div className="mt-10 rounded-2xl border border-line bg-white p-5">
                    <p className="flex items-center gap-2 font-semibold">
                      <m.icon className="size-4 text-brand-600" />
                      {m.title}
                    </p>
                    <p className="mt-2 text-sm text-muted">{m.text}</p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Node({ label, icon: Icon }: { label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex w-24 shrink-0 flex-col items-center gap-2 text-center sm:w-28">
      <span className="grid size-14 place-items-center rounded-2xl border border-line bg-white shadow-sm">
        <Icon className="size-6 text-ink" />
      </span>
      <span className="text-xs font-medium text-muted">{label}</span>
    </div>
  );
}
