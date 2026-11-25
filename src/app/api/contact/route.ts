import { NextResponse } from "next/server";
import { Resend } from "resend";
import { isContactDeliveryConfigured } from "@/lib/contact";

export const runtime = "nodejs";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const attempts = new Map<string, number[]>();

function getClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return ip;
}

function rateLimited(key: string) {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    attempts.set(key, recent);
    return true;
  }
  recent.push(now);
  attempts.set(key, recent);

  if (attempts.size > 2000) {
    for (const [entryKey, times] of attempts) {
      if (!times.some((time) => now - time < WINDOW_MS)) attempts.delete(entryKey);
    }
  }
  return false;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cleanLine(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "";
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { ok: false, error: "Format permintaan tidak didukung." },
        { status: 415 },
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 20_000) {
      return NextResponse.json(
        { ok: false, error: "Pesan terlalu besar." },
        { status: 413 },
      );
    }

    const key = getClientKey(request);
    if (rateLimited(key)) {
      return NextResponse.json(
        { ok: false, error: "Terlalu banyak percobaan. Mohon tunggu beberapa menit lalu coba lagi." },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Isi permintaan tidak dapat dibaca." },
        { status: 400 },
      );
    }

    if (typeof body.website === "string" && body.website.trim().length > 0) {
      return NextResponse.json(
        { ok: false, error: "Pengiriman ditolak." },
        { status: 400 },
      );
    }

    const name = cleanLine(body.name, 80);
    const email = cleanLine(body.email, 254);
    const subject = cleanLine(body.subject, 140);
    const message = cleanText(body.message, 5000);

    if (name.length < 2) {
      return NextResponse.json({ ok: false, error: "Mohon isi nama yang valid." }, { status: 400 });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Mohon isi alamat email yang valid." },
        { status: 400 },
      );
    }
    if (subject.length < 3) {
      return NextResponse.json({ ok: false, error: "Mohon isi subjek." }, { status: 400 });
    }
    if (message.length < 20) {
      return NextResponse.json(
        { ok: false, error: "Mohon tulis pesan minimal 20 karakter." },
        { status: 400 },
      );
    }

    if (!isContactDeliveryConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Pengiriman email belum dikonfigurasi di situs ini. Tidak ada yang terkirim. Silakan gunakan saluran langsung yang sudah diterbitkan.",
        },
        { status: 503 },
      );
    }

    const apiKey = process.env.RESEND_API_KEY as string;
    const from = process.env.CONTACT_FROM_EMAIL as string;
    const to = (process.env.CONTACT_TO_EMAIL as string)
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean);

    const resend = new Resend(apiKey);
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");

    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `[Portofolio] ${subject}`,
      text: `Nama: ${name}\nEmail: ${email}\nSubjek: ${subject}\n\n${message}`,
      html: `
        <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:600px;margin:0 auto;color:#111">
          <p style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7c3aed">Portofolio Vallozza</p>
          <h1 style="font-size:22px;margin:12px 0">${safeSubject}</h1>
          <p style="font-size:14px;line-height:1.7">${safeMessage}</p>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0" />
          <p style="font-size:13px;color:#555">
            Dari: ${safeName}<br />
            Balas ke: <a href="mailto:${safeEmail}">${safeEmail}</a>
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend rejected the contact message:", error);
      return NextResponse.json(
        {
          ok: false,
          error: "Layanan email menolak pesan. Tidak ada yang terkirim. Silakan coba lagi nanti.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Pesan Anda diterima oleh layanan email. Terima kasih sudah menghubungi.",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Contact route failed:", error);
    return NextResponse.json(
      { ok: false, error: "Terjadi kesalahan server yang tidak terduga. Tidak ada yang terkirim." },
      { status: 500 },
    );
  }
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: "Metode tidak diizinkan." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
