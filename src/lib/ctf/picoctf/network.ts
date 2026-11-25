import { isIP } from "node:net";

/**
 * Network policy for authorized picoGym practice instances.
 *
 * The only trusted source of an instance address is the operator. This module
 * never reads credentials and never derives a challenge host from public
 * writeups, search results, or untrusted page content.
 */

export interface PicoGymNetworkConfig {
  enabled: boolean;
  strictEndpoints: boolean;
  requireNetworkConfirmation: boolean;
  allowedHosts: string[];
  allowedPorts: number[];
}

export interface EndpointDecision {
  ok: boolean;
  reason: string;
}

function normalizedHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function parsePorts(value: string | undefined): number[] {
  if (!value) return [];
  return [...new Set(
    value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0 && item < 65536),
  )];
}

export function getPicoGymNetworkConfig(): PicoGymNetworkConfig {
  const enabled = process.env.CTF_PICOCTF_MODE === "1";
  return {
    enabled,
    strictEndpoints: enabled && process.env.CTF_PICOCTF_STRICT_ENDPOINTS !== "0",
    requireNetworkConfirmation: enabled && process.env.CTF_PICOCTF_REQUIRE_NETWORK_CONFIRMATION !== "0",
    allowedHosts: (process.env.CTF_PICOCTF_ALLOWED_HOSTS || "")
      .split(",")
      .map(normalizedHost)
      .filter(Boolean),
    allowedPorts: parsePorts(process.env.CTF_PICOCTF_ALLOWED_PORTS),
  };
}

function hostMatches(host: string, rule: string): boolean {
  if (rule.startsWith("*.")) {
    const suffix = rule.slice(1);
    return host.endsWith(suffix) && host !== suffix.slice(1);
  }
  return host === rule;
}

/** Requires an exact operator-supplied host:port before any picoGym network action. */
export function authorizePicoGymEndpoint(hostInput: string, portInput: number): EndpointDecision {
  const config = getPicoGymNetworkConfig();
  if (!config.enabled) {
    return { ok: true, reason: "Mode picoGym tidak aktif; kontrol endpoint generik dipakai." };
  }
  const host = normalizedHost(hostInput);
  const port = Number(portInput);
  if (!host || host.length > 253 || /[\s/@\\]/.test(host)) {
    return { ok: false, reason: "Host instance picoGym tidak valid." };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: "Port instance picoGym tidak valid." };
  }
  if (!config.strictEndpoints) {
    return { ok: true, reason: "Endpoint diizinkan karena strict endpoint dinonaktifkan operator." };
  }
  if (!config.allowedHosts.length) {
    return {
      ok: false,
      reason: "Belum ada instance picoGym yang diotorisasi. Isi CTF_PICOCTF_ALLOWED_HOSTS dengan host dari akun Anda.",
    };
  }
  if (!config.allowedHosts.some((rule) => hostMatches(host, rule))) {
    return { ok: false, reason: `Host ${host} tidak ada dalam daftar instance picoGym yang diotorisasi.` };
  }
  if (config.allowedPorts.length && !config.allowedPorts.includes(port)) {
    return { ok: false, reason: `Port ${port} tidak ada dalam daftar port picoGym yang diotorisasi.` };
  }
  if (isIP(host) === 0 && !host.includes(".") && host !== "localhost") {
    return { ok: false, reason: "Host instance picoGym harus berupa nama domain atau alamat IP yang valid." };
  }
  return { ok: true, reason: "Host dan port cocok dengan instance picoGym yang diotorisasi operator." };
}

/** Conservative detector used only to ask for confirmation in picoGym mode. */
export function commandTouchesNetwork(command: string): boolean {
  return /\b(?:nc|ncat|netcat|curl|wget|ssh|scp|sftp|git|nmap|telnet|ftp)\b|\b(?:python[0-9.]*|node)\b.*\b(?:socket|requests|urllib|fetch|http)\b/i.test(
    command,
  );
}

export function picoGymConfigSummary() {
  const config = getPicoGymNetworkConfig();
  return {
    platform: "picoCTF",
    environment: "picoGym",
    modeEnabled: config.enabled,
    strictEndpoints: config.strictEndpoints,
    requireNetworkConfirmation: config.requireNetworkConfirmation,
    authorizedHostCount: config.allowedHosts.length,
    authorizedPorts: config.allowedPorts,
    credentialSources: [] as string[],
  };
}
