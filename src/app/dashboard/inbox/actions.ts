"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendly, str, type ActionResult } from "@/lib/action";
import { requireModule } from "@/lib/context";

export async function respondPo(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("supplier");
  const reject = str(form, "intent") === "reject";
  const lines = [...form.entries()]
    .filter(([k]) => k.startsWith("acc_"))
    .map(([k, v]) => ({ line_id: k.slice(4), qty_accepted: Number(String(v).replace(/\D/g, "") || 0) }));
  const { data, error } = await ctx.supabase.rpc("respond_po", {
    p_po: str(form, "id"),
    p_lines: lines,
    p_reject: reject,
    p_note: str(form, "note"),
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: data === "rejected" ? "Order rejected. The buyer can see it now." : "Order accepted. The buyer sees what you can fill — dispatch when ready." };
}

type DispatchLine = { product_id: string; qty_packs: number; rate_paise?: number; po_line_id?: string };

export async function dispatch(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("supplier");
  let lines: DispatchLine[] = [];
  const poId = str(form, "po_id");
  if (poId) {
    lines = [...form.entries()]
      .filter(([k, v]) => k.startsWith("send_") && Number(v) > 0)
      .map(([k, v]) => {
        const [, lineId, productId, rate] = k.split("_");
        return { po_line_id: lineId, product_id: productId, qty_packs: Number(v), rate_paise: Number(rate) };
      });
  } else {
    try {
      lines = JSON.parse(str(form, "lines") || "[]");
    } catch {
      /* empty */
    }
  }
  if (!lines.length) return { error: "Add at least one product with a quantity to dispatch." };

  const { data, error } = await ctx.supabase.rpc("dispatch_shipment", {
    p_supplier_org: ctx.org.id,
    p_customer: str(form, "customer_id"),
    p_from_location: str(form, "from_location_id") || null,
    p_po: poId || null,
    p_lines: lines,
    p_note: str(form, "note"),
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/dispatch/${data}`);
}

export async function addCustomer(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("supplier", ["supplier_admin"]);
  const name = str(form, "name");
  if (!name) return { error: "Enter the customer's name." };
  const { error } = await ctx.supabase.from("customers").insert({
    org_id: ctx.org.id,
    name,
    phone: str(form, "phone").replace(/\D/g, "") || null,
    gstin: str(form, "gstin").toUpperCase() || null,
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard/customers");
  return { ok: `${name} added.` };
}

export async function recordPayment(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("khata", ["supplier_admin"]);
  const amount = Math.round(Number(str(form, "amount").replace(/[,₹\s]/g, "")) * 100);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount received." };
  const { error } = await ctx.supabase.from("khata_entries").insert({
    supplier_org_id: ctx.org.id,
    customer_id: str(form, "customer_id"),
    kind: "credit",
    amount_paise: amount,
    note: [str(form, "mode"), str(form, "note")].filter(Boolean).join(" — ") || "Payment received",
    created_by: ctx.user.id,
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard/khata", "layout");
  return { ok: "Payment recorded." };
}
