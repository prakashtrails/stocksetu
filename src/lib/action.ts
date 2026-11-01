export type ActionResult = { ok?: string; error?: string; id?: string };

// Turn a Postgres / Supabase error into a sentence a shop owner can act on.
export function friendly(error: { message?: string; code?: string } | null | undefined): string {
  const m = error?.message ?? "Something went wrong";
  if (error?.code === "23505") return "That already exists.";
  if (error?.code === "42501" || /row-level security/i.test(m)) return "You don't have permission to do that.";
  if (/violates check constraint/i.test(m)) return "Some values are not allowed. Please check the numbers.";
  return m;
}

export function str(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export function int(form: FormData, key: string): number | null {
  const s = str(form, key);
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}
