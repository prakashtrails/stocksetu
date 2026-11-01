"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendly, str, type ActionResult } from "@/lib/action";
import { requireModule } from "@/lib/context";

type LineIn = { product_id: string; qty_packs: number };

export async function createTransfer(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("transfers");
  const from = str(form, "from_location_id");
  const to = str(form, "to_location_id");
  const intent = str(form, "intent"); // request | draft | dispatch
  if (!from || !to || from === to) return { error: "Pick two different locations." };
  let lines: LineIn[] = [];
  try {
    lines = JSON.parse(str(form, "lines") || "[]");
  } catch {
    /* handled below */
  }
  if (!lines.length) return { error: "Add at least one product with a quantity." };
  const canDispatch = ctx.is("admin", "warehouse") && ctx.locations.some((l) => l.id === from);
  if (intent === "dispatch" && !canDispatch) return { error: "Only warehouse staff at the sending location can dispatch." };

  const { data: t, error } = await ctx.supabase
    .from("transfers")
    .insert({
      org_id: ctx.org.id,
      from_location_id: from,
      to_location_id: to,
      status: intent === "request" ? "requested" : "draft",
      note: str(form, "note") || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return { error: friendly(error) };

  const { error: lineError } = await ctx.supabase
    .from("transfer_lines")
    .insert(lines.map((l) => ({ transfer_id: t.id, product_id: l.product_id, qty_packs: l.qty_packs })));
  if (lineError) return { error: friendly(lineError) };

  if (intent === "dispatch") {
    const { error: dErr } = await ctx.supabase.rpc("dispatch_transfer", { p_transfer: t.id });
    if (dErr) {
      revalidatePath("/dashboard/transfers");
      redirect(`/dashboard/transfers/${t.id}?error=${encodeURIComponent(friendly(dErr))}`);
    }
  }
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/transfers/${t.id}`);
}

export async function dispatchTransfer(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("transfers");
  const id = str(form, "id");
  const { error } = await ctx.supabase.rpc("dispatch_transfer", { p_transfer: id });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard", "layout");
  return { ok: "Dispatched. Stock is now in transit — print the label and send it with the goods." };
}

export async function receiveTransfer(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("transfers");
  const id = str(form, "id");
  const lines = [...form.entries()]
    .filter(([k]) => k.startsWith("recv_"))
    .map(([k, v]) => ({ line_id: k.slice(5), qty_received: Number(String(v).replace(/\D/g, "") || 0) }));
  const { data, error } = await ctx.supabase.rpc("receive_transfer", { p_transfer: id, p_lines: lines });
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard", "layout");
  return data === "received"
    ? { ok: "Received — everything matched and stock is now at your location." }
    : { ok: "Received with a mismatch. Accepted quantities were added; the difference is flagged for review." };
}

export async function cancelTransfer(_: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await requireModule("transfers");
  const { error } = await ctx.supabase.from("transfers").update({ status: "cancelled" }).eq("id", str(form, "id"));
  if (error) return { error: friendly(error) };
  revalidatePath("/dashboard/transfers");
  return { ok: "Transfer cancelled." };
}
