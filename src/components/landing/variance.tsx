"use client";

import { motion } from "motion/react";
import { Reveal, SectionHeading } from "./reveal";

// Illustrative example of a weekly variance report.
const rows = [
  { item: "Butter", expected: 500, actual: 620, unit: "g", rupees: 66 },
  { item: "Paneer", expected: 4200, actual: 4560, unit: "g", rupees: 126 },
  { item: "Refined oil", expected: 6000, actual: 6150, unit: "ml", rupees: 24 },
  { item: "Toor dal", expected: 3000, actual: 3010, unit: "g", rupees: 1 },
];

export function Variance() {
  return (
    <section className="relative overflow-hidden bg-ink py-24 text-white sm:py-32">
      <div className="bg-grid-dark absolute inset-0 opacity-50" />
      <div className="absolute top-1/3 -left-40 size-[480px] rounded-full bg-brand-600/25 blur-3xl" />
      <div className="absolute -right-40 bottom-0 size-[420px] rounded-full bg-saffron-500/15 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            dark
            align="left"
            eyebrow="Variance"
            title={
              <>
                What should have been used vs. <span className="font-serif font-normal italic text-brand-300">what was</span>
              </>
            }
            description="Dishes sold × recipe = theoretical use. Opening + received − sent − closing = actual use. The gap is spillage, over-portioning or theft — in rupees, not guesses."
          />
          <Reveal delay={0.15} className="mt-10 grid grid-cols-3 gap-4">
            {[
              { k: "Per count period", v: "Daily / weekly" },
              { k: "Reported in", v: "₹ and grams" },
              { k: "Wastage", v: "Explained apart" },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-white/50">{s.k}</p>
                <p className="mt-1 font-semibold">{s.v}</p>
              </div>
            ))}
          </Reveal>
        </div>

        <Reveal delay={0.1} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur sm:p-8">
          <div className="flex items-center justify-between">
            <p className="font-semibold">This week · Central kitchen</p>
            <span className="rounded-full bg-danger-500/15 px-3 py-1 text-sm font-semibold text-rose-300">₹216 unexplained</span>
          </div>
          <div className="mt-4 flex gap-5 text-xs text-white/55">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-white/30" /> Recipe says
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-brand-400" /> Counts say
            </span>
          </div>
          <ul className="mt-6 space-y-6">
            {rows.map((r, i) => {
              const max = r.actual * 1.05;
              const gap = r.actual - r.expected;
              const flagged = gap / r.expected > 0.02;
              return (
                <li key={r.item}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{r.item}</span>
                    <span className={flagged ? "font-semibold text-rose-300" : "text-white/50"}>
                      {flagged ? `+${gap.toLocaleString("en-IN")} ${r.unit} · ₹${r.rupees}` : "within tolerance"}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <Bar pct={(r.expected / max) * 100} delay={i * 0.12} className="bg-white/30" />
                    <Bar
                      pct={(r.actual / max) * 100}
                      delay={i * 0.12 + 0.1}
                      className={flagged ? "bg-gradient-to-r from-brand-400 to-rose-400" : "bg-brand-400"}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function Bar({ pct, delay, className }: { pct: number; delay: number; className: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/5">
      <motion.div
        initial={{ width: 0 }}
        whileInView={{ width: `${pct}%` }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, delay, ease: [0.22, 1, 0.36, 1] }}
        className={`h-full rounded-full ${className}`}
      />
    </div>
  );
}
