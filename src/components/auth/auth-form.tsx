"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNext } from "@/lib/safe-next";

type Mode = "login" | "signup";

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none transition placeholder:text-muted/70 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const linkError = params.get("error") === "link";

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    linkError ? "That link has expired or was already used. Please log in." : null,
  );
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      setError("Supabase isn't configured yet. Add the keys to .env.local and restart the server.");
      return;
    }
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    setPending(true);
    setError(null);
    const supabase = createClient();

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          data: {
            full_name: String(form.get("name") ?? "").trim(),
            business_name: String(form.get("business") ?? "").trim(),
          },
        },
      });
      if (error) throw error;
      if (data.session) {
        router.replace(next);
        router.refresh();
        return;
      }
      setSentTo(email);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <MailCheck className="size-7" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-muted">
          We sent a confirmation link to <span className="font-medium text-ink">{sentTo}</span>. Open it to finish
          setting up your account.
        </p>
        <Link href="/login" className="mt-8 inline-block text-sm font-medium text-brand-700 hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  const isSignup = mode === "signup";

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{isSignup ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-muted">
        {isSignup ? "Start tracking your kitchen's stock in minutes." : "Log in to your StockSetu dashboard."}
      </p>

      {!isSupabaseConfigured && (
        <p className="mt-6 flex gap-2 rounded-xl border border-saffron-400/40 bg-saffron-100/50 p-3 text-sm text-saffron-600">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          Setup needed: add your Supabase URL and publishable key to .env.local.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {isSignup && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" htmlFor="name">
              <input id="name" name="name" required autoComplete="name" className={inputClass} placeholder="Ravi Kumar" />
            </Field>
            <Field label="Business name" htmlFor="business">
              <input id="business" name="business" required className={inputClass} placeholder="Spice Route Café" />
            </Field>
          </div>
        )}
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            placeholder="you@restaurant.in"
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={isSignup ? 8 : undefined}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className={`${inputClass} pr-11`}
              placeholder={isSignup ? "At least 8 characters" : "••••••••"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        {error && (
          <p role="alert" className="flex gap-2 rounded-xl bg-danger-100/60 p-3 text-sm text-danger-600">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSignup ? "Create account" : "Log in"}
          {!pending && <ArrowRight className="size-4" />}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        {isSignup ? "Already have an account?" : "New to StockSetu?"}{" "}
        <Link
          href={`${isSignup ? "/login" : "/signup"}${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-brand-700 hover:underline"
        >
          {isSignup ? "Log in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function friendlyError(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first — check your inbox.";
  if (/already registered/i.test(message)) return "An account with this email already exists. Try logging in.";
  if (/password/i.test(message)) return message;
  if (/fetch|network/i.test(message)) return "Couldn't reach the server. Check your connection and try again.";
  return message || "Something went wrong. Please try again.";
}
