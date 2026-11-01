import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Inbox, PackageCheck, Send, Truck } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, Notice, Stat, StatusBadge } from "@/components/ui/kit";
import { requireOrg, roleLabels, type AppContext } from "@/lib/context";
import { loadBalances, loadProducts } from "@/lib/data";
import { dateTime, qty, rupees } from "@/lib/format";
import { reasonLabels } from "@/lib/labels";

export const metadata: Metadata = { title: "Overview" };

export default async function Overview({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <p className="text-sm text-muted">
        {ctx.org.name} · {roleLabels[ctx.role]}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">
        {greeting}, {ctx.user.name.split(" ")[0]}
      </h1>
      {sp.denied && (
        <div className="mt-4">
          <Notice tone="amber">That section isn&apos;t enabled for your role or organisation.</Notice>
        </div>
      )}
      <div className="mt-8">{ctx.org.kind === "supplier" ? <SupplierOverview ctx={ctx} /> : <BusinessOverview ctx={ctx} />}</div>
    </div>
  );
}

async function BusinessOverview({ ctx }: { ctx: AppContext & { org: NonNullable<AppContext["org"]> } }) {
  const locIds = ctx.locations.map((l) => l.id);
  const locName = new Map(ctx.allLocations.map((l) => [l.id, l.name]));
  const [products, balances, { data: mins }, { data: shipments }, { data: transfers }, { data: pos }, { data: recent }] =
    await Promise.all([
      loadProducts(ctx.supabase, ctx.org.id),
      loadBalances(ctx.supabase, locIds),
      ctx.supabase.from("min_levels").select("location_id, product_id, min_packs").in("location_id", locIds),
      ctx.supabase
        .from("shipments")
        .select("id, code, status, dispatched_at, buyer_location_id, supplier:organisations!shipments_supplier_org_id_fkey(name)")
        .eq("buyer_org_id", ctx.org.id)
        .eq("status", "in_transit")
        .order("dispatched_at", { ascending: false }),
      ctx.has("transfers")
        ? ctx.supabase
            .from("transfers")
            .select("id, code, status, from_location_id, to_location_id, created_at")
            .in("status", ["requested", "in_transit", "discrepancy"])
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as { id: string; code: string; status: string; from_location_id: string; to_location_id: string; created_at: string }[] }),
      ctx.has("procurement")
        ? ctx.supabase.from("purchase_orders").select("id, status").eq("buyer_org_id", ctx.org.id).not("status", "in", "(received,cancelled,rejected)")
        : Promise.resolve({ data: [] as { id: string; status: string }[] }),
      ctx.supabase
        .from("stock_movements")
        .select("id, qty_base, reason, occurred_at, product_id, location_id")
        .in("location_id", locIds.length ? locIds : ["00000000-0000-0000-0000-000000000000"])
        .order("occurred_at", { ascending: false })
        .limit(8),
    ]);

  const byId = new Map(products.map((p) => [p.id, p]));
  const value = balances.reduce((s, b) => {
    const p = byId.get(b.product_id);
    return p && b.qty_base > 0 ? s + (b.qty_base / p.pack_qty) * p.cost_paise : s;
  }, 0);
  const bal = new Map(balances.map((b) => [`${b.location_id}:${b.product_id}`, b.qty_base]));
  const low = (mins ?? [])
    .map((m) => {
      const p = byId.get(m.product_id)!;
      const onHand = bal.get(`${m.location_id}:${m.product_id}`) ?? 0;
      return { ...m, p, onHand, packsOnHand: p ? onHand / p.pack_qty : 0 };
    })
    .filter((m) => m.p && m.packsOnHand < m.min_packs);

  const myTransfers = (transfers ?? []).filter((t) => locIds.includes(t.from_location_id) || locIds.includes(t.to_location_id));
  const toReceive = myTransfers.filter((t) => t.status === "in_transit" && locIds.includes(t.to_location_id));
  const toDispatch = myTransfers.filter((t) => t.status === "requested" && locIds.includes(t.from_location_id));
  const discrepancies = myTransfers.filter((t) => t.status === "discrepancy");
  const myShipments = (shipments ?? []).filter((s) => !s.buyer_location_id || locIds.includes(s.buyer_location_id));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Stock value" value={rupees(value)} hint={`${ctx.locations.length} location${ctx.locations.length === 1 ? "" : "s"}`} />
        <Stat label="Below minimum" value={low.length} hint="items to reorder" tone={low.length ? "amber" : undefined} />
        <Stat
          label="Arriving"
          value={myShipments.length + toReceive.length}
          hint="shipments & transfers to receive"
          tone={myShipments.length + toReceive.length ? "green" : undefined}
        />
        {ctx.has("procurement") ? (
          <Stat label="Open purchase orders" value={(pos ?? []).length} hint="not yet fully received" />
        ) : (
          <Stat label="Products tracked" value={new Set(balances.filter((b) => b.qty_base > 0).map((b) => b.product_id)).size} hint="with stock on hand" />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Needs your attention" description="Arrivals, requests and mismatches" />
          <ul className="divide-y divide-line">
            {myShipments.map((s) => (
              <Row
                key={s.id}
                icon={<PackageCheck className="size-4" />}
                title={`Shipment ${s.code} from ${(s.supplier as unknown as { name: string } | null)?.name ?? "supplier"}`}
                meta={`Dispatched ${dateTime(s.dispatched_at)} · scan it on arrival`}
                href={`/dashboard/receive/shipment/${s.id}`}
                cta="Receive"
              />
            ))}
            {toReceive.map((t) => (
              <Row
                key={t.id}
                icon={<Truck className="size-4" />}
                title={`Transfer ${t.code} to ${locName.get(t.to_location_id)}`}
                meta={`From ${locName.get(t.from_location_id)} · in transit`}
                href={`/dashboard/transfers/${t.id}`}
                cta="Receive"
              />
            ))}
            {toDispatch.map((t) => (
              <Row
                key={t.id}
                icon={<Send className="size-4" />}
                title={`${locName.get(t.to_location_id)} requested stock (${t.code})`}
                meta="Pick, dispatch and label it"
                href={`/dashboard/transfers/${t.id}`}
                cta="Dispatch"
              />
            ))}
            {discrepancies.map((t) => (
              <Row
                key={t.id}
                icon={<AlertTriangle className="size-4 text-danger-600" />}
                title={`Mismatch on transfer ${t.code}`}
                meta="Received quantity differs from what was sent"
                href={`/dashboard/transfers/${t.id}`}
                cta="Review"
              />
            ))}
            {!myShipments.length && !toReceive.length && !toDispatch.length && !discrepancies.length && (
              <li>
                <EmptyState icon={<Inbox className="size-5" />} title="All clear">
                  Nothing is waiting to be received or dispatched.
                </EmptyState>
              </li>
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Low stock"
            description="Below the minimum you set"
            actions={
              <Link href="/dashboard/reorder" className="text-sm font-medium text-brand-700 hover:underline">
                Reorder →
              </Link>
            }
          />
          {low.length ? (
            <ul className="divide-y divide-line">
              {low.slice(0, 6).map((m) => (
                <li key={`${m.location_id}${m.product_id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.p.name}</p>
                    <p className="text-xs text-muted">{locName.get(m.location_id)}</p>
                  </div>
                  <Badge tone="amber">
                    {Math.floor(m.packsOnHand * 10) / 10} / {m.min_packs} packs
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing below minimum">Set minimum levels on the Reorder page to get alerts here.</EmptyState>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recent stock movements"
          actions={
            <Link href="/dashboard/movements" className="text-sm font-medium text-brand-700 hover:underline">
              All history →
            </Link>
          }
        />
        <MovementList rows={recent ?? []} products={byId} locName={locName} />
      </Card>
    </div>
  );
}

async function SupplierOverview({ ctx }: { ctx: AppContext & { org: NonNullable<AppContext["org"]> } }) {
  // Balances are for the supplier admin only; staff handle orders and dispatch.
  const canKhata = ctx.has("khata") && ctx.is("supplier_admin");
  const [{ data: pos }, { data: shipments }, { data: khata }, { data: customers }] = await Promise.all([
    ctx.supabase
      .from("purchase_orders")
      .select("id, number, status, sent_at, buyer:organisations!purchase_orders_buyer_org_id_fkey(name)")
      .eq("supplier_org_id", ctx.org.id)
      .in("status", ["sent", "accepted", "partially_accepted"])
      .order("sent_at", { ascending: false }),
    ctx.supabase.from("shipments").select("id, status").eq("supplier_org_id", ctx.org.id).eq("status", "in_transit"),
    canKhata
      ? ctx.supabase.from("khata_entries").select("customer_id, kind, amount_paise").eq("supplier_org_id", ctx.org.id)
      : Promise.resolve({ data: [] as { customer_id: string; kind: string; amount_paise: number }[] }),
    ctx.supabase.from("customers").select("id, name").eq("org_id", ctx.org.id),
  ]);

  const balances = new Map<string, number>();
  for (const k of khata ?? []) {
    balances.set(k.customer_id, (balances.get(k.customer_id) ?? 0) + (k.kind === "debit" ? 1 : -1) * Number(k.amount_paise));
  }
  const receivable = [...balances.values()].reduce((s, v) => s + Math.max(v, 0), 0);
  const newOrders = (pos ?? []).filter((p) => p.status === "sent");
  const toDispatch = (pos ?? []).filter((p) => p.status !== "sent");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="New orders" value={newOrders.length} hint="waiting for your answer" tone={newOrders.length ? "amber" : undefined} />
        <Stat label="To dispatch" value={toDispatch.length} hint="accepted, not shipped" />
        <Stat label="In transit" value={(shipments ?? []).length} hint="dispatched, not yet received" />
        {canKhata && <Stat label="Receivable" value={rupees(receivable)} hint="across all customers" tone="green" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Order inbox"
            actions={
              <Link href="/dashboard/inbox" className="text-sm font-medium text-brand-700 hover:underline">
                Open inbox →
              </Link>
            }
          />
          {(pos ?? []).length ? (
            <ul className="divide-y divide-line">
              {(pos ?? []).map((p) => (
                <Row
                  key={p.id}
                  icon={<Inbox className="size-4" />}
                  title={`${p.number} · ${(p.buyer as unknown as { name: string } | null)?.name ?? ""}`}
                  meta={`Received ${dateTime(p.sent_at)}`}
                  href={`/dashboard/inbox/${p.id}`}
                  cta={p.status === "sent" ? "Respond" : "Dispatch"}
                  badge={<StatusBadge status={p.status} />}
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Inbox className="size-5" />} title="No open orders">
              New purchase orders from your customers land here.
            </EmptyState>
          )}
        </Card>

        {canKhata && (
          <Card>
            <CardHeader
              title="Top balances"
              actions={
                <Link href="/dashboard/khata" className="text-sm font-medium text-brand-700 hover:underline">
                  Khata →
                </Link>
              }
            />
            <ul className="divide-y divide-line">
              {(customers ?? [])
                .map((c) => ({ ...c, bal: balances.get(c.id) ?? 0 }))
                .sort((a, b) => b.bal - a.bal)
                .slice(0, 6)
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <Link href={`/dashboard/khata/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <span className={c.bal > 0 ? "font-semibold text-danger-600" : "text-muted"}>{rupees(c.bal)}</span>
                  </li>
                ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({
  icon,
  title,
  meta,
  href,
  cta,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  href: string;
  cta: string;
  badge?: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-paper/60">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-ink">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-muted">{meta}</span>
        </span>
        {badge}
        <span className="flex items-center gap-1 text-sm font-medium text-brand-700">
          {cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </li>
  );
}


function MovementList({
  rows,
  products,
  locName,
}: {
  rows: { id: string; qty_base: number; reason: string; occurred_at: string; product_id: string; location_id: string }[];
  products: Map<string, { name: string; item: { base_unit: "g" | "ml" | "pc" } }>;
  locName: Map<string, string>;
}) {
  if (!rows.length) return <EmptyState title="No movements yet">Scan stock in or receive a delivery to get started.</EmptyState>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((m) => {
        const p = products.get(m.product_id);
        const v = Number(m.qty_base);
        return (
          <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{p?.name ?? "Product"}</p>
              <p className="text-xs text-muted">
                {reasonLabels[m.reason] ?? m.reason} · {locName.get(m.location_id)} · {dateTime(m.occurred_at)}
              </p>
            </div>
            <span className={`font-mono text-sm ${v > 0 ? "text-brand-700" : "text-danger-600"}`}>
              {v > 0 ? "+" : ""}
              {p ? qty(v, p.item.base_unit) : v}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
