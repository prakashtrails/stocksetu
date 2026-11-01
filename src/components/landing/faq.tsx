"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { Reveal, SectionHeading } from "./reveal";

const faqs = [
  {
    q: "Do I need a barcode scanner or any special hardware?",
    a: "No. Your phone camera scans barcodes. A USB or Bluetooth scanner works too if you have one. For loose goods like vegetables or dal from sacks, you pick the item and enter the weight — a label printer is optional.",
  },
  {
    q: "My staff won't scan every item during dinner rush. Will it still work?",
    a: "Yes — that's the point. Consumption is worked out from short periodic counts (daily for high-value items like butter and paneer, weekly for the rest), not from scanning each use. Scanning to the kitchen is optional.",
  },
  {
    q: "I already use a billing POS. Do I have to switch?",
    a: "No. Keep your POS. Upload its daily item-wise sales report and StockSetu uses it to work out what each dish should have used. No POS? Enter dish counts from your bill book.",
  },
  {
    q: "My supplier isn't on StockSetu. Can I still send purchase orders?",
    a: "Yes. The PO goes out on WhatsApp (or as a PDF / SMS) with a free link for the supplier to join. If they join, future orders land in their in-app inbox with live status.",
  },
  {
    q: "What if the internet is weak in my storeroom?",
    a: "Scans and counts are saved on the phone first and synced when the connection returns. Each entry has a unique ID, so nothing is lost and nothing is counted twice.",
  },
  {
    q: "Is my data private from other businesses?",
    a: "Yes. Every business's stock, costs and orders are isolated at the database level. Only the shared product catalog (names and barcodes) is common, and a purchase order is visible only to the two businesses on it.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-white py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <SectionHeading
            align="left"
            eyebrow="FAQ"
            title="Questions kitchen owners ask us"
            description="Something else on your mind? Write to us — a real person replies."
          />
        </div>
        <Reveal className="divide-y divide-line border-y border-line lg:col-span-3">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-6 py-6 text-left text-lg font-medium"
                >
                  {f.q}
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    className={`grid size-8 shrink-0 place-items-center rounded-full border transition-colors ${isOpen ? "border-ink bg-ink text-white" : "border-line"}`}
                  >
                    <Plus className="size-4" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pr-14 pb-6 leading-relaxed text-muted">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
