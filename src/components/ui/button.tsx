import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-ink text-white shadow-[0_1px_0_0_rgb(255_255_255/0.12)_inset,0_8px_24px_-8px_rgb(11_18_21/0.5)] hover:bg-ink-soft",
  brand:
    "bg-brand-600 text-white shadow-[0_8px_24px_-8px_rgb(5_150_105/0.7)] hover:bg-brand-700",
  outline: "border border-line bg-white text-ink hover:border-ink/25 hover:bg-paper",
  ghost: "text-ink hover:bg-ink/5",
  light: "bg-white text-ink hover:bg-brand-50",
} as const;

const sizes = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
} as const;

type Style = { variant?: keyof typeof variants; size?: keyof typeof sizes };

export function buttonClass({ variant = "primary", size = "md" }: Style = {}, className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & Style) {
  return <button className={buttonClass({ variant, size }, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & Style) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}
