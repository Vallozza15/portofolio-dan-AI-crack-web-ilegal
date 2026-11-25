import { guard, errorResponse, noStoreJson, readJson } from "@/lib/ctf/api";
import { CRYPTO_OPERATIONS, runOperation, runRecipe, type CryptoOperation, type CryptoStep } from "@/lib/ctf/crypto";

export async function POST(request: Request) {
  const blocked = await guard(request, "crypto", 90);
  if (blocked) return blocked;
  try {
    const body = await readJson<{
      input?: string;
      operation?: string;
      params?: Record<string, string | number | boolean>;
      steps?: CryptoStep[];
    }>(request);
    const input = String(body.input ?? "");
    if (input.length > 200_000) throw new Error("Input terlalu panjang (maks 200.000 karakter).");
    if (Array.isArray(body.steps)) {
      const steps = body.steps.slice(0, 30).map((step) => ({
        operation: step.operation,
        params: step.params || {},
      }));
      const invalid = steps.find((step) => !CRYPTO_OPERATIONS.includes(step.operation as CryptoOperation));
      if (invalid) throw new Error(`Operasi tidak valid: ${invalid.operation}`);
      return noStoreJson({ result: runRecipe(input, steps) });
    }
    const operation = String(body.operation || "") as CryptoOperation;
    if (!CRYPTO_OPERATIONS.includes(operation)) throw new Error("Operasi kriptografi tidak valid.");
    const result = runOperation(input, { operation, params: body.params || {} });
    return noStoreJson({ result });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
