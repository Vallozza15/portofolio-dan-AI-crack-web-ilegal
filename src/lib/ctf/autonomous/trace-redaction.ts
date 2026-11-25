/**
 * Terminal traces are streamed to the chat UI. They must never expose user
 * credentials, private keys, or tokens that happen to appear in a command or
 * in program output.
 */
export function redactTraceText(value: string | undefined, maxLength = 2000): string {
  if (!value) return "";
  return value
    .replace(/-----BEGIN[^-]*-----[\s\S]*?-----END[^-]*-----/g, "[PRIVATE KEY REDACTED]")
    .replace(/(password|passphrase|private\s*key|token|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/sshpass\s+-f\s+\S+/gi, "sshpass -f [REDACTED]")
    .replace(/(Authorization:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(Cookie:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .slice(0, maxLength);
}
