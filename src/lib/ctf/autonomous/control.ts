/**
 * Per-session cancellation registry for autonomous remote execution.
 * A request can be stopped by the UI even when the NDJSON stream is still open.
 */

const controllers = new Map<string, AbortController>();

export function beginAutonomousRun(sessionId: string): AbortController {
  controllers.get(sessionId)?.abort();
  const controller = new AbortController();
  controllers.set(sessionId, controller);
  return controller;
}

export function getAutonomousController(sessionId: string): AbortController | undefined {
  return controllers.get(sessionId);
}

export function stopAutonomousRun(sessionId: string): boolean {
  const controller = controllers.get(sessionId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function endAutonomousRun(sessionId: string, controller: AbortController): void {
  if (controllers.get(sessionId) === controller) controllers.delete(sessionId);
}

export function combineSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}
