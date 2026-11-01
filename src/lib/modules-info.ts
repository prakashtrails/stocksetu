import type { ModuleKey } from "./context";

export const moduleInfo: Record<ModuleKey, { title: string; text: string }> = {
  inventory: { title: "Inventory & barcode", text: "Stock ledger, scan in/out, receiving, counts, reports" },
  transfers: { title: "Warehouse & transfers", text: "Multiple locations, transfer notes with barcodes, mismatch handling" },
  procurement: { title: "Procurement & suppliers", text: "Supplier directory, POs, goods-receipt reconciliation" },
  food_cost: { title: "Sales, recipes & wastage", text: "Recipe cost, daily sales, variance" },
  supplier: { title: "Order inbox & dispatch", text: "Receive POs, part-fill, dispatch with GST invoices" },
  khata: { title: "Khata / payments", text: "Customer balances, payments, WhatsApp reminders" },
  supplier_inventory: { title: "Supplier stock", text: "Track your own packet/case stock; dispatch books stock out" },
};

export function modulesFor(kind: "business" | "supplier"): ModuleKey[] {
  return kind === "supplier" ? ["supplier", "khata", "supplier_inventory", "procurement"] : ["inventory", "transfers", "procurement", "food_cost"];
}

export function modeFor(kind: "business" | "supplier", modules: string[]) {
  return kind === "supplier" ? "D" : modules.includes("procurement") ? "C" : modules.includes("transfers") ? "B" : "A";
}
