import { shannonEntropy } from "./crypto";
import type { ExecutableInfo, ImportInfo, SectionInfo, SecurityFeature } from "./types";

const DANGEROUS = [
  "system", "execve", "execl", "execvp", "popen", "gets", "strcpy", "strcat", "sprintf",
  "scanf", "read", "write", "open", "mmap", "mprotect", "setuid", "setgid", "chmod",
  "win", "flag", "__stack_chk_fail", "__stack_chk_guard", "__printf_chk", "__memcpy_chk",
  "printf", "puts", "malloc", "free", "fopen", "fgets", "recv", "send",
];

const ELF_MACHINES: Record<number, string> = {
  3: "x86 (i386)", 8: "MIPS", 20: "PowerPC", 21: "PowerPC64", 40: "ARM", 62: "x86-64",
  183: "AArch64", 243: "RISC-V", 258: "LoongArch",
};

const PE_MACHINES: Record<number, string> = {
  0x014c: "x86 (i386)", 0x8664: "x86-64", 0x01c0: "ARM", 0xaa64: "ARM64", 0x0200: "IA64",
};

function readInt(buffer: Buffer, offset: number, size: number, little: boolean) {
  if (offset < 0 || offset + size > buffer.length) return 0;
  if (size === 1) return buffer[offset];
  if (size === 2) return little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
  if (size === 4) return little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  const value = little ? buffer.readBigUInt64LE(offset) : buffer.readBigUInt64BE(offset);
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
}

function hex(value: number, width = 8) {
  return `0x${value.toString(16).padStart(width, "0")}`;
}

function entropyOf(buffer: Buffer, offset: number, size: number) {
  if (offset < 0 || offset >= buffer.length || size <= 0) return 0;
  return Number(shannonEntropy(buffer.subarray(offset, Math.min(buffer.length, offset + size))).toFixed(3));
}

function findGadgets(buffer: Buffer, executableRanges: Array<{ offset: number; size: number; vaddr: number }>, base = 0) {
  const patterns: Array<{ bytes: number[]; instruction: string }> = [
    { bytes: [0x5f, 0xc3], instruction: "pop rdi ; ret" },
    { bytes: [0x5e, 0xc3], instruction: "pop rsi ; ret" },
    { bytes: [0x5a, 0xc3], instruction: "pop rdx ; ret" },
    { bytes: [0x58, 0xc3], instruction: "pop rax ; ret" },
    { bytes: [0x0f, 0x05], instruction: "syscall" },
    { bytes: [0xc3], instruction: "ret" },
  ];
  const gadgets: Array<{ address: string; bytes: string; instruction: string }> = [];
  for (const range of executableRanges) {
    const end = Math.min(buffer.length, range.offset + range.size);
    for (let offset = range.offset; offset < end; offset += 1) {
      for (const pattern of patterns) {
        if (offset + pattern.bytes.length > end) continue;
        if (pattern.bytes.every((byte, index) => buffer[offset + index] === byte)) {
          if (pattern.bytes.length === 1 && gadgets.filter((gadget) => gadget.instruction === "ret").length >= 8) continue;
          gadgets.push({
            address: hex(base + range.vaddr + (offset - range.offset)),
            bytes: pattern.bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" "),
            instruction: pattern.instruction,
          });
          break;
        }
      }
      if (gadgets.length >= 40) return gadgets;
    }
  }
  return gadgets;
}

function dangerousSymbols(symbols: string[]) {
  return symbols.filter((symbol) => DANGEROUS.some((name) => symbol.toLowerCase().includes(name.toLowerCase()))).slice(0, 80);
}

