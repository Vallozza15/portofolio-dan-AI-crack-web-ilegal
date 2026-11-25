import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { dnsRecon, domainRecon, rdapDomain, usernameRecon } from "@/lib/ctf/osint";
import { inspectTls } from "@/lib/ctf/http";

export async function POST(request: Request) {
  const blocked = await guard(request, "osint", 20);
  if (blocked) return blocked;
  try {
    const body = await readJson<{ action?: string; value?: string }>(request);
    const action = String(body.action || "domain");
    const value = String(body.value || "").trim();
    if (!value) throw new Error("Nilai OSINT wajib diisi.");
    if (value.length > 253) throw new Error("Nilai terlalu panjang.");
    switch (action) {
      case "dns":
        return noStoreJson({ action, result: await dnsRecon(value) });
      case "rdap":
        return noStoreJson({ action, result: await rdapDomain(value) });
      case "tls": {
        const host = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "").split(":")[0];
        return noStoreJson({ action, result: await inspectTls(host, 443) });
      }
      case "username":
        return noStoreJson({ action, result: await usernameRecon(value) });
      case "domain":
        return noStoreJson({ action, result: await domainRecon(value) });
      default:
        throw new Error("Aksi OSINT tidak dikenal. Gunakan domain, dns, rdap, tls, atau username.");
    }
  } catch (error) {
    return errorResponse(error, 400);
  }
}
