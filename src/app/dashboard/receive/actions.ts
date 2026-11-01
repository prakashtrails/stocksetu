"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendly, str, type ActionResult } from "@/lib/action";
import { requireModule } from "@/lib/context";

export async function receiveGoods(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("inventory");
  let lines: unknown[];
  try {
    lines = JSON.parse(str(form, "lines") || "[]");
  } catch {
    return { error: "Couldn't read the lines. Please try again." };
  }
  if (!Array.isArray(lines) || !lines.length) return { error: "Add at least one product." };

  const { data, error } = await ctx.supabase.rpc("receive_goods", {
    p_location: str(form, "location_id"),
    p_po: str(form, "po_id") || null,
    p_shipment: str(form, "shipment_id") || null,
    p_supplier_name: str(form, "supplier_name"),
    p_bill: str(form, "bill_number"),
    p_lines: lines,
    p_note: str(form, "note"),
  });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/receive?done=${data}`);
}

export async function findByCode(form: FormData) {
  const ctx = await requireModule("inventory");
  const code = str(form, "code").toUpperCase();
  if (code.startsWith("TRF-")) {
    const { data } = await ctx.supabase.from("transfers").select("id").eq("code", code).maybeSingle();
    if (data) redirect(`/dashboard/transfers/${data.id}`);
  } else {
    const { data } = await ctx.supabase.from("shipments").select("id").eq("code", code).eq("buyer_org_id", ctx.org.id).maybeSingle();
    if (data) redirect(`/dashboard/receive/shipment/${data.id}`);
  }
  redirect(`/dashboard/receive?notfound=${encodeURIComponent(code)}`);
}
