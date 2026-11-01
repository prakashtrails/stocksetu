import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getContext } from "@/lib/context";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const ctx = await getContext();
  if (ctx.org) redirect("/dashboard");

  return (
    <div className="min-h-screen flex-1 bg-paper px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <Logo />
        <h1 className="mt-10 text-3xl font-semibold tracking-tight">Set up your workspace</h1>
        <p className="mt-2 text-muted">
          Hi {ctx.user.name.split(" ")[0]}. Tell us how you work — we&apos;ll switch on only the modules you need. You can
          enable more later.
        </p>
        <OnboardingForm />
      </div>
    </div>
  );
}
