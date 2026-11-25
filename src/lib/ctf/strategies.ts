import type { TerminalFile } from "./terminal";

/**
 * Deterministic fallback strategies for the autonomous agent. They are only
 * used when the LLM cannot propose a new plan, so the solver can keep trying
 * genuinely different operations instead of repeating the same commands.
 */
export function buildRetryCommands(
  cycle: number,
  files: TerminalFile[],
  availableTools: string[],
): string[] {
  const has = (name: string) => availableTools.includes(name);
  const target = files.length
    ? files.map((file) => shellQuote(file.target)).join(" ")
    : "/analysis/*";
  const n = cycle % 12;
  const commands: string[] = [];

  if (n === 0) commands.push(`file ${target}; sha256sum ${target}`);
  if (n === 1 || !has("strings")) {
    commands.push(`strings -a -n ${6 + (cycle % 9)} ${target} | grep -aEi 'flag|ctf|secret|password|passwd|key|token' | head -n 80`);
  }
  if (n === 2) {
    commands.push(`grep -aEro '[A-Za-z0-9_]{2,24}\\{[^}]{1,200}\\}' ${target} 2>/dev/null | head -n 80`);
  }
  if (n === 3 && has("exiftool")) {
    commands.push(`exiftool -a -u -G1 ${target} 2>/dev/null | head -n 150`);
  }
  if (n === 4 && has("binwalk")) {
    commands.push(`binwalk ${target} 2>/dev/null | head -n 80`);
  }
  if (n === 5 && has("zsteg")) {
    commands.push(`zsteg -a ${files[0]?.target ? shellQuote(files[0].target) : "/analysis/*.png"} 2>/dev/null | head -n 100`);
  }
  if (n === 6) {
    commands.push(`for f in ${target}; do echo "== $f"; xxd -l ${128 + (cycle % 8) * 64} "$f" | head -n 24; done`);
  }
  if (n === 7) {
    commands.push(`python3 - <<'PY'
import base64, pathlib, re
for p in pathlib.Path('/analysis').iterdir():
    if not p.is_file() or p.name == 'MANIFEST.txt':
        continue
    raw = p.read_bytes()
    for blob in re.findall(rb'[A-Za-z0-9+/=]{16,}', raw):
        try:
            text = base64.b64decode(blob, validate=True).decode('utf-8', 'ignore')
        except Exception:
            continue
        if 'flag{' in text or 'CTF{' in text:
            print(p.name, text[:300])
PY`);
  }
  if (n === 8) {
    commands.push(`find /analysis -maxdepth 3 -type f -printf '%p %s bytes\\n' | head -n 60; echo '--- readable tails ---'; for f in ${target}; do echo "== $f"; tail -c 256 "$f" | strings -n 4 | head -n 12; done`);
  }
  if (n === 9 && has("pngcheck")) {
    commands.push(`pngcheck -v ${files[0]?.target ? shellQuote(files[0].target) : "/analysis/*.png"} 2>/dev/null | head -n 100`);
  }
  if (n === 10) {
    commands.push(`python3 - <<'PY'
import pathlib, re
for p in pathlib.Path('/analysis').iterdir():
    if not p.is_file() or p.name == 'MANIFEST.txt':
        continue
    raw = p.read_bytes().decode('latin1', 'ignore')
    for match in re.finditer(r'[A-Za-z0-9_]{2,24}\\{[^}]{1,200}\\}', raw):
        print(p.name, repr(match.group(0)))
PY`);
  }
  if (n === 11) {
    commands.push(`ls -laR /analysis | head -n 100; echo '--- manifest ---'; cat /analysis/MANIFEST.txt`);
  }

  if (!commands.length) {
    commands.push(`strings -a -n 6 ${target} | head -n 100`);
  }
  return commands.slice(0, 4);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
