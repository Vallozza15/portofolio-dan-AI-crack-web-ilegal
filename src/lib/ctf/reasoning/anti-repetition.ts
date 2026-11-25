import type { RepetitionAnalysis } from "./types";

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function embedText(value: string): Map<string, number> {
  const text = normalizeText(value);
  const weights = new Map<string, number>();

  const add = (key: string, weight: number) => {
    weights.set(key, (weights.get(key) ?? 0) + weight);
  };

  for (const match of text.matchAll(/[a-z0-9]+/g)) {
    const word = match[0];
    if (word.length >= 3) add(`w:${word}`, 2);
  }

  for (let index = 0; index + 4 <= text.length; index += 1) {
    add(`g:${text.slice(index, index + 4)}`, 1);
  }

  let squared = 0;
  for (const weight of weights.values()) squared += weight * weight;
  if (squared === 0) return weights;

  const norm = Math.sqrt(squared);
  for (const [key, weight] of weights) weights.set(key, weight / norm);
  return weights;
}

export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const small = a.size <= b.size ? a : b;
  const large = a.size <= b.size ? b : a;
  let dot = 0;
  for (const [key, weight] of small) {
    const other = large.get(key);
    if (other !== undefined) dot += weight * other;
  }
  if (!Number.isFinite(dot)) return 0;
  return Math.max(0, Math.min(1, dot));
}

export function normalizeCommand(command: string): string {
  let value = command.toLowerCase().replace(/\s+/g, " ").trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const quote of ['"', "'", "`"]) {
      if (value.length >= 2 && value.startsWith(quote) && value.endsWith(quote)) {
        value = value.slice(1, -1).trim();
        changed = true;
      }
    }
  }
  return value;
}

export function analyzeRepetition(input: {
  proposed: string;
  previousAnswers: string[];
  previousCommands: string[];
  failedCommands?: string[];
  threshold?: number;
  essential?: boolean;
}): RepetitionAnalysis {
  const threshold =
    typeof input.threshold === "number" && Number.isFinite(input.threshold) ? input.threshold : 0.82;
  const proposedEmbedding = embedText(input.proposed);
  const proposedText = normalizeText(input.proposed);

  let similarity = 0;
  const repeatedAnswerIndexes: number[] = [];
  for (let index = 0; index < input.previousAnswers.length; index += 1) {
    const score = cosineSimilarity(proposedEmbedding, embedText(input.previousAnswers[index]));
    similarity = Math.max(similarity, score);
    if (score >= threshold) repeatedAnswerIndexes.push(index);
  }

  const failureCounts = new Map<string, number>();
  for (const raw of input.failedCommands ?? []) {
    const command = normalizeCommand(raw);
    if (!command) continue;
    failureCounts.set(command, (failureCounts.get(command) ?? 0) + 1);
  }

  const duplicateCommands: string[] = [];
  const seenCommands = new Set<string>();
  for (const raw of input.previousCommands) {
    const command = normalizeCommand(raw);
    if (!command || seenCommands.has(command)) continue;
    const failedTwice = (failureCounts.get(command) ?? 0) > 1;
    if (proposedText.includes(command) || failedTwice) {
      seenCommands.add(command);
      duplicateCommands.push(command);
    }
  }

  const hasRepetition = repeatedAnswerIndexes.length > 0 || duplicateCommands.length > 0;
  let note: string;
  if (hasRepetition && repeatedAnswerIndexes.length > 0 && duplicateCommands.length > 0) {
    note = "Jawaban terlalu mirip dan perintah lama diulang tanpa informasi baru.";
  } else if (repeatedAnswerIndexes.length > 0) {
    note = "Jawaban terlalu mirip dengan jawaban sebelumnya.";
  } else if (duplicateCommands.length > 0) {
    note = "Perintah yang sama sudah dicoba atau gagal sebelumnya.";
  } else {
    note = "Tidak ada pengulangan yang berarti terdeteksi.";
  }

  const essential = input.essential === true;
  return {
    similarity,
    repeatedAnswerIndexes,
    duplicateCommands,
    isUnnecessary: essential ? false : hasRepetition,
    mustReferencePrevious: similarity >= threshold && !essential,
    note,
  };
}
