import { extractFlagCandidates } from "./flag";
import type { FlagCandidate, PcapSummary } from "./types";

interface PcapResult {
  summary: PcapSummary;
  flags: FlagCandidate[];
  warnings: string[];
}

interface ParsedPacket {
  src?: string;
  dst?: string;
  protocol: string;
  payload?: Buffer;
}

const LINK_TYPES: Record<number, string> = {
  0: "NULL/Loopback",
  1: "Ethernet",
  101: "Raw IP",
  105: "IEEE 802.11",
  113: "Linux SLL",
  276: "Linux SLL2",
};

function ipv4(buffer: Buffer, offset: number): ParsedPacket | null {
  if (offset + 20 > buffer.length) return null;
  const version = buffer[offset] >> 4;
  if (version !== 4) return null;
  const ihl = (buffer[offset] & 0x0f) * 4;
  if (ihl < 20 || offset + ihl > buffer.length) return null;
  const protocol = buffer[offset + 9];
  const src = `${buffer[offset + 12]}.${buffer[offset + 13]}.${buffer[offset + 14]}.${buffer[offset + 15]}`;
  const dst = `${buffer[offset + 16]}.${buffer[offset + 17]}.${buffer[offset + 18]}.${buffer[offset + 19]}`;
  const totalLength = buffer.readUInt16BE(offset + 2);
  const payloadStart = offset + ihl;
  const payloadEnd = Math.min(buffer.length, offset + Math.max(ihl, totalLength));
  if (protocol === 6) {
    if (payloadStart + 20 > buffer.length) return { src, dst, protocol: "TCP" };
    const srcPort = buffer.readUInt16BE(payloadStart);
    const dstPort = buffer.readUInt16BE(payloadStart + 2);
    const dataOffset = (buffer[payloadStart + 12] >> 4) * 4;
    const payload = buffer.subarray(Math.min(buffer.length, payloadStart + dataOffset), payloadEnd);
    const label = [80, 8080, 8000, 3000, 5000].includes(dstPort) || [80, 8080, 8000, 3000, 5000].includes(srcPort)
      ? "HTTP"
      : dstPort === 443 || srcPort === 443
        ? "TLS"
        : "TCP";
    return { src, dst, protocol: label, payload };
  }
  if (protocol === 17) {
    if (payloadStart + 8 > buffer.length) return { src, dst, protocol: "UDP" };
    const srcPort = buffer.readUInt16BE(payloadStart);
    const dstPort = buffer.readUInt16BE(payloadStart + 2);
    const payload = buffer.subarray(payloadStart + 8, payloadEnd);
    return { src, dst, protocol: dstPort === 53 || srcPort === 53 ? "DNS" : "UDP", payload };
  }
  if (protocol === 1) return { src, dst, protocol: "ICMP" };
  return { src, dst, protocol: `IP proto ${protocol}` };
}

function ipv6(buffer: Buffer, offset: number): ParsedPacket | null {
  if (offset + 40 > buffer.length) return null;
  if (buffer[offset] >> 4 !== 6) return null;
  const next = buffer[offset + 6];
  const srcBytes = buffer.subarray(offset + 8, offset + 24);
  const dstBytes = buffer.subarray(offset + 24, offset + 40);
  const format = (bytes: Buffer) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").replace(/(.{4})/g, "$1:").replace(/:$/, "");
  const src = format(srcBytes);
  const dst = format(dstBytes);
  if (next === 6 && offset + 60 <= buffer.length) {
    const srcPort = buffer.readUInt16BE(offset + 40);
    const dstPort = buffer.readUInt16BE(offset + 42);
    return { src, dst, protocol: dstPort === 443 || srcPort === 443 ? "TLS" : "TCP", payload: buffer.subarray(offset + 60) };
  }
  if (next === 17) return { src, dst, protocol: "UDP", payload: buffer.subarray(offset + 48) };
  return { src, dst, protocol: `IPv6 next ${next}` };
}

