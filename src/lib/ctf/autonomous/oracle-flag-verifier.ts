/**
 * A flag may only be reported when a *successful* terminal command produced an
 * explicit server completion marker followed by that exact flag. Speculative
 * decodings (Base64/XOR/ROT13 brute force) can produce many flag-shaped
 * strings and are never sufficient evidence on their own.
 */

const SERVER_COMPLETION_RE =
  /(?:congratulations|congrat|well\s+done|you\s+(?:found|solved|recovered)|flag\s*(?:accepted|correct|valid|benar|diterima)|correct\s*flag|challenge\s*(?:completed|solved)|selamat[^.\n]*flag|berhasil[^.\n]*flag)/i;

export function extractServerVerifiedFlag(outputs: string[], candidates: string[]): string | undefined {
  const values = [...new Set(candidates.map((item) => item.trim()).filter(Boolean))];
  if (!values.length) return undefined;

  for (const output of outputs) {
    const marker = SERVER_COMPLETION_RE.exec(output);
    if (!marker) continue;
    const tail = output.slice(marker.index + marker[0].length);
    const verified = values.find((value) => tail.includes(value));
    if (verified) return verified;
  }
  return undefined;
}
