import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" className="fill-brand-600" />
      {/* A bridge (setu) made of barcode bars */}
      <path d="M6 20c3-6 7-9 10-9s7 3 10 9" className="stroke-white" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <g className="fill-white">
        <rect x="9" y="17" width="1.8" height="7" rx=".9" />
        <rect x="13" y="13.6" width="1.8" height="10.4" rx=".9" />
        <rect x="17.2" y="13.6" width="1.8" height="10.4" rx=".9" />
        <rect x="21.2" y="17" width="1.8" height="7" rx=".9" />
      </g>
    </svg>
  );
}

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className={cn("text-lg", dark ? "text-white" : "text-ink")}>
        Stock<span className="text-brand-600">Setu</span>
      </span>
    </Link>
  );
}