function parseLinkLayer(buffer: Buffer, linkType: number): ParsedPacket | null {
  if (linkType === 1) {
    if (buffer.length < 14) return null;
    let etherType = buffer.readUInt16BE(12);
    let offset = 14;
    while (etherType === 0x8100 && offset + 4 <= buffer.length) {
      etherType = buffer.readUInt16BE(offset + 2);
      offset += 4;
    }
    if (etherType === 0x0800) return ipv4(buffer, offset);
    if (etherType === 0x86dd) return ipv6(buffer, offset);
    if (etherType === 0x0806) return { protocol: "ARP" };
    return { protocol: `EtherType 0x${etherType.toString(16)}` };
  }
  if (linkType === 101) {
    if (!buffer.length) return null;
    return buffer[0] >> 4 === 6 ? ipv6(buffer, 0) : ipv4(buffer, 0);
  }
  if (linkType === 113) {
    if (buffer.length < 16) return null;
    return ipv4(buffer, 16) || ipv6(buffer, 16);
  }
  if (linkType === 0) {
    if (buffer.length < 4) return null;
    const family = buffer.readUInt32LE(0);
    return family === 2 ? ipv4(buffer, 4) : ipv6(buffer, 4);
  }
  return null;
}

function parseDnsName(data: Buffer, offset: number, depth = 0): { name: string; next: number } {
  if (depth > 10 || offset >= data.length) return { name: "", next: offset };
  let name = "";
  let cursor = offset;
  while (cursor < data.length) {
    const length = data[cursor];
    if (length === 0) {
      cursor += 1;
      break;
    }
    if ((length & 0xc0) === 0xc0) {
      if (cursor + 1 >= data.length) break;
      const pointer = ((length & 0x3f) << 8) | data[cursor + 1];
      const nested = parseDnsName(data, pointer, depth + 1);
      name += nested.name;
      cursor += 2;
      break;
    }
    if (cursor + 1 + length > data.length) break;
    name += `${data.subarray(cursor + 1, cursor + 1 + length).toString("latin1")}.`;
    cursor += 1 + length;
  }
  return { name: name.replace(/\.$/, ""), next: cursor };
}

function parseDns(payload: Buffer | undefined) {
  if (!payload || payload.length < 12) return [];
  const questions = payload.readUInt16BE(4);
  if (questions > 20) return [];
  const names: string[] = [];
  let offset = 12;
  for (let i = 0; i < questions; i += 1) {
    const parsed = parseDnsName(payload, offset);
    if (!parsed.name) break;
    names.push(parsed.name);
    offset = parsed.next + 4;
  }
  return names;
}

function packetText(payload: Buffer | undefined) {
  if (!payload || !payload.length) return "";
  return payload.subarray(0, 8192).toString("latin1");
}

