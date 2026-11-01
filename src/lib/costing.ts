import type { Product } from "./data";

// Cost per base unit (paise per g / ml / pc) for each item: what this
// organisation last paid for any product of the item, else the catalogue price.
export function itemUnitCosts(products: Product[]) {
  const map = new Map<string, number>();
  for (const p of products) {
    if (!p.cost_paise) continue;
    const perUnit = p.cost_paise / p.pack_qty;
    const current = map.get(p.item.id);
    // Prefer what this organisation actually paid, then the catalogue price.
    if (current === undefined || p.own_cost) map.set(p.item.id, perUnit);
  }
  return map;
}

export function recipeCost(lines: { item_id: string; qty_base: number }[], costs: Map<string, number>) {
  let total = 0;
  let missing = 0;
  for (const l of lines) {
    const c = costs.get(l.item_id);
    if (c === undefined) missing++;
    else total += c * Number(l.qty_base);
  }
  return { paise: Math.round(total), missing };
}
