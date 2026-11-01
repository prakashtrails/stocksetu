import { Check } from "lucide-react";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grid-dark absolute inset-0 opacity-60" />
        <div className="absolute -top-32 -right-32 size-[420px] rounded-full bg-brand-500/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-[380px] rounded-full bg-saffron-500/15 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-semibold tracking-[0.18em] text-brand-400 uppercase">StockSetu</p>
          <h2 className="mt-4 max-w-md text-4xl font-semibold tracking-tight">
            Every gram accounted for, <span className="font-serif font-normal italic text-brand-300">every order on time.</span>
          </h2>
        </div>
        <ul className="relative space-y-4 text-white/80">
          {[
            "Scan deliveries and catch short supply on arrival",
            "Daily counts in under 10 minutes",
            "Recipe cost and variance in rupees",
            "Purchase orders straight to WhatsApp",
          ].map((t) => (
            <li key={t} className="flex items-center gap-3">
              <span className="grid size-6 place-items-center rounded-full bg-brand-500/20 text-brand-300">
                <Check className="size-3.5" />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
