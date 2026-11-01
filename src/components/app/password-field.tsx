"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { inputClass } from "@/components/ui/kit";

function generate() {
  const words = ["Masala", "Chai", "Tadka", "Kesar", "Pista", "Jeera", "Laddu", "Pakora"];
  const bytes = crypto.getRandomValues(new Uint32Array(2));
  return `${words[bytes[0] % words.length]}@${1000 + (bytes[1] % 9000)}`;
}

// Password input with a "generate" button, for admins creating logins.
export function PasswordField({ name = "password", compact = false }: { name?: string; compact?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <div className="relative">
      <input
        name={name}
        required
        minLength={8}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={compact ? "New password" : "Min 8 characters"}
        aria-label="Password"
        className={inputClass + " pr-10 font-mono" + (compact ? " h-8 text-xs" : "")}
      />
      <button
        type="button"
        title="Generate a password"
        aria-label="Generate a password"
        onClick={() => setValue(generate())}
        className={`absolute right-1 grid place-items-center rounded-lg text-muted hover:bg-paper hover:text-brand-700 ${compact ? "top-0.5 size-7" : "top-1 size-8"}`}
      >
        <Wand2 className="size-4" />
      </button>
    </div>
  );
}
