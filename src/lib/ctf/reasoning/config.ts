/**
 * Configurable limits for the adaptive reasoning engine.
 *
 * Values are read once per process. Every value is clamped so a malformed
 * environment variable cannot turn the solver into an unbounded loop.
 */
function numberEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export const REASONING_LIMITS = {
  /** High-level reasoning/self-verification rounds per request. */
  maxIterations: numberEnv("CTF_REASONING_MAX_ITERATIONS", 8, 1, 50),
  /** Alternative strategies offered to the planner per round. */
  maxStrategies: numberEnv("CTF_REASONING_MAX_STRATEGIES", 5, 1, 20),
  /** Identical command executions. 0 means skip duplicates unless justified. */
  maxRepeatedCommands: numberEnv("CTF_REASONING_MAX_REPEATED_COMMANDS", 0, 0, 10),
  /** Explicit verification attempts before the answer must be reported as incomplete. */
  maxVerificationAttempts: numberEnv("CTF_REASONING_MAX_VERIFICATION_ATTEMPTS", 3, 1, 10),
  /** Semantic similarity threshold for answer repetition detection. */
  similarityThreshold: (() => {
    const parsed = Number(process.env.CTF_REASONING_SIMILARITY_THRESHOLD);
    if (!Number.isFinite(parsed)) return 0.82;
    return Math.max(0.5, Math.min(0.99, parsed));
  })(),
} as const;

export const REASONING_CONFIG_NOTE = [
  `iterasi=${REASONING_LIMITS.maxIterations}`,
  `strategi=${REASONING_LIMITS.maxStrategies}`,
  `perintah-identik=${REASONING_LIMITS.maxRepeatedCommands}`,
  `verifikasi=${REASONING_LIMITS.maxVerificationAttempts}`,
  `kemiripan=${REASONING_LIMITS.similarityThreshold}`,
].join(", ");
