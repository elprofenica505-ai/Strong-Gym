"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { cn } from "@/lib/utils";

export function NewsletterForm({ className }: { className?: string }) {
  const { dict, locale } = useDictionary();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      setStatus(response.ok ? "done" : "error");
      if (response.ok) setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className={cn("flex items-center gap-2 text-[0.875rem] font-medium text-volt", className)}>
        <Check className="size-4" aria-hidden="true" />
        {dict.footer.newsletterSuccess}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2 rounded-full border border-line bg-void/60 p-1 pl-4 transition-colors focus-within:border-volt/60">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={dict.footer.newsletterPlaceholder}
          aria-label={dict.footer.newsletter}
          className="h-9 min-w-0 flex-1 bg-transparent text-[0.875rem] text-chalk placeholder:text-fog/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          aria-label={dict.footer.newsletterButton}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-volt text-ink transition-transform hover:scale-105 disabled:opacity-50"
        >
          <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      {status === "error" ? (
        <p className="text-[0.75rem] text-flame">{dict.contact.error}</p>
      ) : null}
    </form>
  );
}
