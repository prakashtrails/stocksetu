export type BaseUnit = "g" | "ml" | "pc";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function rupees(paise: number | bigint | null | undefined, opts: { exact?: boolean } = {}) {
  const v = Number(paise ?? 0) / 100;
  return `₹${(opts.exact ? inr : inr0).format(v)}`;
}

// 2400 g -> "2.4 kg", 750 ml -> "750 ml", 12 pc -> "12 pc"
export function qty(base: number | bigint | null | undefined, unit: BaseUnit) {
  const v = Number(base ?? 0);
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (unit === "g") return a >= 1000 ? `${sign}${inr.format(a / 1000)} kg` : `${sign}${inr0.format(a)} g`;
  if (unit === "ml") return a >= 1000 ? `${sign}${inr.format(a / 1000)} L` : `${sign}${inr0.format(a)} ml`;
  return `${sign}${inr0.format(a)} pc`;
}

export function packs(base: number | bigint, packQty: number) {
  const v = Number(base) / packQty;
  return Number.isInteger(v) ? inr0.format(v) : inr.format(v);
}

export function dateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(d));
}

export function dateOnly(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(
    new Date(d),
  );
}

export function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

export function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

// Rupees typed by a person ("1,250.50") -> integer paise, without floats.
export function parseRupees(input: string): number | null {
  const s = input.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

// A typed quantity in a display unit -> integer base units.
export function toBase(input: string, unit: "kg" | "g" | "L" | "ml" | "pc" | "pack", packQty = 1): number | null {
  const s = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const milli = Number(whole) * 1000 + Number(frac.padEnd(3, "0"));
  const factor = unit === "kg" || unit === "L" ? 1000 : unit === "pack" ? packQty : 1;
  const base = (milli * factor) / 1000;
  return Number.isInteger(base) ? base : Math.round(base);
}

export const unitChoices: Record<BaseUnit, ("kg" | "g" | "L" | "ml" | "pc")[]> = {
  g: ["kg", "g"],
  ml: ["L", "ml"],
  pc: ["pc"],
};