export function analyzeElf(buffer: Buffer): ExecutableInfo {
  if (buffer.length < 52 || buffer[0] !== 0x7f || buffer.subarray(1, 4).toString("latin1") !== "ELF") {
    throw new Error("Bukan file ELF.");
  }
  const bits = buffer[4] === 2 ? 64 : 32;
  const little = buffer[5] !== 2;
  const type = readInt(buffer, 16, 2, little);
  const machine = readInt(buffer, 18, 2, little);
  const entry = readInt(buffer, 24, bits === 64 ? 8 : 4, little);
  const phoff = readInt(buffer, bits === 64 ? 32 : 28, bits === 64 ? 8 : 4, little);
  const shoff = readInt(buffer, bits === 64 ? 40 : 32, bits === 64 ? 8 : 4, little);
  const phentsize = readInt(buffer, bits === 64 ? 54 : 42, 2, little);
  const phnum = readInt(buffer, bits === 64 ? 56 : 44, 2, little);
  const shentsize = readInt(buffer, bits === 64 ? 58 : 46, 2, little);
  const shnum = readInt(buffer, bits === 64 ? 60 : 48, 2, little);
  const shstrndx = readInt(buffer, bits === 64 ? 62 : 50, 2, little);

  const sections: SectionInfo[] = [];
  const sectionHeaders: Array<{ nameOffset: number; type: number; flags: number; addr: number; offset: number; size: number; link: number; entsize: number; name: string }> = [];
  for (let index = 0; index < Math.min(shnum, 128); index += 1) {
    const offset = shoff + index * shentsize;
    if (offset + shentsize > buffer.length) break;
    if (bits === 64) {
      sectionHeaders.push({
        nameOffset: readInt(buffer, offset, 4, little),
        type: readInt(buffer, offset + 4, 4, little),
        flags: readInt(buffer, offset + 8, 8, little),
        addr: readInt(buffer, offset + 16, 8, little),
        offset: readInt(buffer, offset + 24, 8, little),
        size: readInt(buffer, offset + 32, 8, little),
        link: readInt(buffer, offset + 40, 4, little),
        entsize: readInt(buffer, offset + 56, 8, little),
        name: "",
      });
    } else {
      sectionHeaders.push({
        nameOffset: readInt(buffer, offset, 4, little),
        type: readInt(buffer, offset + 4, 4, little),
        flags: readInt(buffer, offset + 8, 4, little),
        addr: readInt(buffer, offset + 12, 4, little),
        offset: readInt(buffer, offset + 16, 4, little),
        size: readInt(buffer, offset + 20, 4, little),
        link: readInt(buffer, offset + 24, 4, little),
        entsize: readInt(buffer, offset + 36, 4, little),
        name: "",
      });
    }
  }
  const shstr = sectionHeaders[shstrndx];
  for (const section of sectionHeaders) {
    if (shstr && shstr.offset + section.nameOffset < buffer.length) {
      const end = buffer.indexOf(0, shstr.offset + section.nameOffset);
      section.name = buffer.subarray(shstr.offset + section.nameOffset, end >= 0 ? end : Math.min(buffer.length, shstr.offset + section.nameOffset + 64)).toString("latin1");
    }
    if (section.type !== 8) {
      sections.push({
        name: section.name || `section_${sections.length}`,
        virtualAddress: hex(section.addr),
        virtualSize: section.size,
        rawOffset: section.offset,
        rawSize: section.size,
        entropy: entropyOf(buffer, section.offset, section.size),
        flags: section.flags & 0x4 ? "EXEC" : section.flags & 0x2 ? "WRITE" : "READ",
      });
    }
  }

  const symbols: string[] = [];
  const dynamicLibraries = new Set<string>();
  for (const section of sectionHeaders) {
    if (!["SHT_SYMTAB", ".symtab", ".dynsym"].includes(section.name) && section.type !== 2 && section.type !== 11) continue;
    const strtab = sectionHeaders[section.link];
    if (!strtab) continue;
    const entrySize = section.entsize || (bits === 64 ? 24 : 16);
    const count = Math.min(2000, Math.floor(section.size / Math.max(1, entrySize)));
    for (let index = 0; index < count; index += 1) {
      const offset = section.offset + index * entrySize;
      if (offset + entrySize > buffer.length) break;
      const nameOffset = readInt(buffer, offset, 4, little);
      if (!nameOffset) continue;
      const nameStart = strtab.offset + nameOffset;
      if (nameStart >= buffer.length) continue;
      const end = buffer.indexOf(0, nameStart);
      const name = buffer.subarray(nameStart, end >= 0 ? end : Math.min(buffer.length, nameStart + 120)).toString("latin1");
      if (!name || name.length > 120) continue;
      if (name.startsWith("lib") && name.endsWith(".so")) dynamicLibraries.add(name);
      if (!symbols.includes(name)) symbols.push(name);
      if (symbols.length >= 600) break;
    }
    if (symbols.length >= 600) break;
  }

  const programHeaders: Array<{ type: number; flags: number; offset: number; vaddr: number; filesz: number; memsz: number }> = [];
  for (let index = 0; index < Math.min(phnum, 64); index += 1) {
    const offset = phoff + index * phentsize;
    if (offset + phentsize > buffer.length) break;
    if (bits === 64) {
      programHeaders.push({
        type: readInt(buffer, offset, 4, little),
        flags: readInt(buffer, offset + 4, 4, little),
        offset: readInt(buffer, offset + 8, 8, little),
        vaddr: readInt(buffer, offset + 16, 8, little),
        filesz: readInt(buffer, offset + 32, 8, little),
        memsz: readInt(buffer, offset + 40, 8, little),
      });
    } else {
      programHeaders.push({
        type: readInt(buffer, offset, 4, little),
        offset: readInt(buffer, offset + 4, 4, little),
        vaddr: readInt(buffer, offset + 8, 4, little),
        filesz: readInt(buffer, offset + 16, 4, little),
        memsz: readInt(buffer, offset + 20, 4, little),
        flags: readInt(buffer, offset + 24, 4, little),
      });
    }
  }

  const gnuStack = programHeaders.find((header) => header.type === 0x6474e551);
  const relro = programHeaders.some((header) => header.type === 0x6474e552);
  const dynamic = sectionHeaders.find((section) => section.name === ".dynamic" || section.type === 6);
  let bindNow = false;
  let rpath = false;
  if (dynamic) {
    const entrySize = bits === 64 ? 16 : 8;
    const count = Math.min(256, Math.floor(dynamic.size / entrySize));
    for (let index = 0; index < count; index += 1) {
      const offset = dynamic.offset + index * entrySize;
      if (offset + entrySize > buffer.length) break;
      const tag = readInt(buffer, offset, bits === 64 ? 8 : 4, little);
      const value = readInt(buffer, offset + (bits === 64 ? 8 : 4), bits === 64 ? 8 : 4, little);
      if (tag === 24) bindNow = true;
      if (tag === 30 && (value & 8) !== 0) bindNow = true;
      if (tag === 0x6ffffffb && (value & 1) !== 0) bindNow = true;
      if (tag === 15 || tag === 29) rpath = true;
    }
  }

  const security: SecurityFeature[] = [
    { name: "NX (non-executable stack)", enabled: gnuStack ? (gnuStack.flags & 1) === 0 : null, detail: gnuStack ? `PT_GNU_STACK flags=${gnuStack.flags}` : "PT_GNU_STACK tidak ditemukan." },
    { name: "PIE / ASLR", enabled: type === 3, detail: type === 3 ? "ET_DYN — position independent." : type === 2 ? "ET_EXEC — alamat tetap." : `e_type=${type}` },
    { name: "RELRO", enabled: relro, detail: relro ? (bindNow ? "Full RELRO (BIND_NOW)." : "Partial RELRO.") : "PT_GNU_RELRO tidak ditemukan." },
    { name: "Stack canary", enabled: symbols.some((symbol) => symbol.includes("__stack_chk_fail")), detail: "Berdasarkan simbol __stack_chk_fail." },
    { name: "FORTIFY_SOURCE", enabled: symbols.some((symbol) => /_chk$/.test(symbol)), detail: "Berdasarkan simbol *_chk." },
    { name: "RPATH/RUNPATH", enabled: rpath, detail: rpath ? "Dynamic tag RPATH/RUNPATH ditemukan." : "Tidak ditemukan." },
  ];

  const execRanges = sectionHeaders
    .filter((section) => (section.flags & 0x4) !== 0 && section.size > 0 && section.size < 64 * 1024 * 1024)
    .map((section) => ({ offset: section.offset, size: section.size, vaddr: section.addr }));
  const gadgets = findGadgets(buffer, execRanges);

  const packingHints: string[] = [];
  if (sections.some((section) => /upx|packed|petite|aspack|mpress/i.test(section.name))) packingHints.push("Nama section mengindikasikan packer (UPX/packed).");
  if (sections.filter((section) => section.entropy > 7.2 && section.rawSize > 1024).length >= 2) packingHints.push("Beberapa section memiliki entropy > 7.2 — kemungkinan terkompresi/terenkripsi.");
  if (symbols.length < 10 && type === 2) packingHints.push("Simbol sangat sedikit pada executable — bisa jadi stripped/packed.");

  const imports: ImportInfo[] = dynamicLibraries.size
    ? [{ library: "Dynamic libraries (ELF NEEDED)", functions: [...dynamicLibraries].slice(0, 40) }]
    : [];

  return {
    format: "ELF",
    architecture: ELF_MACHINES[machine] || `ELF machine ${machine}`,
    bits,
    endianness: little ? "little-endian" : "big-endian",
    entryPoint: hex(entry, bits === 64 ? 16 : 8),
    imageBase: programHeaders[0] ? hex(programHeaders[0].vaddr, bits === 64 ? 16 : 8) : undefined,
    type: type === 2 ? "EXEC" : type === 3 ? "DYN (PIE)" : type === 1 ? "REL" : `type ${type}`,
    sections,
    imports,
    symbols: symbols.slice(0, 400),
    security,
    packingHints,
    gadgets,
  };
}

