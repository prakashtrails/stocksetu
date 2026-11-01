// Logs in as every demo user against the real Supabase project, then opens each
// page that user should see on the running app and reports failures.
// Usage: node scripts/smoke-pages.mjs [baseUrl]
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";

const base = process.argv[2] ?? "http://localhost:3000";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const pages = {
  common: ["/dashboard", "/dashboard/stock", "/dashboard/scan", "/dashboard/counts", "/dashboard/wastage", "/dashboard/movements"],
  business: ["/dashboard/receive", "/dashboard/receive/new"],
  admin: ["/dashboard/settings", "/dashboard/audit", "/dashboard/catalog", "/dashboard/reorder"],
  transfers: ["/dashboard/transfers", "/dashboard/transfers/new"],
  procurement: ["/dashboard/orders", "/dashboard/orders/new", "/dashboard/suppliers"],
  food: ["/dashboard/recipes", "/dashboard/sales", "/dashboard/variance"],
  supplier: ["/dashboard/inbox", "/dashboard/dispatch", "/dashboard/dispatch/new"],
  supplierAdmin: ["/dashboard/customers", "/dashboard/khata", "/dashboard/settings", "/dashboard/audit"],
};

const users = {
  "admin@stocksetu.demo": ["/admin"],
  "chai@stocksetu.demo": [...pages.common, ...pages.business, ...pages.admin],
  "tandoor@stocksetu.demo": [...pages.common, ...pages.business, ...pages.admin, ...pages.transfers],
  "tandoor.warehouse@stocksetu.demo": [...pages.common, ...pages.business, ...pages.transfers, "/dashboard/catalog", "/dashboard/reorder"],
  "tandoor.outlet@stocksetu.demo": [...pages.common, ...pages.business, ...pages.transfers, "/dashboard/reorder"],
  "spice@stocksetu.demo": [...pages.common, ...pages.business, ...pages.admin, ...pages.transfers, ...pages.procurement, ...pages.food],
  "spice.store@stocksetu.demo": [...pages.common, ...pages.business, ...pages.procurement],
  "spice.kitchen@stocksetu.demo": [...pages.common, ...pages.food],
  "setu@stocksetu.demo": [...pages.common, ...pages.supplier, ...pages.supplierAdmin, "/dashboard/catalog"],
  "sharma@stocksetu.demo": ["/dashboard", ...pages.supplier, ...pages.supplierAdmin],
  "sharma.staff@stocksetu.demo": ["/dashboard", ...pages.supplier],
  "haldiram.admin@stocksetu.demo": [...pages.common, ...pages.business, ...pages.admin, ...pages.transfers, ...pages.procurement, ...pages.food],
  "haldiram.warehouse@stocksetu.demo": [...pages.common, ...pages.business, ...pages.transfers, ...pages.procurement, "/dashboard/catalog", "/dashboard/reorder"],
  "haldiram.cp@stocksetu.demo": [...pages.common, ...pages.business, ...pages.transfers, ...pages.food, "/dashboard/reorder"],
  "haldiram.noida@stocksetu.demo": [...pages.common, ...pages.business, ...pages.transfers, ...pages.food, "/dashboard/reorder"],
  "haldiram.staff@stocksetu.demo": [...pages.common, ...pages.business, "/dashboard/sales"],
  "agarwal@stocksetu.demo": [...pages.common, ...pages.supplier, ...pages.supplierAdmin, "/dashboard/catalog"],
  "agarwal.staff@stocksetu.demo": ["/dashboard", ...pages.supplier, "/dashboard/stock", "/dashboard/scan"],
  "delhispice@stocksetu.demo": ["/dashboard", ...pages.supplier, ...pages.supplierAdmin],
  "annapurna@stocksetu.demo": [...pages.common, ...pages.supplier, ...pages.supplierAdmin],
};

async function login(email) {
  const jar = new Map();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password: "Demo@1234" });
  if (error) throw new Error(`login failed: ${error.message}`);
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

// Also open detail pages linked from list pages (orders, transfers, shipments…).
const detailPattern = /href="(\/(?:dashboard\/(?:orders|transfers|inbox|dispatch|receive\/shipment|receive\/po|counts|khata)|admin\/org)\/[0-9a-f-]{36}(?:\/[a-z]+)?)"/g;

let failures = 0;
let checked = 0;
for (const [email, list] of Object.entries(users)) {
  let cookie;
  try {
    cookie = await login(email);
  } catch (e) {
    console.log(`✗ ${email}: ${e.message}`);
    failures++;
    continue;
  }
  const queue = [...new Set(list)];
  const seen = new Set();
  const bad = [];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
    const body = res.status === 200 ? await res.text() : "";
    checked++;
    const errorText = body.match(/Application error|Unhandled Runtime Error|Internal Server Error|Something went wrong|denied=1/);
    if (res.status !== 200 || errorText) {
      bad.push(`${path} → ${res.status}${res.headers.get("location") ? ` ${res.headers.get("location")}` : ""}${errorText ? ` (${errorText[0]})` : ""}`);
      continue;
    }
    if (seen.size < 40) for (const m of body.matchAll(detailPattern)) if (!seen.has(m[1])) queue.push(m[1]);
  }
  console.log(`${bad.length ? "✗" : "✓"} ${email}: ${seen.size} pages${bad.length ? "\n    " + bad.join("\n    ") : ""}`);
  failures += bad.length;
}
console.log(`\n${checked} page loads, ${failures} problem(s)`);
process.exit(failures ? 1 : 0);
