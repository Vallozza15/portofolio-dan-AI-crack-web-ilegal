"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  FileText,
  History,
  Loader2,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  User,
} from "lucide-react";
import { Badge, CopyButton, ErrorBanner, Field, Panel, StatusBadge } from "./ui";
import { Markdown } from "./markdown";
import { KaliTerminal } from "./kali-terminal";
import { WsTerminal } from "./ws-terminal";
import { CATEGORY_LABELS, cn, formatBytes, formatDateTime } from "@/lib/ctf/format";
import type {
  Challenge,
  Evidence,
  Message,
  ProviderId,
  PublicProviderConfig,
  Session,
  SessionMode,
  StoredFile,
  VerificationStatus,
} from "@/lib/ctf/types";

interface SessionSummary extends Session {
  messageCount?: number;
  challengeTitle?: string;
}

const MODE_LABELS: Record<SessionMode, string> = {
  learning: "Learning",
  expert: "Expert",
  hint: "Hint",
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  ollama: "Ollama",
  compatible: "OpenAI-compatible",
  local: "Local Analyst",
};

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return [hours ? `${hours}j` : "", minutes ? `${minutes}m` : "", `${seconds}s`]
    .filter(Boolean)
    .join(" ");
}

interface AgentTraceStep {
  id: string;
  commandId?: string;
  phase?: string;
  command: string;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  output?: string;
  status?: string;
  exitCode?: number | null;
  durationMs?: number;
  artifacts?: Array<{ path: string; size: number }>;
}

interface AgentPlan {
  source: string;
  reason?: string;
  commands: string[];
}

interface ExecutionPlanView {
  category: string;
  strategy: string;
  environment: string;
  operation: string;
}

type ExecutionStepState =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "VERIFYING"
  | "WAITING_FOR_INPUT";

interface ExecutionStepView {
  id: string;
  index: number;
  title: string;
  objective: string;
  reason?: string;
  expected?: string;
  command: string;
  environment: string;
  status: ExecutionStepState;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  output?: string;
  interpretation?: string;
  result?: string;
  nextAction?: string;
  exitCode?: number | null;
  durationMs?: number;
  artifacts?: Array<{ path: string; size: number }>;
}

function stepBadgeTone(status: ExecutionStepState): "green" | "rose" | "amber" | "violet" {
  if (status === "COMPLETED") return "green";
  if (status === "FAILED") return "rose";
  if (status === "RUNNING" || status === "VERIFYING") return "violet";
  return "amber";
}

interface AnswerVerificationView {
  classification: "CONFIRMED" | "HIGH CONFIDENCE" | "PROBABLE" | "UNVERIFIED" | "REJECTED";
  confirmed: boolean;
  reasons: string[];
  evidence: string[];
}

interface ReasoningSummary {
  requestId?: string;
  intent?: string;
  confidence?: string;
  confidenceScore?: number;
  hypotheses?: Array<{ id: string; description: string; status: string; confidence: number }>;
  repetition?: string;
  note?: string;
}

