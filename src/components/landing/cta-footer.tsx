import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function Cta() {
  return (
    <section className="px-4 py-24 sm:px-6 sm:py-32">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-brand-700 px-6 py-20 text-center text-white sm:px-16">
        <div className="bg-grid-dark absolute inset-0 opacity-60" />
        <div className="absolute -top-32 left-1/2 h-72 w-[640px] -translate-x-1/2 rounded-full bg-brand-400/40 blur-3xl" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Close the register. <span className="font-serif font-normal italic">Open the numbers.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/75">
            Set up your kitchen in an afternoon. Invite your suppliers when you&apos;re ready.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/signup" variant="light" size="lg">
              Start free <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink
              href="/login"
              size="lg"
              className="border border-white/25 bg-transparent shadow-none hover:bg-white/10"
            >
              Log in
            </ButtonLink>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const columns = [
  { title: "Product", links: [["Features", "#features"], ["How it works", "#how-it-works"], ["Pricing", "#pricing"]] },
  { title: "For", links: [["Restaurants", "#features"], ["Central kitchens", "#how-it-works"], ["Suppliers", "#suppliers"]] },
  { title: "Account", links: [["Log in", "/login"], ["Sign up", "/signup"], ["FAQ", "#faq"]] },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted">
            Inventory and supply chain for Indian food businesses — one shared catalog, from supplier to kitchen.
          </p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <p className="text-sm font-semibold">{c.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="hover:text-ink">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted sm:px-6">Made in India for Indian kitchens.</p>
      </div>
    </footer>
  );
}
