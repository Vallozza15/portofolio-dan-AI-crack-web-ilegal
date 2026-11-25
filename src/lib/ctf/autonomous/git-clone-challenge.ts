/**
 * Builds a bounded `git clone` command for SSH challenge repositories. The URL
 * is assembled from validated parts only, and host-key checking stays enabled
 * with a persistent known_hosts file inside the disposable /work directory.
 */

export interface GitCloneTarget {
  host: string;
  port: number;
  username?: string;
  path: string;
}

export function buildGitCloneCommand(target: GitCloneTarget): string {
  const host = target.host.trim().toLowerCase();
  const username = (target.username || "git").trim();
  const path = target.path.trim();
  const port = Number(target.port);

  if (!host || host.length > 253 || !/^[a-z0-9.-]+$/i.test(host)) {
    throw new Error("Host git tidak valid.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port git tidak valid.");
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) {
    throw new Error("Username git tidak valid.");
  }
  if (!/^\/[A-Za-z0-9._~+\/-]+$/.test(path) || path.includes("..")) {
    throw new Error("Path repository git tidak valid.");
  }

  const url = `ssh://${username}@${host}:${port}${path}`;
  return [
    "mkdir -p /work/.ssh 2>/dev/null || true",
    "rm -rf /work/challenge 2>/dev/null || true",
    `GIT_SSH_COMMAND='ssh -o UserKnownHostsFile=/work/.ssh/known_hosts -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=15'`,
    "GIT_TERMINAL_PROMPT=0",
    `git clone '${url}' /work/challenge`,
  ].join("; ");
}
