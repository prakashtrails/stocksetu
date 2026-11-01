"use client";

import { motion } from "motion/react";
import { ArrowRight, Check, PlayCircle } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { HeroMockup } from "./hero-mockup";

const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease },
});

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
      <div className="bg-grid mask-fade-y pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-200/70 via-saffron-100/60 to-transparent blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <motion.a
            href="#how-it-works"
            {...fadeUp(0)}
            className="group inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-white/80 py-1 pr-3 pl-1 text-sm text-muted shadow-sm backdrop-blur"
          >
            <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">New</span>
            <span className="sm:hidden">One catalog for kitchens + suppliers</span>
            <span className="hidden sm:inline">Kitchens and suppliers on one shared catalog</span>
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </motion.a>

          <motion.h1
            {...fadeUp(0.08)}
            className="mt-7 text-5xl font-semibold tracking-tight text-balance text-ink sm:text-7xl"
          >
            Know every gram.{" "}
            <span className="font-serif font-normal italic text-brand-700">Order before</span> you run out.
          </motion.h1>

          <motion.p {...fadeUp(0.16)} className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted sm:text-xl">
            StockSetu replaces the paper register with barcode scans, quick daily counts and recipe costing —
            and sends purchase orders to your suppliers, even if they&apos;re only on WhatsApp.
          </motion.p>

          <motion.div {...fadeUp(0.24)} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/signup" size="lg" className="w-full sm:w-auto">
              Start free for your kitchen
              <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="#how-it-works" variant="outline" size="lg" className="w-full sm:w-auto">
              <PlayCircle className="size-4" />
              See how it works
            </ButtonLink>
          </motion.div>

          <motion.ul
            {...fadeUp(0.32)}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted"
          >
            {["No hardware needed", "Hindi + English", "Free for suppliers"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-brand-600" />
                {t}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.1, delay: 0.35, ease }}
          className="relative mt-16 sm:mt-20"
        >
          <HeroMockup />
        </motion.div>
      </div>
    </section>
  );
}