export function parsePcap(buffer: Buffer): PcapResult {
  if (buffer.length < 24) throw new Error("File PCAP terlalu pendek.");
  const magic = buffer.subarray(0, 4).toString("hex");
  if (magic === "0a0d0d0a") return parsePcapNg(buffer);

  const variants: Record<string, { little: boolean; nano: boolean }> = {
    d4c3b2a1: { little: true, nano: false },
    a1b2c3d4: { little: false, nano: false },
    "4d3cb2a1": { little: true, nano: true },
    a1b2c34d: { little: false, nano: true },
  };
  const variant = variants[magic];
  if (!variant) throw new Error(`Magic PCAP tidak dikenal: ${magic}`);
  const read32 = (offset: number) => (variant.little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset));
  const linkType = read32(20);
  const summary: PcapSummary = {
    format: variant.nano ? "PCAP (nanosecond)" : "PCAP",
    linkType: LINK_TYPES[linkType] || `Link type ${linkType}`,
    packetCount: 0,
    capturedBytes: 0,
    protocols: {},
    conversations: [],
    dnsQueries: [],
    httpHosts: [],
    httpRequests: [],
    credentials: [],
    interestingStrings: [],
  };
  const flags = new Map<string, FlagCandidate>();
  const warnings: string[] = [];
  const conversations = new Map<string, { src: string; dst: string; protocol: string; packets: number }>();
  const dns = new Set<string>();
  const hosts = new Set<string>();
  const requests = new Set<string>();
  const credentials = new Set<string>();
  const interesting = new Set<string>();

  let offset = 24;
  let packetIndex = 0;
  while (offset + 16 <= buffer.length && packetIndex < 100_000) {
    const inclLength = read32(offset + 8);
    if (inclLength > 262_144 || offset + 16 + inclLength > buffer.length) {
      warnings.push(`Packet ${packetIndex} terpotong atau memiliki panjang tidak wajar (${inclLength}).`);
      break;
    }
    const data = buffer.subarray(offset + 16, offset + 16 + inclLength);
    summary.packetCount += 1;
    summary.capturedBytes += inclLength;
    const parsed = parseLinkLayer(data, linkType);
    if (parsed) {
      summary.protocols[parsed.protocol] = (summary.protocols[parsed.protocol] || 0) + 1;
      if (parsed.src && parsed.dst) {
        const key = `${parsed.src}|${parsed.dst}|${parsed.protocol}`;
        const existing = conversations.get(key);
        if (existing) existing.packets += 1;
        else conversations.set(key, { src: parsed.src, dst: parsed.dst, protocol: parsed.protocol, packets: 1 });
      }
      if (parsed.protocol === "DNS") {
        for (const name of parseDns(parsed.payload)) dns.add(name);
      }
      const text = packetText(parsed.payload);
      if (text) {
        for (const candidate of extractFlagCandidates(text, `PCAP packet ${packetIndex}`)) {
          if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
        }
        const hostMatch = text.match(/Host:\s*([^\r\n]+)/gi);
        hostMatch?.forEach((value) => hosts.add(value.replace(/^Host:\s*/i, "").trim()));
        const requestMatch = text.match(/(GET|POST|PUT|HEAD|DELETE|PATCH)\s+(\S+)\s+HTTP\/\d\.\d/i);
        if (requestMatch) requests.add(`${requestMatch[1].toUpperCase()} ${requestMatch[2]}`);
        const authMatch = text.match(/(Authorization:\s*[^\r\n]+|Cookie:\s*[^\r\n]+|(?:password|passwd|pwd|user|username|token|api_key)=([^\s&"\r\n]+))/gi);
        authMatch?.forEach((value) => credentials.add(value.slice(0, 300)));
        const strings = text.match(/[\x20-\x7e]{8,}/g) || [];
        for (const value of strings) {
          if (/flag|secret|token|passw|admin|key|login|ctf/i.test(value)) interesting.add(value.slice(0, 240));
          if (interesting.size >= 120) break;
        }
      }
    }
    offset += 16 + inclLength;
    packetIndex += 1;
  }

  summary.conversations = [...conversations.values()].sort((a, b) => b.packets - a.packets).slice(0, 40);
  summary.dnsQueries = [...dns].slice(0, 80);
  summary.httpHosts = [...hosts].slice(0, 80);
  summary.httpRequests = [...requests].slice(0, 80);
  summary.credentials = [...credentials].slice(0, 40);
  summary.interestingStrings = [...interesting].slice(0, 80);
  return { summary, flags: [...flags.values()], warnings };
}

function parsePcapNg(buffer: Buffer): PcapResult {
  if (buffer.length < 12) throw new Error("PCAPNG terlalu pendek.");
  const summary: PcapSummary = {
    format: "PCAPNG",
    linkType: "unknown",
    packetCount: 0,
    capturedBytes: 0,
    protocols: {},
    conversations: [],
    dnsQueries: [],
    httpHosts: [],
    httpRequests: [],
    credentials: [],
    interestingStrings: [],
  };
  const flags = new Map<string, FlagCandidate>();
  const warnings: string[] = [];
  let offset = 0;
  let little = true;
  let linkType = 1;
  let packetIndex = 0;
  const conversations = new Map<string, { src: string; dst: string; protocol: string; packets: number }>();
  const dns = new Set<string>();
  const hosts = new Set<string>();
  const requests = new Set<string>();
  const credentials = new Set<string>();
  const interesting = new Set<string>();

  while (offset + 12 <= buffer.length && packetIndex < 100_000) {
    const blockType = buffer.readUInt32LE(offset);
    let blockLength = buffer.readUInt32LE(offset + 4);
    if (blockType === 0x0a0d0d0a) {
      const bom = buffer.readUInt32LE(offset + 8);
      little = bom === 0x1a2b3c4d;
      blockLength = little ? buffer.readUInt32LE(offset + 4) : buffer.readUInt32BE(offset + 4);
    }
    if (blockLength < 12 || offset + blockLength > buffer.length) {
      warnings.push("PCAPNG block length tidak valid; parsing dihentikan.");
      break;
    }
    if (blockType === 1) {
      if (offset + 10 <= buffer.length) {
        linkType = little ? buffer.readUInt16LE(offset + 8) : buffer.readUInt16BE(offset + 8);
        summary.linkType = LINK_TYPES[linkType] || `Link type ${linkType}`;
      }
    } else if (blockType === 6) {
      const capturedLength = little ? buffer.readUInt32LE(offset + 20) : buffer.readUInt32BE(offset + 20);
      const dataStart = offset + 28;
      if (capturedLength > 262_144 || dataStart + capturedLength > buffer.length) {
        warnings.push("Enhanced Packet Block terpotong.");
        break;
      }
      const data = buffer.subarray(dataStart, dataStart + capturedLength);
      summary.packetCount += 1;
      summary.capturedBytes += capturedLength;
      const parsed = parseLinkLayer(data, linkType);
      if (parsed) {
        summary.protocols[parsed.protocol] = (summary.protocols[parsed.protocol] || 0) + 1;
        if (parsed.src && parsed.dst) {
          const key = `${parsed.src}|${parsed.dst}|${parsed.protocol}`;
          const existing = conversations.get(key);
          if (existing) existing.packets += 1;
          else conversations.set(key, { src: parsed.src, dst: parsed.dst, protocol: parsed.protocol, packets: 1 });
        }
        if (parsed.protocol === "DNS") for (const name of parseDns(parsed.payload)) dns.add(name);
        const text = packetText(parsed.payload);
        for (const candidate of extractFlagCandidates(text, `PCAPNG packet ${packetIndex}`)) {
          if (!flags.has(candidate.value)) flags.set(candidate.value, candidate);
        }
        const hostMatch = text.match(/Host:\s*([^\r\n]+)/gi);
        hostMatch?.forEach((value) => hosts.add(value.replace(/^Host:\s*/i, "").trim()));
        const requestMatch = text.match(/(GET|POST|PUT|HEAD|DELETE|PATCH)\s+(\S+)\s+HTTP\/\d\.\d/i);
        if (requestMatch) requests.add(`${requestMatch[1].toUpperCase()} ${requestMatch[2]}`);
        const authMatch = text.match(/(Authorization:\s*[^\r\n]+|Cookie:\s*[^\r\n]+|(?:password|passwd|pwd|user|username|token|api_key)=([^\s&"\r\n]+))/gi);
        authMatch?.forEach((value) => credentials.add(value.slice(0, 300)));
        const strings = text.match(/[\x20-\x7e]{8,}/g) || [];
        for (const value of strings) {
          if (/flag|secret|token|passw|admin|key|login|ctf/i.test(value)) interesting.add(value.slice(0, 240));
        }
      }
      packetIndex += 1;
    }
    offset += blockLength;
  }

  summary.conversations = [...conversations.values()].sort((a, b) => b.packets - a.packets).slice(0, 40);
  summary.dnsQueries = [...dns].slice(0, 80);
  summary.httpHosts = [...hosts].slice(0, 80);
  summary.httpRequests = [...requests].slice(0, 80);
  summary.credentials = [...credentials].slice(0, 40);
  summary.interestingStrings = [...interesting].slice(0, 80);
  return { summary, flags: [...flags.values()], warnings };
}
