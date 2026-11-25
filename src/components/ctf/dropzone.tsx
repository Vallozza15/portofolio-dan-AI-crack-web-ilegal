"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, UploadCloud } from "lucide-react";
import { formatBytes, cn } from "@/lib/ctf/format";
import type { StoredFile } from "@/lib/ctf/types";

export function Dropzone({
  challengeId,
  maxUploadMb = 25,
  onUploaded,
  compact,
}: {
  challengeId?: string;
  maxUploadMb?: number;
  onUploaded: (file: StoredFile) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const upload = (file: File) => {
    setError("");
    setSuccess("");
    if (file.size > maxUploadMb * 1024 * 1024) {
      setError(`File ${formatBytes(file.size)} melebihi batas ${maxUploadMb} MB.`);
      return;
    }
    setBusy(true);
    setProgress(0);
    const form = new FormData();
    form.append("file", file);
    if (challengeId) form.append("challengeId", challengeId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/ctf/files");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      try {
        const payload = JSON.parse(xhr.responseText) as { file?: StoredFile; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && payload.file) {
          setSuccess(`${payload.file.name} dianalisis.`);
          onUploaded(payload.file);
          if (inputRef.current) inputRef.current.value = "";
        } else {
          setError(payload.error || `Upload gagal (HTTP ${xhr.status}).`);
        }
      } catch {
        setError(`Upload gagal (HTTP ${xhr.status}).`);
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setError("Koneksi upload gagal.");
    };
    xhr.send(form);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !busy) inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (busy) return;
          const file = event.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center transition",
          compact ? "py-5" : "py-8",
          dragging
            ? "border-[var(--ctf-green)] bg-[rgba(6,78,59,0.22)]"
            : "border-[var(--ctf-line-strong)] bg-[rgba(3,12,21,0.35)] hover:border-[rgba(52,211,153,0.5)]",
          busy && "pointer-events-none opacity-80",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ctf-line)] bg-[rgba(14,33,51,0.7)] text-[var(--ctf-green)]">
          {busy ? <Loader2 size={17} className="animate-spin" /> : dragging ? <FileUp size={17} /> : <UploadCloud size={17} />}
        </div>
        <p className="text-[12px] font-medium text-[#d1fae5]">
          {busy ? `Mengunggah… ${progress}%` : "Drop artefak di sini atau klik untuk memilih"}
        </p>
        <p className="mt-1 max-w-md text-[10.5px] leading-relaxed text-[var(--ctf-muted)]">
          Gambar, audio, video, PDF, teks/log, PCAP, arsip, ELF/EXE/DLL, source code, BIN/DAT · maks {maxUploadMb} MB.
          File tidak akan dieksekusi.
        </p>
        {busy && (
          <div className="mt-3 h-1 w-40 overflow-hidden rounded-full bg-[rgba(8,19,31,0.9)]">
            <div className="h-full bg-[var(--ctf-green)] transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-[11px] text-[#fda4af]">{error}</p>}
      {success && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#6ee7b7]">
          <CheckCircle2 size={13} /> {success}
        </p>
      )}
    </div>
  );
}
