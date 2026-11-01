"use client";

import { motion } from "motion/react";
import {
  CalendarClock,
  ChefHat,
  ClipboardCheck,
  Languages,
  Receipt,
  RefreshCcw,
  ScanBarcode,
  WifiOff,
} from "lucide-react";
import { Reveal, SectionHeading } from "./reveal";

export function Features() {
  return (
    <section id="features" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Features"
          title="Everything a kitchen needs. Nothing it doesn't."
          description="Built around how Indian kitchens actually work — busy rushes, loose goods, WhatsApp ordering, and staff who shouldn't have to type."
        />

        <div className="mt-16 grid auto-rows-[minmax(220px,auto)] gap-4 md:grid-cols-6">
          {/* Recipe cost — big */}
          <Reveal className="group relative overflow-hidden rounded-3xl border border-line bg-paper p-7 md:col-span-4 md:row-span-2">
            <Icon icon={ChefHat} />
            <h3 className="mt-5 text-2xl font-semibold tracking-tight">Recipe cost & food-cost %</h3>
            <p className="mt-2 max-w-md text-muted">
              Attach recipes to ingredients once. See exactly what each dish costs today, what it sells for, and which
              ones actually make money.
            </p>
            <RecipeCard />
          </Reveal>

          <Feature
            className="md:col-span-2"
            icon={ScanBarcode}
            title="Scan, don't type"
            text="Phone camera or USB scanner. Printed barcodes are reused; loose goods are picked and weighed."
            delay={0.05}
          />
          <Feature
            className="md:col-span-2"
            icon={ClipboardCheck}
            title="10-minute daily counts"
            text="Count butter, paneer and oil daily; the rest weekly. Consumption is worked out from counts."
            delay={0.1}
          />
          <Feature
            className="md:col-span-2"
            icon={CalendarClock}
            title="FEFO & expiry"
            text="Batches tracked by expiry. “5 packs expire in 3 days” — before they go in the bin."
          />
          <Feature
            className="md:col-span-2"
            icon={RefreshCcw}
            title="Smart reorder"
            text="Alerts count stock already on order, so nothing is ordered twice. You pick the supplier."
            delay={0.05}
          />
          <Feature
            className="md:col-span-2"
            icon={Receipt}
            title="GST-ready POs"
            text="GSTIN, HSN and tax breakup on every purchase order and supplier invoice."
            delay={0.1}
          />
          <Feature
            className="md:col-span-3"
            icon={Languages}
            title="Hindi + English catalog"
            text="Scan banana, see “Banana / केला”. A pre-built catalog of common items, with “Did you mean Toor Dal?” to stop duplicates."
          />
          <Feature
            className="md:col-span-3"
            icon={WifiOff}
            title="Works in the cold room"
            text="No signal in the storeroom? Scans are saved on the phone and sync when you're back online — never lost, never doubled."
            delay={0.05}
          />
        </div>
      </div>
    </section>
  );
}

function Icon({ icon: I }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <span className="grid size-11 place-items-center rounded-2xl bg-brand-600 text-white shadow-[0_8px_20px_-8px] shadow-brand-600">
      <I className="size-5" />
    </span>
  );
}

function Feature({
  icon,
  title,
  text,
  className,
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  className?: string;
  delay?: number;
}) {
  return (
    <Reveal
      delay={delay}
      className={`group rounded-3xl border border-line bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_20px_50px_-24px_rgb(5_150_105/0.45)] ${className}`}
    >
      <Icon icon={icon} />
      <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
    </Reveal>
  );
}

const lines = [
  { item: "Toor Dal", qty: "60 g", cost: 7.2 },
  { item: "Ghee", qty: "15 g", cost: 9.0 },
  { item: "Onion, Tomato", qty: "80 g", cost: 3.4 },
  { item: "Spices", qty: "6 g", cost: 2.1 },
];

function RecipeCard() {
  const total = lines.reduce((s, l) => s + l.cost, 0);
  const price = 180;
  const pct = Math.round((total / price) * 1000) / 10;

  return (
    <div className="mt-8 rounded-2xl border border-line bg-white p-5 shadow-[0_24px_60px_-30px_rgb(11_18_21/0.35)] transition-transform duration-500 group-hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Dish</p>
          <p className="text-lg font-semibold">Dal Tadka · 1 plate</p>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">{pct}% food cost</span>
      </div>
      <ul className="mt-4 divide-y divide-line text-sm">
        {lines.map((l, i) => (
          <motion.li
            key={l.item}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className="flex items-center justify-between py-2.5"
          >
            <span>
              {l.item} <span className="text-muted">· {l.qty}</span>
            </span>
            <span className="font-mono">₹{l.cost.toFixed(2)}</span>
          </motion.li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-paper p-3 text-center text-sm">
        <div>
          <p className="text-xs text-muted">Cost</p>
          <p className="font-semibold">₹{total.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Sells at</p>
          <p className="font-semibold">₹{price}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Margin</p>
          <p className="font-semibold text-brand-700">₹{(price - total).toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}
