"use server";

import { revalidatePath } from "next/cache";
import { friendly, int, str, type ActionResult } from "@/lib/action";
import { requireOrg } from "@/lib/context";
import { parseRupees } from "@/lib/format";
import { closest } from "@/lib/similar";

const UNITS = ["g", "ml", "pc"];

async function canEdit() {
  const ctx = await requireOrg();
  if (!ctx.is("admin", "warehouse", "supplier_admin")) return { ctx, error: "Only an admin or warehouse manager can edit the catalogue." };
  return { ctx, error: null };
}

async function createProduct(
  ctx: Awaited<ReturnType<typeof requireOrg>>,
  itemId: string,
  form: FormData,
): Promise<ActionResult> {
  const packQty = int(form, "pack_qty");
  if (!packQty || packQty <= 0) return { error: "Pack size must be a whole number of grams / ml / pieces." };
  const brand = str(form, "brand");
  const label = str(form, "pack_label") || `${packQty} ${str(form, "unit_label") || ""}`.trim();
  const cost = str(form, "cost") ? parseRupees(str(form, "cost")) : 0;
  if (cost === null) return { error: "Price must be a number like 180 or 180.50." };
  const { data: item } = await ctx.supabase.from("items").select("name").eq("id", itemId).single();
  const name = str(form, "product_name") || [brand, item?.name, label].filter(Boolean).join(" ");

  const { data: product, error } = await ctx.supabase
    .from("products")
    .insert({
      item_id: itemId,
      org_id: ctx.org.id,
      name,
      brand: brand || null,
      pack_qty: packQty,
      pack_label: label,
      cost_paise: cost,
      gst_bp: Math.round(Number(str(form, "gst") || 5) * 100),
      hsn: str(form, "hsn") || null,
    })
    .select("id")
    .single();
  if (error) return { error: friendly(error) };

  const code = str(form, "barcode");
  if (code) {
    const { error: bErr } = await ctx.supabase
      .from("barcodes")
      .insert({ code, product_id: product.id, org_id: ctx.org.id, created_by: ctx.user.id });
    if (bErr) return { error: bErr.code === "23505" ? "Product saved, but that barcode already belongs to another product." : friendly(bErr) };
  }
  await ctx.supabase.from("audit_log").insert({
    org_id: ctx.org.id,
    actor: ctx.user.id,
    action: "product.created",
    entity: "product",
    entity_id: product.id,
    details: { name },
  });
  revalidatePath("/dashboard/catalog");
  return { ok: `Added ${name}.` };
}

export async function addItem(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { ctx, error } = await canEdit();
  if (error) return { error };
  const name = str(form, "name");
  const unit = str(form, "base_unit");
  if (!name) return { error: "Enter the item name." };
  if (!UNITS.includes(unit)) return { error: "Choose how it's measured." };

  // Stop fragmentation: "toor daal" should become the existing "Toor Dal".
  if (!form.get("confirm_new")) {
    const { data: items } = await ctx.supabase.from("items").select("id, name, name_hi").or(`org_id.is.null,org_id.eq.${ctx.org.id}`);
    const match = closest(name, items ?? [], (i) => [i.name, i.name_hi ?? ""]);
    if (match) {
      return {
        error: `Did you mean “${match.item.name}”? Add a product to that item instead, or tick “It's really a new item” and save again.`,
      };
    }
  }

  const { data: item, error: iErr } = await ctx.supabase
    .from("items")
    .insert({
      org_id: ctx.org.id,
      name,
      name_hi: str(form, "name_hi") || null,
      category: str(form, "category") || "General",
      base_unit: unit,
    })
    .select("id")
    .single();
  if (iErr) return { error: friendly(iErr) };
  return createProduct(ctx, item.id, form);
}

export async function addProduct(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { ctx, error } = await canEdit();
  if (error) return { error };
  const itemId = str(form, "item_id");
  if (!itemId) return { error: "Pick the item this product belongs to." };
  return createProduct(ctx, itemId, form);
}

export async function addBarcode(_: ActionResult, form: FormData): Promise<ActionResult> {
  const { ctx, error } = await canEdit();
  if (error) return { error };
  const code = str(form, "code");
  const productId = str(form, "product_id");
  const { data: p } = await ctx.supabase.from("products").select("org_id").eq("id", productId).maybeSingle();
  if (!p || code.length < 3) return { error: "Enter a valid code." };
  const { error: bErr } = await ctx.supabase
    .from("barcodes")
    .insert({ code, product_id: productId, org_id: p.org_id, created_by: ctx.user.id });
  if (bErr) return { error: bErr.code === "23505" ? "That barcode already belongs to a product." : friendly(bErr) };
  revalidatePath("/dashboard/catalog");
  return { ok: "Barcode linked." };
}
