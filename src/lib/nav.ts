import type { AppContext, ModuleKey, Role } from "./context";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  group: "Inventory" | "Buying" | "Food cost" | "Supplier" | "Workspace";
  modules?: ModuleKey[]; // any of these
  roles?: Role[]; // any of these
};

const BUSINESS: Role[] = ["admin", "warehouse", "outlet", "staff"];
const SUPPLIER: Role[] = ["supplier_admin", "supplier_staff"];
const STOCK: ModuleKey[] = ["inventory", "supplier_inventory"];

export const navItems: NavItem[] = [
  { href: "/dashboard/stock", label: "Stock", icon: "boxes", group: "Inventory", modules: STOCK },
  { href: "/dashboard/scan", label: "Scan", icon: "scan", group: "Inventory", modules: STOCK },
  { href: "/dashboard/receive", label: "Receive goods", icon: "package-check", group: "Inventory", modules: ["inventory"], roles: BUSINESS },
  { href: "/dashboard/transfers", label: "Transfers", icon: "arrow-left-right", group: "Inventory", modules: ["transfers"], roles: BUSINESS },
  { href: "/dashboard/counts", label: "Counts", icon: "clipboard-list", group: "Inventory", modules: STOCK },
  { href: "/dashboard/wastage", label: "Wastage", icon: "trash", group: "Inventory", modules: STOCK },
  { href: "/dashboard/movements", label: "Movement history", icon: "history", group: "Inventory", modules: STOCK },
  { href: "/dashboard/catalog", label: "Catalogue", icon: "tags", group: "Inventory", modules: STOCK, roles: ["admin", "warehouse", "supplier_admin"] },

  { href: "/dashboard/reorder", label: "Reorder", icon: "alarm", group: "Buying", modules: ["inventory"], roles: ["admin", "warehouse", "outlet"] },
  { href: "/dashboard/orders", label: "Purchase orders", icon: "cart", group: "Buying", modules: ["procurement"], roles: ["admin", "warehouse"] },
  { href: "/dashboard/suppliers", label: "Suppliers", icon: "truck", group: "Buying", modules: ["procurement"], roles: ["admin", "warehouse"] },

  { href: "/dashboard/recipes", label: "Recipes", icon: "chef", group: "Food cost", modules: ["food_cost"], roles: ["admin", "outlet"] },
  { href: "/dashboard/sales", label: "Daily sales", icon: "receipt", group: "Food cost", modules: ["food_cost"], roles: ["admin", "outlet", "staff"] },
  { href: "/dashboard/variance", label: "Variance", icon: "trending", group: "Food cost", modules: ["food_cost"], roles: ["admin", "outlet"] },

  { href: "/dashboard/inbox", label: "Order inbox", icon: "inbox", group: "Supplier", modules: ["supplier"], roles: SUPPLIER },
  { href: "/dashboard/dispatch", label: "Dispatches", icon: "send", group: "Supplier", modules: ["supplier"], roles: SUPPLIER },
  { href: "/dashboard/customers", label: "Customers", icon: "users", group: "Supplier", modules: ["supplier"], roles: ["supplier_admin"] },
  { href: "/dashboard/khata", label: "Khata", icon: "book", group: "Supplier", modules: ["khata"], roles: ["supplier_admin"] },

  { href: "/dashboard/settings", label: "Team & settings", icon: "settings", group: "Workspace", roles: ["admin", "supplier_admin"] },
  { href: "/dashboard/audit", label: "Audit log", icon: "shield", group: "Workspace", roles: ["admin", "supplier_admin"] },
];

export const navGroups = ["Inventory", "Buying", "Food cost", "Supplier", "Workspace"] as const;

export function visibleNav(ctx: Pick<AppContext, "has" | "is">) {
  return navItems.filter(
    (n) => (!n.modules || n.modules.some((m) => ctx.has(m))) && (!n.roles || ctx.is(...n.roles)),
  );
}
