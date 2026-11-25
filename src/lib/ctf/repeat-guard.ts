/**
 * Bounded repetition guard for the autonomous Kali agent.
 *
 * The same normalized command may be executed at most `max` times. The next
 * request returns "restart" and clears the counter, so the caller can begin
 * again from the first command of its plan.
 */
export class RepeatGuard {
  private attempts = new Map<string, number>();
  private restartCount = 0;

  constructor(private readonly max = 5) {}

  get cycles(): number {
    return this.restartCount;
  }

  check(command: string): "run" | "restart" {
    const key = command.replace(/\s+/g, " ").trim().toLowerCase();
    const count = this.attempts.get(key) || 0;
    if (count >= Math.max(1, this.max)) {
      this.attempts.clear();
      this.restartCount += 1;
      return "restart";
    }
    this.attempts.set(key, count + 1);
    return "run";
  }
}
