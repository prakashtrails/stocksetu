import { Cake, ChefHat, Coffee, CookingPot, Croissant, Pizza, Soup, Store, Truck, UtensilsCrossed } from "lucide-react";

const kinds = [
  { icon: UtensilsCrossed, label: "Restaurants" },
  { icon: Coffee, label: "Cafés" },
  { icon: Croissant, label: "Bakeries" },
  { icon: CookingPot, label: "Cloud kitchens" },
  { icon: ChefHat, label: "Central kitchens" },
  { icon: Store, label: "Franchise outlets" },
  { icon: Truck, label: "Wholesalers" },
  { icon: Soup, label: "Dhabas" },
  { icon: Pizza, label: "QSRs" },
  { icon: Cake, label: "Sweet shops" },
];

export function Marquee() {
  return (
    <section aria-label="Who it's for" className="border-y border-line bg-white py-8">
      <p className="text-center text-sm text-muted">Built for local food businesses and the suppliers behind them</p>
      <div className="mask-fade-x mt-6 overflow-hidden">
        <div className="animate-marquee flex w-max gap-4 hover:[animation-play-state:paused]">
          {[...kinds, ...kinds].map(({ icon: Icon, label }, i) => (
            <div
              key={i}
              aria-hidden={i >= kinds.length}
              className="flex items-center gap-2.5 rounded-full border border-line bg-paper px-5 py-2.5 text-sm font-medium whitespace-nowrap text-ink/80"
            >
              <Icon className="size-4 text-brand-600" />
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