function localMessage(role: Message["role"], content: string, sessionId: string): Message {
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sessionId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function CtfChat({
  challenges,
  files,
  sessions: initialSessions,
  providers,
  defaultMode,
  defaultLanguage,
  defaultProvider,
  maxUploadMb,
  initialChallengeId,
}: {
  challenges: Challenge[];
  files: StoredFile[];
  sessions: SessionSummary[];
  providers: PublicProviderConfig[];
  defaultMode: SessionMode;
  defaultLanguage: "id" | "en";
  defaultProvider: ProviderId;
  maxUploadMb: number;
  initialChallengeId?: string;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<SessionMode>(defaultMode);
  const [language, setLanguage] = useState<"id" | "en">(defaultLanguage);
  const [provider, setProvider] = useState<ProviderId>(defaultProvider);
  const [challengeId, setChallengeId] = useState(initialChallengeId || "");
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [foundFlag, setFoundFlag] = useState<string | null>(null);
  const [answerVerification, setAnswerVerification] = useState<AnswerVerificationView | null>(null);
  const [agentMode, setAgentMode] = useState(false);
  const [confirmNetwork, setConfirmNetwork] = useState(false);
  const [agentPlan, setAgentPlan] = useState<AgentPlan | null>(null);
  const [agentTrace, setAgentTrace] = useState<AgentTraceStep[]>([]);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlanView | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStepView[]>([]);
  const [agentStats, setAgentStats] = useState<{
    elapsedMs: number;
    attempts: number;
    cycles: number;
    maxAttempts: number;
  } | null>(null);
  const [reasoningSummary, setReasoningSummary] = useState<ReasoningSummary | null>(null);
  const [showInternal, setShowInternal] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const challenge = challenges.find((item) => item.id === challengeId);
  const availableFiles = files.filter((file) => !challengeId || file.challengeId === challengeId);
  const selectedFiles = files.filter((file) => selectedFileIds.includes(file.id));

  const providerOptions: Array<{ id: ProviderId; label: string; available: boolean }> = [
    { id: "local", label: "Local Analyst (deterministik)", available: true },
    ...providers
      .filter((item) => item.id !== "local")
      .map((item) => ({
        id: item.id,
        label: `${PROVIDER_LABELS[item.id]}${item.available ? "" : " — belum siap"}`,
        available: item.available,
      })),
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const refreshSessions = async () => {
    try {
      const response = await fetch("/api/ctf/sessions");
      if (!response.ok) return;
      const payload = (await response.json()) as { sessions: SessionSummary[] };
      setSessions(payload.sessions);
    } catch {
      // Non-critical.
    }
  };

  const loadSession = async (id: string) => {
    if (!id) {
      setSession(null);
      setMessages([]);
      setEvidence([]);
      setFoundFlag(null);
      setAnswerVerification(null);
      setExecutionPlan(null);
      setExecutionSteps([]);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/ctf/sessions/${id}`);
      const payload = (await response.json()) as {
        session?: Session;
        messages?: Message[];
        evidence?: Evidence[];
        error?: string;
      };
      if (!response.ok || !payload.session) throw new Error(payload.error || "Gagal memuat sesi.");
      setSession(payload.session);
      setMessages(payload.messages || []);
      setEvidence(payload.evidence || []);
      setMode(payload.session.mode);
      setLanguage(payload.session.language);
      setProvider(payload.session.provider);
      setChallengeId(payload.session.challengeId || "");
      setSelectedFileIds([]);
      setFoundFlag(null);
      setAnswerVerification(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const newSession = () => {
    setSession(null);
    setMessages([]);
    setEvidence([]);
    setSelectedFileIds([]);
    setNotes([]);
    setFoundFlag(null);
    setAnswerVerification(null);
    setAgentPlan(null);
    setAgentTrace([]);
    setExecutionPlan(null);
    setExecutionSteps([]);
    setAgentStats(null);
    setReasoningSummary(null);
    setError("");
  };

  const ensureSession = async (text: string): Promise<Session> => {
    if (session) return session;
    const response = await fetch("/api/ctf/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: text.slice(0, 90) || "Sesi investigasi baru",
        mode,
        language,
        provider,
        model: "auto",
        challengeId: challengeId || undefined,
      }),
    });
    const payload = (await response.json()) as { session?: Session; error?: string };
    if (!response.ok || !payload.session) throw new Error(payload.error || "Gagal membuat sesi.");
    setSession(payload.session);
    return payload.session;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError("");
    setNotes([]);
    setFoundFlag(null);
    setAnswerVerification(null);
    setBusy(true);
    setInput("");
    setAgentPlan(null);
    setAgentTrace([]);
    setExecutionPlan(null);
    setExecutionSteps([]);
    setAgentStats(null);
    setReasoningSummary(null);
    let activeSession = session;
    try {
      activeSession = await ensureSession(text);
      const userMessage = localMessage("user", text, activeSession.id);
      const assistantMessage: Message = {
        ...localMessage("assistant", "", activeSession.id),
        id: "streaming-assistant",
        provider,
        model: "streaming",
        mode,
      };
      setMessages((previous) => [...previous, userMessage, assistantMessage]);

      const controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch(agentMode ? "/api/ctf/agent" : "/api/ctf/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSession.id,
          message: text,
          fileIds: selectedFileIds,
          mode,
          language,
          provider,
          confirmNetworkAction: confirmNetwork,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `Chat gagal (HTTP ${response.status}).`);
      }
      if (!response.body) throw new Error("Response chat tidak memiliki body.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedText = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.indexOf("\n");
        while (index >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          index = buffer.indexOf("\n");
          if (!line) continue;
          let event: {
            type?: string;
            text?: string;
            message?: string;
            status?: VerificationStatus;
            provider?: ProviderId;
            model?: string;
            messageId?: string;
            state?: string;
            container?: string;
            network?: boolean;
            files?: Array<{ id: string; name: string; target: string; size: number }>;
            source?: string;
            flag?: string;
            verification?: AnswerVerificationView;
            reason?: string;
            commands?: string[];
            command?: string;
            commandId?: string;
            stepId?: string;
            step?: ExecutionStepView;
            category?: string;
            strategy?: string;
            environment?: string;
            operation?: string;
            phase?: string;
            cwd?: string;
            stdout?: string;
            stderr?: string;
            output?: string;
            execStatus?: "ok" | "error" | "blocked";
            exitCode?: number | null;
            durationMs?: number;
            artifacts?: Array<{ path: string; size: number }>;
            elapsedMs?: number;
            attempts?: number;
            cycles?: number;
            maxAttempts?: number;
            requestId?: string;
            conversationId?: string;
            intent?: string;
            confidence?: string;
            confidenceScore?: number;
            hypotheses?: Array<{ id: string; description: string; status: string; confidence: number }>;
            repetition?: string;
          };
          try {
            event = JSON.parse(line) as typeof event;
          } catch {
            continue;
          }
          if (event.type === "delta" && event.text) {
            receivedText = true;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === "streaming-assistant"
                  ? { ...message, content: message.content + event.text }
                  : message,
              ),
            );
          }
          if (event.type === "meta") {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === "streaming-assistant"
                  ? { ...message, provider: event.provider || provider, model: event.model || "streaming" }
                  : message,
              ),
            );
          }
          if (event.type === "terminal" && event.container) {
            setNotes((previous) => [
              ...previous,
              `Container Kali ${event.container} siap (${event.files?.length ?? 0} file, jaringan ${event.network ? "bridge" : "none"}).`,
            ]);
          }
          if (event.type === "plan" && Array.isArray(event.commands)) {
            setAgentPlan({
              source: event.source || "deterministik",
              reason: event.reason,
              commands: event.commands,
            });
          }
          if (event.type === "execution-plan" && event.category) {
            setExecutionPlan({
              category: event.category,
              strategy: event.strategy || "",
              environment: event.environment || "local-kali",
              operation: event.operation || "",
            });
          }
          if (event.type === "step" && event.step?.id) {
            const incoming = event.step;
            setExecutionSteps((previous) => {
              const position = previous.findIndex((item) => item.id === incoming.id);
              if (position < 0) return [...previous, incoming];
              const next = [...previous];
              next[position] = { ...next[position], ...incoming };
              return next;
            });
          }
          if (event.type === "reasoning") {
            setReasoningSummary({
              requestId: event.requestId,
              intent: event.intent,
              confidence: event.confidence,
              confidenceScore: event.confidenceScore,
              hypotheses: event.hypotheses,
              repetition: event.repetition,
              note: event.message,
            });
          }
          if (event.type === "command" && event.command) {
            setAgentTrace((previous) => [
              ...previous.slice(-40),
              {
                id: event.commandId || `step-${Date.now()}-${previous.length}`,
                commandId: event.commandId,
                phase: event.phase,
                command: event.command as string,
              },
            ]);
          }
          if (event.type === "output" && event.command) {
            setAgentTrace((previous) => {
              const next = [...previous];
              for (let index = next.length - 1; index >= 0; index -= 1) {
                if (next[index].output === undefined) {
                  next[index] = {
                    ...next[index],
                    cwd: event.cwd,
                    stdout: event.stdout,
                    stderr: event.stderr,
                    output: event.output || "(tidak ada output)",
                    status: event.execStatus,
                    exitCode: event.exitCode,
                    durationMs: event.durationMs,
                    artifacts: event.artifacts,
                  };
                  break;
                }
              }
              return next;
            });
            if (event.stepId) {
              setExecutionSteps((previous) =>
                previous.map((item) =>
                  item.id === event.stepId
                    ? {
                        ...item,
                        cwd: event.cwd ?? item.cwd,
                        stdout: event.stdout ?? item.stdout,
                        stderr: event.stderr ?? item.stderr,
                        output: event.output ?? item.output,
                        artifacts: event.artifacts ?? item.artifacts,
                      }
                    : item,
                ),
              );
            }
          }
          if (event.type === "note" && event.message) {
            setNotes((previous) => [...previous, event.message as string]);
          }
          if (event.type === "verification" && event.verification) {
            setAnswerVerification(event.verification as AnswerVerificationView);
          }
          if (event.type === "flag" && event.flag) {
            setFoundFlag(event.flag as string);
          }
          if (event.type === "done" && event.status) {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === "streaming-assistant" ? { ...message, status: event.status } : message,
              ),
            );
          }
          if (event.type === "saved") {
            if (event.requestId || event.confidence || event.intent) {
              setReasoningSummary((previous) => ({
                ...previous,
                requestId: event.requestId || previous?.requestId,
                intent: event.intent || previous?.intent,
                confidence: event.confidence || previous?.confidence,
                confidenceScore: event.confidenceScore ?? previous?.confidenceScore,
              }));
            }
            if (typeof event.elapsedMs === "number") {
              setAgentStats({
                elapsedMs: event.elapsedMs,
                attempts: event.attempts || 0,
                cycles: event.cycles || 0,
                maxAttempts: event.maxAttempts || 0,
              });
            }
            setMessages((previous) =>
              previous.map((message) =>
                message.id === "streaming-assistant"
                  ? {
                      ...message,
                      id: event.messageId || message.id,
                      status: event.status || message.status,
                      provider: event.provider || message.provider,
                      model: event.model || message.model,
                    }
                  : message,
              ),
            );
            if (activeSession) {
              setSession({ ...activeSession, status: event.status || activeSession.status });
            }
          }
          if (event.type === "error" && event.message) {
            setError(event.message);
          }
        }
      }
      if (!receivedText) {
        setMessages((previous) => previous.filter((message) => message.id !== "streaming-assistant"));
      }
      if (activeSession) {
        const refreshed = await fetch(`/api/ctf/sessions/${activeSession.id}`);
        if (refreshed.ok) {
          const payload = (await refreshed.json()) as {
            session?: Session;
            messages?: Message[];
            evidence?: Evidence[];
          };
          if (payload.session) setSession(payload.session);
          if (payload.messages) setMessages(payload.messages);
          if (payload.evidence) setEvidence(payload.evidence);
        }
      }
      await refreshSessions();
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setNotes((previous) => [...previous, "Eksekusi otomatis dihentikan."]);
      } else {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
      setMessages((previous) => previous.filter((message) => message.id !== "streaming-assistant" || message.content));
    } finally {
      abortRef.current = null;
      setConfirmNetwork(false);
      setBusy(false);
      textareaRef.current?.focus();
    }
  };

  const stop = async () => {
    abortRef.current?.abort();
    if (session?.id) {
      try {
        await fetch("/api/ctf/remote/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, disconnect: true }),
        });
      } catch {
        // Best effort: client abort already stops the stream.
      }
    }
    setNotes((previous) => [...previous, "Eksekusi otomatis dihentikan."]);
    setBusy(false);
  };

  const deleteSession = async () => {
    if (!session) return;
    if (!window.confirm("Hapus sesi ini beserta pesan dan buktinya?")) return;
    setBusy(true);
    try {
      await fetch(`/api/ctf/sessions/${session.id}`, { method: "DELETE" });
      newSession();
      await refreshSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const activeChallenge = challenges.find(
    (item) => item.id === (session?.challengeId || challengeId),
  );
  const resultPlatform = activeChallenge?.source?.trim() || "—";
  const resultMethod =
    executionSteps
      .filter((step) => step.command && step.command !== "(verifikasi internal)")
      .map((step) => step.command?.trim())
      .filter((value): value is string => Boolean(value))
      .slice(0, 3)
      .join("; ") || "—";
  const resultExplanation =
    executionSteps.find((step) => step.interpretation?.trim())?.interpretation?.trim() ||
    answerVerification?.evidence.find((item) => item.trim())?.trim() ||
    notes.find((item) => item.trim()) ||
    "—";

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        noPadding
        className="flex min-h-[620px] flex-col overflow-hidden"
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span>AI Investigation Console</span>
            {session && <StatusBadge status={session.status} />}
          </div>
        }
        subtitle="Streaming jawaban dengan konteks bukti lokal. Local Analyst digunakan jika provider tidak siap."
        actions={
          <>
            <select
              className="ctf-select max-w-[220px]"
              value={session?.id || ""}
              onChange={(event) => loadSession(event.target.value)}
              aria-label="Riwayat sesi"
            >
              <option value="">+ Sesi baru</option>
              {sessions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title.slice(0, 50)} {item.messageCount ? `(${item.messageCount})` : ""}
                </option>
              ))}
            </select>
            <button type="button" className="ctf-btn ctf-btn-sm" onClick={newSession} disabled={busy}>
              <Plus size={12} /> Baru
            </button>
            {session && (
              <button type="button" className="ctf-btn ctf-btn-sm ctf-btn-danger" onClick={deleteSession} disabled={busy}>
                <Trash2 size={12} />
              </button>
            )}
          </>
        }
      >
        <div className="border-b border-[var(--ctf-line)] px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Challenge">
              <select
                className="ctf-select"
                value={challengeId}
                onChange={(event) => {
                  setChallengeId(event.target.value);
                  setSelectedFileIds([]);
                  if (session) newSession();
                }}
              >
                <option value="">Ad-hoc / tanpa challenge</option>
                {challenges.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </Field>
            <Field label="Mode">
              <select className="ctf-select" value={mode} onChange={(event) => setMode(event.target.value as SessionMode)}>
                {Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Provider">
              <select className="ctf-select" value={provider} onChange={(event) => setProvider(event.target.value as ProviderId)}>
                {providerOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
            <Field label="Bahasa">
              <select className="ctf-select" value={language} onChange={(event) => setLanguage(event.target.value as "id" | "en")}>
                <option value="id">Indonesia</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>
          <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-[rgba(52,211,153,0.2)] bg-[rgba(6,78,59,0.12)] px-3 py-2">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--ctf-green)]"
              checked={agentMode}
              onChange={(event) => setAgentMode(event.target.checked)}
              disabled={busy}
            />
            <span className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-[#d1fae5]">
                <Terminal size={12} className="text-[var(--ctf-green)]" /> Kali Agent — eksekusi nyata
              </span>
              <span className="mt-0.5 block text-[9.5px] leading-relaxed text-[var(--ctf-muted)]">
                AI menyusun rencana perintah, menjalankannya di container Kali terisolasi, membaca output asli,
                lalu menyusun jawaban 8 bagian. Fallback deterministik jika model tidak bisa merencanakan.
              </span>
            </span>
          </label>
        </div>

        <div className="ctf-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4" style={{ maxHeight: "calc(100vh - 360px)", minHeight: 340 }}>
          {!messages.length && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--ctf-line)] bg-[linear-gradient(145deg,rgba(6,78,59,0.2),rgba(8,51,68,0.08))] p-5">
                <div className="flex items-center gap-2 text-[var(--ctf-green)]">
                  <Sparkles size={16} />
                  <span className="ctf-label text-[var(--ctf-green)]">AI CTF SOLVER</span>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-white">Mulai dari bukti, bukan tebakan.</h3>
                <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-[var(--ctf-muted)]">
                  Pilih challenge atau unggah file di Workspace, lalu minta analisis. Jawaban wajib mengikuti 8 bagian:
                  Identifikasi, Analisis Awal, Tools, Langkah, Proses, Hasil, Pembelajaran, Status Verifikasi.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    "Analisis challenge ini dari awal dan tentukan kategori paling mungkin.",
                    "Periksa file yang saya pilih dan cari flag berdasarkan bukti.",
                    "Beri saya petunjuk bertahap tanpa membocorkan flag.",
                    "Tool apa yang benar-benar perlu dijalankan berikutnya?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.5)] px-3 py-2 text-left text-[10.5px] leading-relaxed text-[var(--ctf-muted)] transition hover:border-[rgba(52,211,153,0.4)] hover:text-[#d1fae5]"
                      onClick={() => {
                        setInput(prompt);
                        textareaRef.current?.focus();
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--ctf-line)] p-3">
                  <div className="ctf-label">Konteks</div>
                  <div className="mt-1 text-[11.5px] text-[#d1fae5]">
                    {challenge ? challenge.title : "Ad-hoc"}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--ctf-dim)]">
                    {challenge ? CATEGORY_LABELS[challenge.category] : `${availableFiles.length} file tersedia`}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--ctf-line)] p-3">
                  <div className="ctf-label">Lampiran terpilih</div>
                  <div className="mt-1 text-[11.5px] text-[#d1fae5]">{selectedFiles.length} file</div>
                  <div className="mt-1 text-[10px] text-[var(--ctf-dim)]">Maks {maxUploadMb} MB per file</div>
                </div>
                <div className="rounded-lg border border-[var(--ctf-line)] p-3">
                  <div className="ctf-label">Mode</div>
                  <div className="mt-1 text-[11.5px] text-[#d1fae5]">{MODE_LABELS[mode]}</div>
                  <div className="mt-1 text-[10px] text-[var(--ctf-dim)]">Hint menyembunyikan flag final</div>
                </div>
              </div>
            </div>
          )}

          {(executionPlan || executionSteps.length > 0 || agentPlan || agentTrace.length > 0) && (
            <div className="rounded-xl border border-[rgba(52,211,153,0.22)] bg-[rgba(2,8,13,0.65)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Terminal size={13} className="text-[var(--ctf-green)]" />
                <span className="ctf-label text-[var(--ctf-green)]">
                  {executionSteps.length > 0 ? "Tracker eksekusi bertahap" : "Jejak eksekusi Kali"}
                </span>
                {executionPlan && <Badge tone="violet">{executionPlan.category}</Badge>}
                {executionPlan && (
                  <Badge tone="green">
                    {executionPlan.environment === "local-kali" ? "Kali lokal" : "CTF remote"}
                  </Badge>
                )}
                {agentPlan && <Badge tone="violet">{agentPlan.source}</Badge>}
                <span className="text-[9.5px] text-[var(--ctf-dim)]">
                  {executionSteps.length > 0
                    ? `${executionSteps.length} langkah`
                    : `${agentTrace.length} perintah dijalankan di container`}
                </span>
                {agentStats && (
                  <Badge tone="green">
                    {formatElapsed(agentStats.elapsedMs)} · {agentStats.attempts} percobaan · {agentStats.cycles} siklus
                  </Badge>
                )}
              </div>
              {executionPlan && (
                <div className="mt-2 rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.45)] px-2 py-1.5">
                  <p className="text-[10px] text-[#d1fae5]">
                    <span className="text-[var(--ctf-dim)]">Strategi: </span>
                    {executionPlan.strategy || "—"}
                  </p>
                  <p className="mt-0.5 text-[9px] text-[var(--ctf-dim)]">
                    Operasi: {executionPlan.operation || "—"}
                  </p>
                </div>
              )}
              {executionSteps.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {executionSteps.map((step) => (
                    <details
                      key={step.id}
                      className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.45)] px-2 py-1.5"
                    >
                      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[10px] text-[#d1fae5]">
                        <span className="font-mono text-[var(--ctf-cyan)]">#{step.index}</span>
                        <span className="font-medium">{step.title}</span>
                        <Badge tone={stepBadgeTone(step.status)}>{step.status}</Badge>
                        <span className="text-[8.5px] text-[var(--ctf-dim)]">
                          {step.environment === "local-kali" ? "Kali lokal" : "CTF remote"}
                        </span>
                        <span className="text-[8.5px] text-[var(--ctf-dim)]">exit {step.exitCode ?? "—"}</span>
                        {typeof step.durationMs === "number" && (
                          <span className="text-[8.5px] text-[var(--ctf-dim)]">{step.durationMs} ms</span>
                        )}
                      </summary>
                      <div className="mt-1.5 space-y-1 text-[9.5px] leading-relaxed text-[var(--ctf-muted)]">
                        <p>
                          <span className="text-[#d1fae5]">Objective: </span>
                          {step.objective || "—"}
                        </p>
                        <p>
                          <span className="text-[#d1fae5]">Mengapa perintah ini: </span>
                          {step.reason || "—"}
                        </p>
                        <p>
                          <span className="text-[#d1fae5]">Hasil diharapkan: </span>
                          {step.expected || "—"}
                        </p>
                        <p className="break-all">
                          <span className="text-[#d1fae5]">Perintah Kali: </span>
                          <code className="rounded bg-[rgba(3,12,21,0.8)] px-1 py-0.5 text-[var(--ctf-cyan)]">
                            {step.command}
                          </code>
                        </p>
                        <p>
                          <span className="text-[#d1fae5]">cwd: </span>
                          <code>{step.cwd || "—"}</code>
                        </p>
                        <pre className="ctf-scroll max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-[#02080d] p-2 font-mono text-[9.5px] text-[#c7d2d0]">
                          {step.stdout || step.output || "menunggu output…"}
                          {step.stderr ? `\n[stderr] ${step.stderr}` : ""}
                        </pre>
                        <p>
                          <span className="text-[#d1fae5]">Interpretasi: </span>
                          {step.interpretation || "menunggu hasil eksekusi…"}
                        </p>
                        <p>
                          <span className="text-[#d1fae5]">Hasil: </span>
                          {step.result || "—"}
                        </p>
                        <p>
                          <span className="text-[#d1fae5]">Next action: </span>
                          {step.nextAction || "—"}
                        </p>
                        {Boolean(step.artifacts?.length) && (
                          <div className="flex flex-wrap gap-1">
                            {step.artifacts!.map((artifact) => (
                              <a
                                key={artifact.path}
                                className="rounded border border-[rgba(52,211,153,0.3)] px-1.5 py-0.5 text-[9px] text-[#7df9c1]"
                                href={`/api/ctf/terminal/download?sessionId=${encodeURIComponent(session?.id || "")}&path=${encodeURIComponent(artifact.path)}`}
                                download={artifact.path.split("/").pop()}
                              >
                                ↓ {artifact.path}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <>
                  {agentPlan && (
                    <div className="mt-2">
                      {agentPlan.reason && (
                        <p className="mb-1.5 text-[9.5px] italic text-[var(--ctf-muted)]">
                          Alasan: {agentPlan.reason}
                        </p>
                      )}
                      <p className="mb-1 text-[9px] text-[var(--ctf-dim)]">
                        Perintah usulan — belum tentu dieksekusi; lihat langkah untuk bukti eksekusi.
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {agentPlan.commands.map((item, index) => (
                          <code
                            key={`${index}-${item}`}
                            className="rounded border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.6)] px-1.5 py-0.5 text-[9px] text-[var(--ctf-muted)]"
                          >
                            {item}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-2 space-y-1.5">
                    {agentTrace.map((step) => (
                      <details
                        key={step.id}
                        className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.45)] px-2 py-1.5"
                      >
                        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[10px] text-[#d1fae5]">
                          <Terminal size={10} className="shrink-0 text-[var(--ctf-cyan)]" />
                          {step.phase && <Badge tone="violet">{step.phase}</Badge>}
                          <code className="min-w-0 flex-1 break-all">{step.command}</code>
                          {step.status && (
                            <Badge tone={step.status === "ok" ? "green" : "rose"}>{step.status}</Badge>
                          )}
                          <span className="text-[8.5px] text-[var(--ctf-dim)]">exit {step.exitCode ?? "—"}</span>
                          {typeof step.durationMs === "number" && (
                            <span className="text-[8.5px] text-[var(--ctf-dim)]">{step.durationMs} ms</span>
                          )}
                        </summary>
                        <pre className="ctf-scroll mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-[#02080d] p-2 font-mono text-[9.5px] leading-relaxed text-[#c7d2d0]">
                          {step.stdout || step.output || "menunggu output…"}
                          {step.stderr ? `\n[stderr] ${step.stderr}` : ""}
                        </pre>
                        {Boolean(step.artifacts?.length) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {step.artifacts!.map((artifact) => (
                              <a
                                key={artifact.path}
                                className="rounded border border-[rgba(52,211,153,0.3)] px-1.5 py-0.5 text-[9px] text-[#7df9c1]"
                                href={`/api/ctf/terminal/download?sessionId=${encodeURIComponent(session?.id || "")}&path=${encodeURIComponent(artifact.path)}`}
                                download={artifact.path.split("/").pop()}
                              >
                                ↓ {artifact.path}
                              </a>
                            ))}
                          </div>
                        )}
                      </details>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {showInternal && reasoningSummary && (
            <div className="rounded-xl border border-[rgba(34,211,238,0.2)] bg-[rgba(2,12,20,0.6)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles size={13} className="text-[var(--ctf-cyan)]" />
                <span className="ctf-label text-[var(--ctf-cyan)]">Penalaran adaptif (internal)</span>
                {reasoningSummary.intent && <Badge tone="violet">{reasoningSummary.intent}</Badge>}
                {reasoningSummary.confidence && (
                  <Badge tone={reasoningSummary.confidence === "CONFIRMED" ? "green" : "amber"}>
                    {reasoningSummary.confidence}
                    {typeof reasoningSummary.confidenceScore === "number"
                      ? ` · ${Math.round(reasoningSummary.confidenceScore * 100)}%`
                      : ""}
                  </Badge>
                )}
                {reasoningSummary.requestId && (
                  <span className="text-[8.5px] text-[var(--ctf-dim)]">
                    request {reasoningSummary.requestId}
                  </span>
                )}
              </div>
              {reasoningSummary.note && (
                <p className="mt-1.5 text-[10px] text-[var(--ctf-muted)]">{reasoningSummary.note}</p>
              )}
              {Boolean(reasoningSummary.hypotheses?.length) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {reasoningSummary.hypotheses!.map((item) => (
                    <span
                      key={item.id}
                      className="rounded border border-[var(--ctf-line)] px-1.5 py-0.5 text-[9px] text-[var(--ctf-muted)]"
                      title={item.description}
                    >
                      {item.id}: {item.status} · {Math.round(item.confidence * 100)}%
                    </span>
                  ))}
                </div>
              )}
              {reasoningSummary.repetition && (
                <p className="mt-1.5 text-[9px] text-[var(--ctf-dim)]">
                  Anti-pengulangan: {reasoningSummary.repetition}
                </p>
              )}
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={cn("flex gap-2.5", message.role === "user" ? "justify-end" : "justify-start")}>
              {message.role === "assistant" && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[rgba(52,211,153,0.3)] bg-[rgba(6,78,59,0.3)] text-[var(--ctf-green)]">
                  <Bot size={14} />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[min(860px,92%)] rounded-xl border px-3.5 py-3",
                  message.role === "user"
                    ? "border-[rgba(34,211,238,0.25)] bg-[rgba(8,51,68,0.32)]"
                    : "border-[var(--ctf-line)] bg-[rgba(3,12,21,0.55)]",
                )}
              >
                {message.role === "assistant" ? (
                  message.content ? (
                    <>
                      <Markdown content={message.content} />
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--ctf-line)] pt-2">
                        {message.status && <StatusBadge status={message.status} />}
                        {message.provider && <Badge tone="violet">{PROVIDER_LABELS[message.provider as ProviderId] || message.provider}</Badge>}
                        {message.model && message.model !== "streaming" && <Badge>{message.model}</Badge>}
                        <span className="text-[9.5px] text-[var(--ctf-dim)]">{formatDateTime(message.createdAt)}</span>
                        <CopyButton value={message.content} />
                      </div>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-[11.5px] text-[var(--ctf-muted)]">
                      <Loader2 size={14} className="animate-spin text-[var(--ctf-green)]" /> Menganalisis bukti…
                    </span>
                  )
                ) : (
                  <div className="flex items-start gap-2">
                    <User size={14} className="mt-0.5 shrink-0 text-[var(--ctf-cyan)]" />
                    <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#e6f7f4]">{message.content}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[var(--ctf-line)] p-3">
          {error && <div className="mb-2"><ErrorBanner message={error} /></div>}
          {(foundFlag || answerVerification) && (
            <div className="mb-2 rounded-lg border border-[rgba(52,211,153,0.28)] bg-[rgba(2,20,16,0.55)] px-3 py-2 text-[10.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ctf-label text-[var(--ctf-green)]">Hasil akhir</span>
                {answerVerification && (
                  <Badge tone={answerVerification.confirmed ? "green" : answerVerification.classification === "PROBABLE" ? "amber" : "rose"}>
                    {answerVerification.classification}
                  </Badge>
                )}
                {session?.status && <Badge tone="violet">{session.status}</Badge>}
              </div>
              <p className="mt-1 text-[9.5px] text-[var(--ctf-muted)]">
                Challenge: {activeChallenge?.title || session?.challengeId || challengeId || "—"}
              </p>
              <p className="mt-0.5 text-[9px] text-[var(--ctf-muted)]">Platform: {resultPlatform}</p>
              <p className="mt-0.5 break-all text-[9px] text-[var(--ctf-muted)]">Metode: {resultMethod}</p>
              <p className="mt-0.5 break-all text-[9px] text-[var(--ctf-muted)]">
                Penjelasan singkat: {resultExplanation}
              </p>
              {foundFlag && (
                <p className="mt-0.5 break-all text-[#7df9c1]">
                  Flag: {answerVerification?.confirmed ? "terverifikasi" : "kandidat belum terverifikasi"} <code>{foundFlag}</code>
                </p>
              )}
              <p className="mt-0.5 text-[9px] text-[var(--ctf-dim)]">
                {executionSteps.length} langkah · {executionSteps.filter((step) => step.command && step.command !== "(verifikasi internal)").length} perintah nyata · detail ada di tracker
              </p>
              {answerVerification?.reasons.length ? (
                <p className="mt-0.5 text-[9px] text-[var(--ctf-muted)]">
                  Verifikasi: {answerVerification.reasons.join("; ")}
                </p>
              ) : null}
            </div>
          )}
          {notes.length > 0 && (
            <div className="mb-2 rounded-lg border border-[rgba(251,191,36,0.28)] bg-[rgba(69,45,5,0.15)] px-3 py-2 text-[10.5px] text-[#fde68a]">
              {notes.join(" · ")}
            </div>
          )}
          <label className="mb-2 flex items-center gap-2 text-[10px] text-[var(--ctf-muted)]">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[var(--ctf-green)]"
              checked={confirmNetwork}
              onChange={(event) => setConfirmNetwork(event.target.checked)}
              disabled={busy}
            />
            Izinkan aksi jaringan untuk instance challenge milik saya (konfirmasi per pesan)
          </label>
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              className="ctf-textarea min-h-[52px] max-h-40 flex-1"
              rows={2}
              placeholder="Tulis pertanyaan, tempel ciphertext, atau minta analisis bukti… (Enter kirim, Shift+Enter baris baru)"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              disabled={busy}
            />
            <button type="button" className="ctf-btn ctf-btn-primary h-[52px] px-4" onClick={send} disabled={busy || !input.trim()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              <span className="hidden sm:inline">{busy ? "Menganalisis" : "Kirim"}</span>
            </button>
            {busy && (
              <button type="button" className="ctf-btn h-[52px] px-3" onClick={stop} title="Hentikan eksekusi otomatis">
                <Square size={14} />
                <span className="hidden sm:inline">Stop</span>
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9.5px] text-[var(--ctf-dim)]">
            <span className="inline-flex items-center gap-1.5"><ShieldAlert size={11} /> Tidak mengeksekusi binary yang diunggah.</span>
            <span>Provider gagal → fallback otomatis ke Local Analyst.</span>
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="Konteks Investigasi" subtitle="Hanya bukti yang dipilih yang dikirim ke model.">
          <div className="space-y-3">
            <Field label="Lampiran untuk model">
              <div className="ctf-scroll max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-2">
                {availableFiles.length ? (
                  availableFiles.slice(0, 80).map((file) => {
                    const checked = selectedFileIds.includes(file.id);
                    return (
                      <label key={file.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[10.5px] hover:bg-[rgba(14,33,51,0.6)]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setSelectedFileIds((previous) =>
                              event.target.checked
                                ? [...previous, file.id].slice(0, 20)
                                : previous.filter((id) => id !== file.id),
                            );
                          }}
                          className="accent-[var(--ctf-green)]"
                        />
                        <FileText size={11} className="shrink-0 text-[var(--ctf-cyan)]" />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <span className="shrink-0 text-[9px] text-[var(--ctf-dim)]">{formatBytes(file.size)}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className="px-1 py-2 text-[10.5px] text-[var(--ctf-dim)]">Belum ada file. Unggah di Workspace.</p>
                )}
              </div>
            </Field>
            {challenge && (
              <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
                <div className="ctf-label">Challenge aktif</div>
                <div className="mt-1 text-[12px] font-medium text-[#d1fae5]">{challenge.title}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone="violet">{CATEGORY_LABELS[challenge.category]}</Badge>
                  <Badge>{challenge.difficulty}</Badge>
                  <Badge tone="cyan">{challenge.flagFormat}</Badge>
                </div>
                <p className="mt-2 line-clamp-4 text-[10.5px] leading-relaxed text-[var(--ctf-muted)]">{challenge.description || "Tanpa deskripsi."}</p>
              </div>
            )}
            <div className="rounded-lg border border-[var(--ctf-line)] bg-[rgba(3,12,21,0.4)] p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <History size={12} className="text-[var(--ctf-green)]" />
                <span className="ctf-label">Bukti tersimpan</span>
              </div>
              {evidence.length ? (
                <div className="ctf-scroll max-h-48 space-y-2 overflow-y-auto">
                  {evidence.slice(0, 20).map((item) => (
                    <div key={item.id} className="border-b border-[var(--ctf-line)] pb-1.5 last:border-0">
                      <div className="text-[10.5px] font-medium text-[#d1fae5]">{item.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-[9.5px] leading-relaxed text-[var(--ctf-muted)]">{item.summary}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10.5px] text-[var(--ctf-dim)]">Bukti akan muncul setelah analisis pertama.</p>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Guardrail" noPadding>
          <div className="space-y-2 p-4 text-[10.5px] leading-relaxed text-[var(--ctf-muted)]">
            <p>• Flag tidak dikarang. Status VERIFIED hanya jika cocok dengan expected flag.</p>
            <p>• Tool yang disebut sebagai rekomendasi tidak diklaim sudah dijalankan.</p>
            <p>• Terminal Kali menjalankan perintah di container terisolasi, bukan di host.</p>
            <p>• API key provider tidak pernah dikirim ke browser.</p>
            <label className="flex cursor-pointer items-center gap-2 pt-1">
              <input
                type="checkbox"
                className="accent-[var(--ctf-cyan)]"
                checked={showInternal}
                onChange={(event) => setShowInternal(event.target.checked)}
              />
              <span>Tampilkan detail penalaran internal (debug)</span>
            </label>
          </div>
        </Panel>
      </div>
      </div>

      <div className="mt-4">
        <KaliTerminal
          sessionId={session?.id}
          fileIds={selectedFileIds.length ? selectedFileIds : availableFiles.map((file) => file.id)}
          onEnsureSession={ensureSession}
        />
        <div className="mt-4">
          <WsTerminal
            sessionId={session?.id}
            fileIds={selectedFileIds.length ? selectedFileIds : availableFiles.map((file) => file.id)}
            onEnsureSession={ensureSession}
          />
        </div>
      </div>
    </>
  );
}
