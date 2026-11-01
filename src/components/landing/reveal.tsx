"use client";

import { motion, type HTMLMotionProps } from "motion/react";

// Fades and lifts its children in the first time they scroll into view.
export function Reveal({
  delay = 0,
  y = 24,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  dark = false,
  align = "center",
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  dark?: boolean;
  align?: "center" | "left";
}) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p
        className={`text-sm font-semibold uppercase tracking-[0.18em] ${dark ? "text-brand-400" : "text-brand-600"}`}
      >
        {eyebrow}
      </p>
      <h2
        className={`mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl ${dark ? "text-white" : "text-ink"}`}
      >
        {title}
      </h2>
      {description && (
        <p className={`mt-5 text-lg text-pretty ${dark ? "text-white/65" : "text-muted"}`}>{description}</p>
      )}
    </Reveal>
  );
}
