"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { useDictionary } from "@/components/providers/dictionary-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";

type FormState = "idle" | "sending" | "sent" | "error";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ContactForm() {
  const { dict, locale } = useDictionary();
  const [state, setState] = useState<FormState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;

    const form = event.currentTarget;
    const data = new FormData(form);

    const values = {
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      phone: String(data.get("phone") ?? "").trim(),
      subject: String(data.get("subject") ?? "info"),
      message: String(data.get("message") ?? "").trim(),
      website: String(data.get("website") ?? ""),
      locale,
    };

    // Validación en el cliente (el servidor valida igual con zod)
    const nextErrors: Record<string, string> = {};
    if (values.name.length < 2) nextErrors.name = dict.contact.required;
    if (!emailPattern.test(values.email)) nextErrors.email = dict.contact.invalidEmail;
    if (values.message.length < 10) nextErrors.message = dict.contact.tooShort;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setState("sending");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        setState("sent");
        form.reset();
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="flex h-full min-h-80 flex-col items-center justify-center gap-4 rounded-2xl border border-brand/35 bg-brand/[0.06] p-10 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-brand text-onbrand">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>

        <p className="max-w-sm text-[0.9375rem] leading-relaxed text-ink">
          {dict.contact.success}
        </p>

        <Button variant="outline" size="sm" onClick={() => setState("idle")}>
          {dict.cta.back}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-line bg-card p-6 sm:p-7 lg:p-8"
    >
      <header className="mb-6">
        <h3 className="display-xl text-[1.5rem] leading-none">{dict.contact.formTitle}</h3>
        <p className="mt-2 text-[0.8125rem] text-fog">{dict.contact.formSubtitle}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="name"
          label={dict.contact.name}
          placeholder={dict.contact.namePlaceholder}
          autoComplete="name"
          required
          error={errors.name}
        />

        <Input
          name="email"
          type="email"
          label={dict.contact.email}
          placeholder={dict.contact.emailPlaceholder}
          autoComplete="email"
          required
          error={errors.email}
        />

        <Input
          name="phone"
          type="tel"
          label={dict.contact.phone}
          placeholder={dict.contact.phonePlaceholder}
          autoComplete="tel"
        />

        <Select name="subject" label={dict.contact.subject} defaultValue="info">
          {Object.entries(dict.contact.subjectOptions).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Textarea
          name="message"
          label={dict.contact.message}
          placeholder={dict.contact.messagePlaceholder}
          rows={5}
          required
          error={errors.message}
          wrapperClassName="sm:col-span-2"
        />

        {/* Honeypot anti-bots: invisible para personas */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
      </div>

      {state === "error" ? (
        <p className="mt-4 rounded-xl border border-alert/40 bg-alert/10 px-4 py-3 text-[0.8125rem] text-alert">
          {dict.contact.error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.75rem] leading-snug text-fog">{dict.contact.formSubtitle}</p>

        <Button type="submit" size="lg" disabled={state === "sending"} className="sm:w-auto">
          <Send className="size-4" aria-hidden="true" />
          {state === "sending" ? dict.contact.sending : dict.contact.send}
        </Button>
      </div>
    </form>
  );
}
