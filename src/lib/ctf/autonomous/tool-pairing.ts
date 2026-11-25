import { buildRetryCommands } from "../strategies";
import type { TerminalFile } from "../terminal";

/**
 * Pairs every Kali tool in the catalog with a concrete, read-only analysis
 * command. The adaptive engine picks from this list using the tools that were
 * actually discovered inside the container, so no tool is merely decorative.
 */
export interface ToolPairingContext {
  files: TerminalFile[];
  tools: string[];
  question: string;
  output?: string;
  cycle: number;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildPairedCommands(context: ToolPairingContext): string[] {
  const { files, tools, question, output = "", cycle } = context;
  const has = (name: string) => tools.includes(name);
  const targets = files.length
    ? files.map((file) => shellQuote(file.target)).join(" ")
    : "/analysis/*";
  const first = files[0]?.target ? shellQuote(files[0].target) : "/analysis/*";
  const names = files.map((file) => file.name).join(" ").toLowerCase();
  const text = `${question}\n${output}`;
  const commands: string[] = [];
  const add = (command: string) => {
    if (!commands.includes(command)) commands.push(command);
  };

  const isElf =
    /\.(elf|bin|so|o|exe|dll)$/.test(names) ||
    /\b(elf|executable|binary|biner)\b/i.test(text);
  const isPdf = /\.pdf\b/.test(names) || /\bpdf\b/i.test(text);
  const isPcap = /\.(pcap|pcapng|cap)\b/.test(names) || /\bpcap\b/i.test(text);
  const isDump = /\.(dmp|dump|mem|raw)\b/.test(names) || /\b(memory\s*dump|volatilit)\b/i.test(text);
  const isPng = /\.(png|bmp|gif|jpg|jpeg|webp)\b/.test(names);
  const isJpegAudio = /\.(jpg|jpeg|wav|mp3|flac|ogg|m4a)\b/.test(names);

  add(`pwd; ls -la /analysis; echo '--- MANIFEST ---'; cat /analysis/MANIFEST.txt 2>/dev/null`);
  if (has("file")) add(`file ${targets}; sha256sum ${targets}`);
  add(`grep -aEro '[A-Za-z0-9_]{2,24}\\{[^}]{1,200}\\}' /analysis 2>/dev/null | head -n 80`);
  if (has("strings")) add(`strings -a -n 6 ${targets} | head -n 140`);
  if (has("exiftool")) add(`exiftool -a -u -G1 ${targets} 2>/dev/null | head -n 160`);
  if (has("binwalk")) add(`binwalk ${targets} 2>/dev/null | head -n 120`);
  if (has("foremost")) add(`mkdir -p /work/carved; foremost -i ${first} -o /work/carved 2>&1 | head -n 60; find /work/carved -type f -print 2>/dev/null | head -n 40`);
  if (has("pdfinfo") && isPdf) add(`pdfinfo ${first} 2>&1 | head -n 80; pdftotext -layout ${first} - 2>/dev/null | head -n 120`);
  if (has("tshark") && isPcap) add(`tshark -r ${first} -q -z io,phs 2>/dev/null | head -n 100; tshark -r ${first} -Y http.request -T fields -e http.host -e http.request.uri 2>/dev/null | head -n 60`);
  if (has("pngcheck") && isPng) add(`pngcheck -v ${first} 2>&1 | head -n 100`);
  if (has("zsteg") && isPng) add(`zsteg -a ${first} 2>&1 | head -n 140`);
  if (has("steghide") && isJpegAudio) add(`steghide info ${first} -p '' 2>&1 | head -n 40`);
  if (has("vol") && isDump) add(`vol -f ${first} windows.info 2>&1 | head -n 100`);

  if (isElf) {
    if (has("checksec")) add(`checksec --file=${first} 2>&1 | head -n 40`);
    if (has("readelf")) add(`readelf -a ${first} 2>/dev/null | head -n 160`);
    if (has("objdump")) add(`objdump -d ${first} 2>/dev/null | head -n 120`);
    if (has("gdb")) add(`gdb -batch -ex 'info files' -ex 'info functions' ${first} 2>&1 | head -n 100`);
    if (has("r2")) add(`r2 -q -c 'aaa; afl; iz~flag,ctf,secret' ${first} 2>&1 | head -n 120`);
    if (has("ghidra")) {
      add(
        `if command -v analyzeHeadless >/dev/null 2>&1; then mkdir -p /work/ghidra; analyzeHeadless /work/ghidra ctf -import ${first} -noanalysis 2>&1 | head -n 60; else ghidra -help 2>&1 | head -n 20; fi`,
      );
    }
  }

  const hash = text.match(/\b(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64}|\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53})\b/)?.[0];
  if (hash) {
    if (has("hashcat")) {
      const mode = hash.startsWith("$2") ? "3200" : hash.length === 40 ? "100" : hash.length === 64 ? "1400" : "0";
      add(`printf '%s\\n' ${shellQuote(hash)} > /work/hash.txt; hashcat -m ${mode} -a 0 /work/hash.txt /usr/share/wordlists/rockyou.txt --potfile-disable 2>&1 | head -n 60`);
    }
    if (has("john")) {
      const format = hash.startsWith("$2") ? "bcrypt" : hash.length === 40 ? "raw-sha1" : hash.length === 64 ? "raw-sha256" : "md5";
      add(`printf '%s\\n' ${shellQuote(hash)} > /work/hash.txt; john --format=${format} --wordlist=/usr/share/wordlists/rockyou.txt /work/hash.txt 2>&1 | head -n 60`);
    }
  }

  if (has("nmap") && /\b(nmap|scan|port\s+scan)\b/i.test(question)) {
    const host = question.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0];
    if (host) add(`nmap -sS -T3 --top-ports 50 ${shellQuote(host)} 2>&1 | head -n 80`);
  }

  for (const command of buildRetryCommands(cycle, files, tools)) add(command);
  return commands;
}
