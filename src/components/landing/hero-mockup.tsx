"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  ScanLine,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";

// Sample data for the illustration only.
const stock = [
  { name: "Butter", hi: "मक्खन", qty: "2.4 kg", pct: 28, low: true },
  { name: "Paneer", hi: "पनीर", qty: "6.0 kg", pct: 64 },
  { name: "Toor Dal", hi: "तूर दाल", qty: "18 kg", pct: 82 },
  { name: "Red Chilli", hi: "लाल मिर्च", qty: "4.2 kg", pct: 55 },
  { name: "Refined Oil", hi: "रिफाइंड तेल", qty: "9 L", pct: 41 },
];

const scans = ["MDH Red Chilli 200g", "Amul Butter 500g", "Tata Salt 1kg", "Fortune Oil 1L"];

const ease = [0.22, 1, 0.36, 1] as const;

export function HeroMockup() {
  const [scanIndex, setScanIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setScanIndex((i) => (i + 1) % scans.length), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="absolute -inset-x-6 -inset-y-6 -z-10 rounded-[2.5rem] bg-gradient-to-b from-white/80 to-white/0 blur-xl" />

      {/* App window */}
      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_40px_100px_-40px_rgb(11_18_21/0.45)]">
        <div className="flex items-center gap-2 border-b border-line bg-paper/70 px-4 py-3">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
          <div className="mx-auto hidden rounded-full border border-line bg-white px-4 py-1 text-xs text-muted sm:block">
            app.stocksetu.in/dashboard
          </div>
        </div>

        <div className="grid grid-cols-12">
          <aside className="col-span-3 hidden border-r border-line bg-paper/40 p-4 md:block">
            {[
              { icon: LayoutDashboard, label: "Overview", active: true },
              { icon: Boxes, label: "Stock" },
              { icon: ScanLine, label: "Scan" },
              { icon: ClipboardList, label: "Counts" },
              { icon: ShoppingCart, label: "Orders" },
            ].map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={`mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${active ? "bg-white font-medium text-ink shadow-sm" : "text-muted"}`}
              >
                <Icon className="size-4" />
                {label}
              </div>
            ))}
          </aside>

          <div className="col-span-12 p-4 sm:p-6 md:col-span-9">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Stock value", value: "₹1,84,320", sub: "across 3 locations" },
                { label: "Food cost", value: "31.4%", sub: "this week", good: true },
                { label: "Unexplained gap", value: "₹2,140", sub: "since last count", bad: true },
              ].map((k, i) => (
                <motion.div
                  key={k.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 + i * 0.1, duration: 0.6, ease }}
                  className="rounded-2xl border border-line p-4"
                >
                  <p className="text-xs text-muted">{k.label}</p>
                  <p
                    className={`mt-1 text-2xl font-semibold tracking-tight ${k.bad ? "text-danger-600" : k.good ? "text-brand-700" : "text-ink"}`}
                  >
                    {k.value}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{k.sub}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-line p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Stock on hand</p>
                <p className="text-xs text-muted">Central kitchen</p>
              </div>
              <ul className="mt-3 space-y-3">
                {stock.map((s, i) => (
                  <li key={s.name} className="grid grid-cols-12 items-center gap-3 text-sm">
                    <span className="col-span-5 truncate sm:col-span-4">
                      {s.name} <span className="text-muted">/ {s.hi}</span>
                    </span>
                    <div className="col-span-4 h-2 overflow-hidden rounded-full bg-paper sm:col-span-6">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${s.pct}%` }}
                        transition={{ delay: 1 + i * 0.08, duration: 1, ease }}
                        className={`h-full rounded-full ${s.low ? "bg-saffron-500" : "bg-brand-500"}`}
                      />
                    </div>
                    <span className={`col-span-3 text-right font-mono text-xs sm:col-span-2 ${s.low ? "text-saffron-600" : "text-muted"}`}>
                      {s.qty}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Floating: barcode scan */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.3, duration: 0.8, ease }}
        className="absolute -bottom-10 -left-2 hidden w-60 sm:block lg:-left-14"
      >
        <div className="animate-float rounded-2xl border border-line bg-white p-3 shadow-2xl">
          <div className="relative h-20 overflow-hidden rounded-xl bg-ink">
            <div className="absolute inset-x-5 top-3 flex h-14 items-end justify-between">
              {Array.from({ length: 22 }).map((_, i) => (
                <span
                  key={i}
                  className="bg-white/85"
                  style={{ width: i % 3 === 0 ? 3 : i % 2 === 0 ? 1.5 : 2, height: "100%" }}
                />
              ))}
            </div>
            <div className="animate-scanline absolute inset-x-3 top-3 h-0.5 rounded-full bg-brand-400 shadow-[0_0_14px_2px] shadow-brand-400" />
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-brand-700">
              <ScanLine className="size-4" />
            </span>
            <div className="min-w-0 flex-1 text-xs">
              <AnimatePresence mode="wait">
                <motion.p
                  key={scanIndex}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="truncate font-medium text-ink"
                >
                  {scans[scanIndex]}
                </motion.p>
              </AnimatePresence>
              <p className="text-muted">+1 pack · saved offline</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating: variance alert */}
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.5, duration: 0.8, ease }}
        className="absolute top-24 -right-2 hidden w-64 lg:-right-16 lg:block"
      >
        <div className="animate-float rounded-2xl border border-danger-100 bg-white p-4 shadow-2xl [animation-delay:1.5s]">
          <div className="flex items-center gap-2 text-sm font-semibold text-danger-600">
            <AlertTriangle className="size-4" />
            Variance found
          </div>
          <p className="mt-2 text-sm text-ink">
            <span className="font-semibold">120 g butter</span> unaccounted in 10 croissants
          </p>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-muted">
              <span>Recipe says</span>
              <span className="font-mono">500 g</span>
            </div>
            <div className="flex justify-between text-ink">
              <span>Counts say</span>
              <span className="font-mono font-semibold">620 g</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating: PO on WhatsApp */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.7, duration: 0.8, ease }}
        className="absolute -right-2 -bottom-12 hidden w-64 sm:block lg:-right-10"
      >
        <div className="animate-float rounded-2xl border border-line bg-white p-4 shadow-2xl [animation-delay:3s]">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-[#25d366] text-white">
              <MessageCircle className="size-4" />
            </span>
            <div className="text-xs">
              <p className="font-semibold text-ink">PO-0042 sent</p>
              <p className="text-muted">to Sharma Traders</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-saffron-100/60 px-3 py-2 text-xs text-saffron-600">
            <TrendingDown className="size-3.5" />
            Butter below 3 kg · reorder 5 kg
          </div>
        </div>
      </motion.div>
    </div>
  );
}
