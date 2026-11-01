"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CloudOff, Link2, Loader2, Minus, PackagePlus, Plus, RefreshCw, Search } from "lucide-react";
import { CameraScanner } from "@/components/app/camera-scanner";
import { ProductSearch } from "@/components/app/product-search";
import { buttonClass } from "@/components/ui/button";
import { Badge, Card, CardHeader, inputClass, selectClass } from "@/components/ui/kit";
import type { Balance, ProductOption } from "@/lib/data";
import { dateTime, qty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { linkBarcode, syncEvents, type StockEvent } from "./actions";

type Mode = "scan_in" | "scan_out" | "wastage" | "lookup";
type Queued = StockEvent & { label: string; status: "pending" | "error"; message?: string };
type Done = { id: string; label: string; at: string };

const modes: { key: Mode; label: string; hint: string }[] = [
  { key: "scan_in", label: "Stock in", hint: "Opening stock or stock found" },
  { key: "scan_out", label: "Stock out", hint: "Issued / used / sold" },
  { key: "wastage", label: "Wastage", hint: "Spoiled, spilled, expired" },
  { key: "lookup", label: "Look up", hint: "See what's on hand" },
];

function toEvent(q: Queued): StockEvent {
  return { id: q.id, location_id: q.location_id, product_id: q.product_id, qty_base: q.qty_base, reason: q.reason, occurred_at: q.occurred_at };
}

function readQueue(key: string): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

export function ScanStation({
  userId,
  locations,
  products: initialProducts,
  balances,
  canLink,
}: {
  userId: string;
  locations: { id: string; name: string }[];
  products: ProductOption[];
  balances: Balance[];
  canLink: boolean;
}) {
  const router = useRouter();
  const queueKey = `ss_scan_queue_${userId}`;
  const [products, setProducts] = useState(initialProducts);
  const [location, setLocation] = useState(locations[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("scan_in");
  const [current, setCurrent] = useState<ProductOption | null>(null);
  const [packsInput, setPacksInput] = useState("1");
  const [unknown, setUnknown] = useState<string | null>(null);
  const [linkTo, setLinkTo] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [done, setDone] = useState<Done[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const byCode = useMemo(() => {
    const m = new Map<string, ProductOption>();
    for (const p of products) for (const c of p.barcodes) m.set(c, p);
    return m;
  }, [products]);

  const onHand = (productId: string) =>
    balances.find((b) => b.location_id === location && b.product_id === productId)?.qty_base ?? 0;

  const save = (q: Queued[]) => {
    setQueue(q);
    try {
      localStorage.setItem(queueKey, JSON.stringify(q));
    } catch {
      /* storage unavailable: the queue still lives in memory */
    }
  };

  const sync = useCallback(async () => {
    const pending = readQueue(queueKey);
    if (!pending.length || !navigator.onLine) return;
    setSyncing(true);
    const res = await syncEvents(pending.map(toEvent)).catch(() => ({
      error: "offline",
      results: undefined,
    }));
    setSyncing(false);
    if (!res.results) return;
    const results = new Map(res.results.map((r) => [r.id, r]));
    const synced = pending.filter((e) => results.has(e.id) && results.get(e.id)!.status !== "error");
    const syncedIds = new Set(synced.map((e) => e.id));
    // Re-read: scans added while this sync was in flight must stay queued.
    save(
      readQueue(queueKey)
        .filter((e) => !syncedIds.has(e.id))
        .map((e) =>
          results.get(e.id)?.status === "error" ? { ...e, status: "error" as const, message: results.get(e.id)?.message } : e,
        ),
    );
    if (synced.length) {
      setDone((d) => [...synced.map((e) => ({ id: e.id, label: e.label, at: new Date().toISOString() })), ...d].slice(0, 15));
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueKey, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the device queue once on mount
    setQueue(readQueue(queueKey));
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    sync();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [queueKey, sync]);

  const handleCode = (code: string) => {
    const p = byCode.get(code);
    setLinkError(null);
    if (p) {
      setUnknown(null);
      setCurrent(p);
      setPacksInput("1");
    } else {
      setCurrent(null);
      setUnknown(code);
      setLinkTo(null);
    }
  };

  const add = () => {
    if (!current || mode === "lookup") return;
    const n = Number(packsInput);
    if (!Number.isFinite(n) || n <= 0) return;
    const base = Math.round(n * current.pack_qty);
    const sign = mode === "scan_in" ? 1 : -1;
    const event: Queued = {
      id: crypto.randomUUID(),
      location_id: location,
      product_id: current.id,
      qty_base: sign * base,
      reason: mode,
      occurred_at: new Date().toISOString(),
      label: `${sign > 0 ? "+" : "−"}${n} × ${current.name}`,
      status: "pending",
    };
    save([...readQueue(queueKey), event]);
    setCurrent(null);
    sync();
  };

  const doLink = async () => {
    if (!unknown || !linkTo) return;
    const res = await linkBarcode(unknown, linkTo);
    if (res.error) {
      setLinkError(res.error);
      return;
    }
    const linked = products.find((p) => p.id === linkTo)!;
    const updated = { ...linked, barcodes: [...linked.barcodes, unknown] };
    setProducts((ps) => ps.map((p) => (p.id === linkTo ? updated : p)));
    setUnknown(null);
    setCurrent(updated);
  };

  if (!locations.length) {
    return <Card className="p-6 text-sm text-muted">You don&apos;t have access to any location yet. Ask your admin.</Card>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-muted">Location</span>
              <select value={location} onChange={(e) => setLocation(e.target.value)} className={selectClass + " mt-1"}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="text-xs font-medium text-muted">What are you doing?</span>
              <div className="mt-1 grid grid-cols-4 gap-1 rounded-xl bg-paper p-1">
                {modes.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    title={m.hint}
                    onClick={() => setMode(m.key)}
                    className={cn(
                      "rounded-lg px-1 py-1.5 text-xs font-medium transition",
                      mode === m.key ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <CameraScanner onCode={handleCode} />

        <Card className="p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Search className="size-4 text-muted" /> No barcode? Pick the item (loose goods)
          </p>
          <ProductSearch
            products={products}
            value={current?.id ?? null}
            onChange={(id) => {
              setUnknown(null);
              setCurrent(products.find((p) => p.id === id) ?? null);
              setPacksInput("1");
            }}
          />
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-2">
        {current && (
          <Card className="border-brand-200 p-5 shadow-[0_16px_40px_-24px_rgb(5_150_105/0.6)]">
            <p className="text-xs font-medium text-brand-700">Scanned</p>
            <p className="mt-1 text-lg font-semibold">{current.name}</p>
            <p className="text-sm text-muted">
              {current.item}
              {current.item_hi ? ` / ${current.item_hi}` : ""} · {current.pack_label} per pack
            </p>
            <p className="mt-3 text-sm">
              On hand here: <span className="font-semibold">{qty(onHand(current.id), current.unit)}</span>
            </p>
            {mode !== "lookup" && (
              <div className="mt-4">
                <span className="text-xs font-medium text-muted">Packs</span>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Less"
                    onClick={() => setPacksInput((v) => String(Math.max(1, Number(v || 1) - 1)))}
                    className="grid size-11 place-items-center rounded-xl border border-line"
                  >
                    <Minus className="size-4" />
                  </button>
                  <input
                    inputMode="decimal"
                    value={packsInput}
                    onChange={(e) => setPacksInput(e.target.value.replace(/[^\d.]/g, ""))}
                    className={inputClass + " h-11 text-center text-lg font-semibold"}
                    aria-label="Packs"
                  />
                  <button
                    type="button"
                    aria-label="More"
                    onClick={() => setPacksInput((v) => String(Number(v || 0) + 1))}
                    className="grid size-11 place-items-center rounded-xl border border-line"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted">Loose goods: use decimals, e.g. 2.5 packs of 1 kg = 2.5 kg</p>
                <button type="button" onClick={add} className={buttonClass({ variant: mode === "scan_in" ? "brand" : "primary", size: "lg" }, "mt-4 w-full")}>
                  <PackagePlus className="size-4" />
                  {mode === "scan_in" ? "Add to stock" : mode === "wastage" ? "Record wastage" : "Take out of stock"}
                </button>
              </div>
            )}
          </Card>
        )}

        {unknown && (
          <Card className="border-saffron-400/50 p-5">
            <p className="flex items-center gap-2 font-semibold text-saffron-600">
              <AlertTriangle className="size-4" /> Unknown barcode
            </p>
            <p className="mt-1 font-mono text-sm">{unknown}</p>
            {canLink ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted">Link it to a catalogue product. From now on it will scan straight away — for every shop.</p>
                <ProductSearch products={products} value={linkTo} onChange={setLinkTo} />
                {linkError && <p className="text-sm text-danger-600">{linkError}</p>}
                <button type="button" onClick={doLink} disabled={!linkTo} className={buttonClass({ size: "md" }, "w-full")}>
                  <Link2 className="size-4" /> Link barcode
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Pick the item from the list on the left, and ask your manager to link this barcode.</p>
            )}
          </Card>
        )}

        <Card>
          <CardHeader
            title="This device"
            actions={
              online ? (
                <Badge tone="green">Online</Badge>
              ) : (
                <Badge tone="amber">
                  <CloudOff className="size-3" /> Offline
                </Badge>
              )
            }
          />
          <div className="p-4">
            {queue.length > 0 ? (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{queue.length} pending sync</p>
                  <button type="button" onClick={sync} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                    {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Sync now
                  </button>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {queue.map((q) => (
                    <li key={q.id} className="rounded-lg bg-paper px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{q.label}</span>
                        {q.status === "error" ? (
                          <button
                            type="button"
                            onClick={() => save(queue.filter((x) => x.id !== q.id))}
                            className="text-xs text-danger-600 underline"
                          >
                            Discard
                          </button>
                        ) : (
                          <Badge tone="amber">pending</Badge>
                        )}
                      </div>
                      {q.message && <p className="mt-1 text-xs text-danger-600">{q.message}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <CheckCircle2 className="size-4 text-brand-600" /> Everything is synced
              </p>
            )}
            {done.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-3">
                {done.map((d) => (
                  <li key={d.id} className="flex justify-between text-sm">
                    <span className="truncate">{d.label}</span>
                    <span className="text-xs text-muted">{dateTime(d.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
