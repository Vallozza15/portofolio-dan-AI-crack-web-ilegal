"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Loader2, Mail, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormValues {
  name: string;
  email: string;
  subject: string;
  message: string;
  website: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

const initialValues: FormValues = {
  name: "",
  email: "",
  subject: "",
  message: "",
  website: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ContactForm({
  deliveryConfigured,
  publicEmail,
}: {
  deliveryConfigured: boolean;
  publicEmail: string | null;
}) {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "submitting" }
    | { state: "success"; message: string }
    | { state: "error"; message: string }
  >({ state: "idle" });

  function update(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (field !== "website" && errors[field as keyof FormErrors]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
    if (status.state === "error" || status.state === "success") {
      setStatus({ state: "idle" });
    }
  }

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (values.name.trim().length < 2) next.name = "Mohon isi minimal 2 karakter.";
    if (values.name.trim().length > 80) next.name = "Mohon jaga nama di bawah 80 karakter.";
    if (!EMAIL_PATTERN.test(values.email.trim())) next.email = "Mohon masukkan alamat email yang valid.";
    if (values.subject.trim().length < 3) next.subject = "Mohon tambahkan subjek singkat.";
    if (values.subject.trim().length > 140) next.subject = "Mohon jaga subjek di bawah 140 karakter.";
    if (values.message.trim().length < 20) next.message = "Mohon tulis minimal 20 karakter.";
    if (values.message.trim().length > 5000) next.message = "Mohon jaga pesan di bawah 5.000 karakter.";
    return next;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);

    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      document.getElementById(`contact-${firstError}`)?.focus();
      return;
    }

    setStatus({ state: "submitting" });

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          subject: values.subject.trim(),
          message: values.message.trim(),
          website: values.website,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; error?: string }
        | null;

      if (!response.ok || !data?.ok) {
        setStatus({
          state: "error",
          message:
            data?.error ??
            "Pesan tidak dapat dikirim. Tidak ada yang terkirim. Silakan coba lagi nanti.",
        });
        return;
      }

      setValues(initialValues);
      setStatus({
        state: "success",
        message: data.message ?? "Pesan Anda berhasil dikirim.",
      });
    } catch {
      setStatus({
        state: "error",
        message:
          "Formulir tidak dapat menghubungi server. Tidak ada yang terkirim. Periksa koneksi Anda dan coba lagi.",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="relative">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
            Nama <span className="text-accent">*</span>
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            autoComplete="name"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "contact-name-error" : undefined}
            placeholder="Nama Anda"
            className="field"
            required
          />
          {errors.name && (
            <p id="contact-name-error" className="mt-1.5 text-[11px] text-danger">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="contact-email" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
            Email <span className="text-accent">*</span>
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "contact-email-error" : undefined}
            placeholder="nama@contoh.com"
            className="field"
            required
          />
          {errors.email && (
            <p id="contact-email-error" className="mt-1.5 text-[11px] text-danger">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="contact-subject" className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
          Subjek <span className="text-accent">*</span>
        </label>
        <input
          id="contact-subject"
          name="subject"
          type="text"
          value={values.subject}
          onChange={(event) => update("subject", event.target.value)}
          aria-invalid={Boolean(errors.subject)}
          aria-describedby={errors.subject ? "contact-subject-error" : undefined}
          placeholder="Apa yang ingin Anda bicarakan?"
          className="field"
          required
        />
        {errors.subject && (
          <p id="contact-subject-error" className="mt-1.5 text-[11px] text-danger">
            {errors.subject}
          </p>
        )}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="contact-message" className="block font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
            Pesan <span className="text-accent">*</span>
          </label>
          <span className="font-mono text-[8px] tracking-[0.1em] text-muted">
            {values.message.length} / 5000
          </span>
        </div>
        <textarea
          id="contact-message"
          name="message"
          rows={6}
          value={values.message}
          onChange={(event) => update("message", event.target.value)}
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          placeholder="Sedikit konteks, pertanyaan, atau ide yang layak dijelajahi."
          className="field resize-y"
          required
        />
        {errors.message && (
          <p id="contact-message-error" className="mt-1.5 text-[11px] text-danger">
            {errors.message}
          </p>
        )}
      </div>

      <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Biarkan kolom ini kosong</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(event) => update("website", event.target.value)}
        />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-bg/40 px-3.5 py-3">
          <span
            aria-hidden
            className={cn(
              "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
              deliveryConfigured ? "bg-emerald-400" : "bg-amber-400",
            )}
          />
          <p className="text-[11px] leading-relaxed text-muted">
            {deliveryConfigured
              ? "Pengiriman email sudah dikonfigurasi. Pesan baru dikonfirmasi setelah layanan menerimanya."
              : "Pengiriman belum dikonfigurasi pada pratinjau ini. Formulir memvalidasi secara lokal tetapi belum dapat mengirim pesan."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="submit"
            disabled={status.state === "submitting"}
            className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-[var(--invert)] transition-colors hover:bg-accent hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            {status.state === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Mengirim…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Kirim pesan
              </>
            )}
          </button>
          <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
            Tidak ada pesan yang terkirim diam-diam
          </p>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="wait">
          {status.state === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3.5"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div>
                <p className="text-sm font-medium text-ink">Pesan terkirim.</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{status.message}</p>
              </div>
            </motion.div>
          )}

          {status.state === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3.5"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-medium text-ink">Pesan tidak terkirim.</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{status.message}</p>
                {publicEmail && (
                  <a
                    href={`mailto:${publicEmail}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-accent hover:underline"
                  >
                    <Mail className="h-3 w-3" />
                    Kirim email langsung saja
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