export function analyzePe(buffer: Buffer): ExecutableInfo {
  if (buffer.length < 0x40 || buffer[0] !== 0x4d || buffer[1] !== 0x5a) throw new Error("Bukan file PE (MZ).");
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 24 > buffer.length || buffer.subarray(peOffset, peOffset + 4).toString("latin1") !== "PE\u0000\u0000") {
    throw new Error("Signature PE tidak ditemukan.");
  }
  const coff = peOffset + 4;
  const machine = buffer.readUInt16LE(coff);
  const numberOfSections = buffer.readUInt16LE(coff + 2);
  const timeDateStamp = buffer.readUInt32LE(coff + 4);
  const sizeOfOptionalHeader = buffer.readUInt16LE(coff + 16);
  const characteristics = buffer.readUInt16LE(coff + 18);
  const optional = coff + 20;
  const magic = buffer.readUInt16LE(optional);
  const pe32Plus = magic === 0x20b;
  if (!pe32Plus && magic !== 0x10b) throw new Error("Format optional header PE tidak dikenal.");
  const entry = buffer.readUInt32LE(optional + 16);
  const imageBase = pe32Plus ? Number(buffer.readBigUInt64LE(optional + 24)) : buffer.readUInt32LE(optional + 28);
  const subsystem = buffer.readUInt16LE(optional + 68);
  const dllCharacteristics = buffer.readUInt16LE(optional + 70);
  const numberOfRvaAndSizes = buffer.readUInt32LE(optional + (pe32Plus ? 108 : 92));
  const dataDirectories = optional + (pe32Plus ? 112 : 96);

  const sections: SectionInfo[] = [];
  const sectionRanges: Array<{ name: string; vaddr: number; vsize: number; rawOffset: number; rawSize: number; characteristics: number }> = [];
  const sectionTable = optional + sizeOfOptionalHeader;
  for (let index = 0; index < Math.min(numberOfSections, 96); index += 1) {
    const offset = sectionTable + index * 40;
    if (offset + 40 > buffer.length) break;
    const name = buffer.subarray(offset, offset + 8).toString("latin1").replace(/\0.*$/, "");
    const virtualSize = buffer.readUInt32LE(offset + 8);
    const virtualAddress = buffer.readUInt32LE(offset + 12);
    const rawSize = buffer.readUInt32LE(offset + 16);
    const rawOffset = buffer.readUInt32LE(offset + 20);
    const sectionCharacteristics = buffer.readUInt32LE(offset + 36);
    sectionRanges.push({ name, vaddr: virtualAddress, vsize: virtualSize, rawOffset, rawSize, characteristics: sectionCharacteristics });
    sections.push({
      name: name || `section_${index}`,
      virtualAddress: hex(imageBase + virtualAddress),
      virtualSize,
      rawOffset,
      rawSize,
      entropy: entropyOf(buffer, rawOffset, rawSize),
      flags: [
        sectionCharacteristics & 0x20000000 ? "EXEC" : "",
        sectionCharacteristics & 0x80000000 ? "WRITE" : "",
        sectionCharacteristics & 0x40000000 ? "READ" : "",
      ].filter(Boolean).join(" "),
    });
  }

  const rvaToOffset = (rva: number) => {
    const section = sectionRanges.find((item) => rva >= item.vaddr && rva < item.vaddr + Math.max(item.vsize, item.rawSize));
    return section ? section.rawOffset + (rva - section.vaddr) : -1;
  };

  const imports: ImportInfo[] = [];
  if (numberOfRvaAndSizes > 1 && dataDirectories + 16 <= buffer.length) {
    const importRva = buffer.readUInt32LE(dataDirectories + 8);
    if (importRva) {
      let descriptorOffset = rvaToOffset(importRva);
      for (let index = 0; index < 40 && descriptorOffset > 0 && descriptorOffset + 20 <= buffer.length; index += 1) {
        const originalFirstThunk = buffer.readUInt32LE(descriptorOffset);
        const nameRva = buffer.readUInt32LE(descriptorOffset + 12);
        const firstThunk = buffer.readUInt32LE(descriptorOffset + 16);
        if (!nameRva && !firstThunk) break;
        const nameOffset = rvaToOffset(nameRva);
        const library = nameOffset >= 0 ? buffer.subarray(nameOffset, buffer.indexOf(0, nameOffset) >= 0 ? buffer.indexOf(0, nameOffset) : nameOffset + 120).toString("latin1") : `import_${index}`;
        const functions: string[] = [];
        let thunkOffset = rvaToOffset(originalFirstThunk || firstThunk);
        for (let thunk = 0; thunk < 300 && thunkOffset > 0; thunk += 1) {
          const size = pe32Plus ? 8 : 4;
          if (thunkOffset + size > buffer.length) break;
          const value = pe32Plus ? Number(buffer.readBigUInt64LE(thunkOffset)) : buffer.readUInt32LE(thunkOffset);
          if (!value) break;
          const isOrdinal = pe32Plus
            ? (BigInt(value) & 0x8000000000000000n) !== 0n
            : (value & 0x80000000) !== 0;
          if (isOrdinal) {
            functions.push(`#${value & 0xffff}`);
          } else {
            const hintOffset = rvaToOffset(value & 0x7fffffff);
            if (hintOffset > 0 && hintOffset + 2 < buffer.length) {
              const end = buffer.indexOf(0, hintOffset + 2);
              functions.push(buffer.subarray(hintOffset + 2, end >= 0 ? end : Math.min(buffer.length, hintOffset + 120)).toString("latin1"));
            }
          }
          thunkOffset += size;
        }
        if (library) imports.push({ library, functions: functions.slice(0, 200) });
        descriptorOffset += 20;
      }
    }
  }

  const symbols: string[] = [];
  for (const item of imports) for (const fn of item.functions) if (!symbols.includes(fn)) symbols.push(fn);

  const executableRanges = sectionRanges
    .filter((section) => (section.characteristics & 0x20000000) !== 0)
    .map((section) => ({ offset: section.rawOffset, size: section.rawSize, vaddr: section.vaddr }));
  const gadgets = findGadgets(buffer, executableRanges, imageBase);

  const security: SecurityFeature[] = [
    { name: "ASLR (DYNAMIC_BASE)", enabled: (dllCharacteristics & 0x40) !== 0, detail: `DllCharacteristics=0x${dllCharacteristics.toString(16)}` },
    { name: "DEP / NX (NX_COMPAT)", enabled: (dllCharacteristics & 0x100) !== 0, detail: `DllCharacteristics=0x${dllCharacteristics.toString(16)}` },
    { name: "Control Flow Guard", enabled: (dllCharacteristics & 0x4000) !== 0, detail: `DllCharacteristics=0x${dllCharacteristics.toString(16)}` },
    { name: "High entropy VA", enabled: (dllCharacteristics & 0x20) !== 0, detail: `DllCharacteristics=0x${dllCharacteristics.toString(16)}` },
    { name: "Stack canary", enabled: symbols.some((symbol) => /security_check_cookie|__stack_chk/i.test(symbol)), detail: "Berdasarkan import security cookie." },
  ];

  const packingHints: string[] = [];
  if (sections.some((section) => /upx|packed|aspack|mpress|petite/i.test(section.name))) packingHints.push("Nama section mengindikasikan packer.");
  if (sections.filter((section) => section.entropy > 7.2 && section.rawSize > 1024).length >= 2) packingHints.push("Entropy section tinggi — kemungkinan packed/encrypted.");
  if (imports.length <= 2 && sections.length > 0) packingHints.push("Import table sangat kecil — bisa jadi packed atau statically linked.");

  const timestamp = timeDateStamp ? new Date(timeDateStamp * 1000).toISOString() : "unknown";
  const peKind = characteristics & 0x2000 ? "DLL" : "EXE";
  return {
    format: "PE",
    architecture: PE_MACHINES[machine] || `PE machine 0x${machine.toString(16)}`,
    bits: pe32Plus ? 64 : 32,
    endianness: "little-endian",
    entryPoint: hex(imageBase + entry),
    imageBase: hex(imageBase, 16),
    type: `PE32${pe32Plus ? "+" : ""} ${peKind} • subsystem ${subsystem} • compiled ${timestamp}`,
    sections,
    imports,
    symbols: symbols.slice(0, 400),
    security,
    packingHints,
    gadgets,
  };
}

export function analyzeBinary(buffer: Buffer): ExecutableInfo {
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer.subarray(1, 4).toString("latin1") === "ELF") {
    return analyzeElf(buffer);
  }
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return analyzePe(buffer);
  }
  if (buffer.length >= 4) {
    const magic = buffer.subarray(0, 4).toString("hex");
    if (["feedface", "feedfacf", "cefaedfe", "cffaedfe"].includes(magic)) {
      return {
        format: "Mach-O",
        architecture: "Mach-O binary",
        bits: magic === "feedfacf" || magic === "cffaedfe" ? 64 : 32,
        sections: [],
        imports: [],
        symbols: [],
        security: [{ name: "Mach-O analysis", enabled: null, detail: "Parser Mach-O mendalam belum diimplementasikan." }],
        packingHints: [],
      };
    }
  }
  throw new Error("Format executable tidak didukung (hanya ELF/PE/Mach-O dasar).");
}

export function dangerousImports(info: ExecutableInfo) {
  const names = info.imports.flatMap((item) => item.functions).concat(info.symbols);
  return dangerousSymbols([...new Set(names)]);
}
