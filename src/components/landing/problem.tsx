import { BookX, CheckCircle2, CircleHelp, FileWarning, PackageX, ScanLine, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { Reveal, SectionHeading } from "./reveal";

const before = [
  { icon: BookX, text: "Paper registers that get lost, smudged or skipped" },
  { icon: CircleHelp, text: "Nobody knows how much stock is really on hand" },
  { icon: FileWarning, text: "Short deliveries paid for in full, every week" },
  { icon: PackageX, text: "Stock runs out mid-service — or expires unused" },
];

const after = [
  { icon: ScanLine, text: "Scan a barcode or tap a list — zero typing" },
  { icon: ShieldCheck, text: "Live stock per location, from counts you can trust" },
  { icon: CheckCircle2, text: "Bill vs. delivery checked on arrival — gaps flagged" },
  { icon: Sparkles, text: "Reorders drafted before you run out, FEFO on expiry" },
];

export function Problem() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="The problem"
          title={
            <>
              The register can&apos;t tell you <span className="font-serif font-normal italic">where the money went</span>
            </>
          }
          description="Kitchens lose money in small leaks — spillage, over-portioning, short deliveries, expired stock. Foreign platforms cost ₹40,000+ a month. Generic tools don't understand recipes."
        />

        <div className="mt-16 grid gap-5 md:grid-cols-2">
          <Reveal className="rounded-3xl border border-line bg-white p-8">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger-600">
              <XCircle className="size-4" /> Today, on paper
            </p>
            <ul className="mt-6 space-y-5">
              {before.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-4 text-muted">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-100/60 text-danger-600">
                    <Icon className="size-5" />
                  </span>
                  <span className="pt-2">{text}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1} className="relative overflow-hidden rounded-3xl bg-ink p-8 text-white">
            <div className="bg-grid-dark absolute inset-0 opacity-60" />
            <div className="absolute -top-24 -right-24 size-64 rounded-full bg-brand-500/30 blur-3xl" />
            <div className="relative">
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-400">
                <CheckCircle2 className="size-4" /> With StockSetu
              </p>
              <ul className="mt-6 space-y-5">
                {after.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-4 text-white/85">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-300">
                      <Icon className="size-5" />
                    </span>
                    <span className="pt-2">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
