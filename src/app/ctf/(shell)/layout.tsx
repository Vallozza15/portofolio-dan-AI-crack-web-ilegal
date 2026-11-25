import type { Metadata } from "next";
import { CtfShell } from "@/components/ctf/shell";
import { getProviderStatuses } from "@/lib/ctf/ai";
import { isAuthenticated, isAuthEnabled } from "@/lib/ctf/auth";
import { getSettings } from "@/lib/ctf/store";

export const metadata: Metadata = {
  title: {
    default: "CTF Intelligence — AI Cybersecurity Solver",
    template: "%s — CTF Intelligence",
  },
  description:
    "Platform laboratorium CTF berbasis AI: analisis file, kriptografi, forensik, steganografi, web, reverse engineering, binary, dan OSINT dengan bukti yang dapat diverifikasi.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  ollama: "Ollama",
  compatible: "Compatible",
  local: "Local Analyst",
};

export default async function CtfLayout({ children }: { children: React.ReactNode }) {
  const [authenticated, settings, statuses] = await Promise.all([
    isAuthenticated(),
    getSettings(),
    getProviderStatuses(),
  ]);

  const authEnabled = isAuthEnabled();
  if (authEnabled && !authenticated) {
    return <div className="ctf min-h-screen">{children}</div>;
  }

  const active =
    statuses.find((status) => status.id === settings.ai.defaultProvider && status.configured) ||
    statuses.find((status) => status.id !== "local" && status.configured);

  return (
    <div className="ctf">
      <CtfShell
        authEnabled={authEnabled}
        providerLabel={active ? PROVIDER_LABELS[active.id] || active.label : "Local Analyst"}
        providerConfigured={Boolean(active)}
        sandboxEnabled={settings.system.sandboxEnabled}
        hostToolsEnabled={settings.system.hostToolsEnabled}
      >
        {children}
      </CtfShell>
    </div>
  );
}
