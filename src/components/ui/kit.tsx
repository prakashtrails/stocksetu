import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-8">
      {back && (
        <Link href={back.href} className="mb-3 inline-block text-sm text-muted hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-line bg-white", className)} {...props} />;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

const tones = {
  gray: "bg-paper text-muted ring-line",
  green: "bg-brand-50 text-brand-700 ring-brand-200",
  amber: "bg-saffron-100/70 text-saffron-600 ring-saffron-400/40",
  red: "bg-danger-100/70 text-danger-600 ring-danger-500/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  dark: "bg-ink text-white ring-ink",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const statusTone: Record<string, Tone> = {
  draft: "gray",
  new: "blue",
  requested: "blue",
  sent: "blue",
  in_transit: "amber",
  dispatched: "amber",
  accepted: "green",
  partially_accepted: "amber",
  partially_received: "amber",
  received: "green",
  matched: "green",
  completed: "green",
  open: "blue",
  discrepancy: "red",
  rejected: "red",
  cancelled: "gray",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? "gray"}>{status.replaceAll("_", " ")}</Badge>;
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn("border-b border-line bg-paper/60 px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line/70 px-4 py-3 align-middle", className)} {...props} />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="grid size-12 place-items-center rounded-2xl bg-paper text-muted">{icon}</div>}
      <p className="mt-4 font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none transition placeholder:text-muted/60 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 disabled:bg-paper";

export const selectClass = inputClass + " pr-8";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "red" | "green" | "amber" }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tracking-tight",
          tone === "red" && "text-danger-600",
          tone === "green" && "text-brand-700",
          tone === "amber" && "text-saffron-600",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function Notice({ tone = "gray", children }: { tone?: "gray" | "red" | "green" | "amber"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-xl px-4 py-3 text-sm",
        tone === "gray" && "bg-paper text-muted",
        tone === "red" && "bg-danger-100/60 text-danger-600",
        tone === "green" && "bg-brand-50 text-brand-700",
        tone === "amber" && "bg-saffron-100/60 text-saffron-600",
      )}
    >
      {children}
    </div>
  );
}
