import type { ChallengeCategory } from "./challenge-category";
import { categoryDisplayName, type ChallengeUnderstanding } from "./universal-understanding";

export type HypothesisStatus = "open" | "testing" | "supported" | "rejected" | "confirmed";
export type HypothesisConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ObservationInput {
  text: string;
  ok?: boolean;
}

export interface SolutionHypothesis {
  id: string;
  interpretation: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  requiredVerification: string;
  status: HypothesisStatus;
  confidence: HypothesisConfidence;
  score: number;
}

/**
 * Multi-strategy reasoning over real evidence.
 *
 * Every hypothesis is derived from an observed signal. The first hypothesis is
 * never automatically preferred: ranking uses evidence count, independence and
 * contradictions. Unsupported hypotheses stay LOW/open and are not executed.
 */
export class HypothesisReasoningEngine {
  build(understanding: ChallengeUnderstanding, observations: ObservationInput[] = []): SolutionHypothesis[] {
    const grouped = new Map<string, { category: string; signals: string[]; weight: number; sources: Set<string> }>();
    for (const item of understanding.classificationEvidence) {
      const key = item.category;
      const entry = grouped.get(key) || { category: key, signals: [], weight: 0, sources: new Set<string>() };
      entry.signals.push(`${item.signal} (${item.evidence})`);
      entry.weight += item.weight;
      entry.sources.add(item.evidence);
      grouped.set(key, entry);
    }

    const failed = observations.filter((item) => item.ok === false).map((item) => item.text.slice(0, 200));
    const succeeded = observations.filter((item) => item.ok !== false).map((item) => item.text.slice(0, 200));
    const hypotheses = [...grouped.values()].map((entry, index) => {
      const support = [...new Set(entry.signals)].slice(0, 6);
      const contradictions = failed.filter((item) => this.mentionsCategory(item, entry.category));
      const score = entry.weight + Math.min(entry.sources.size, 4) * 1.5 - contradictions.length * 2;
      const isTopCategory = entry.category === understanding.category;
      if (contradictions.length > support.length) {
        return this.make(index, entry.category, support, contradictions, score, "rejected", "LOW");
      }
      if (support.length >= 2 && entry.sources.size >= 2) {
        return this.make(index, entry.category, support, contradictions, score, "supported", "HIGH");
      }
      return this.make(index, entry.category, support, contradictions, score, "open", isTopCategory ? "MEDIUM" : "LOW");
    });

    if (succeeded.length && !hypotheses.length) {
      hypotheses.push({
        id: "hyp_obs_1",
        interpretation: "Output terminal nyata menunjukkan jalur analisis yang belum terklasifikasi.",
        supportingEvidence: succeeded.slice(0, 4),
        contradictingEvidence: [],
        requiredVerification: "Klasifikasi ulang dengan bukti tambahan sebelum menarik kesimpulan.",
        status: "open",
        confidence: "LOW",
        score: 1,
      });
    }
    return hypotheses.sort((a, b) => b.score - a.score);
  }

  private mentionsCategory(text: string, category: string): boolean {
    const needles: Record<string, RegExp> = {
      cryptography: /base64|xor|rot13|cipher|decode/i,
      steganography: /zsteg|steghide|lsb|exif/i,
      "digital-forensics": /binwalk|vol|strings|carve/i,
      "reverse-engineering": /gdb|r2|objdump|ghidra/i,
      "binary-exploitation": /checksec|overflow|rop|gdb/i,
      "web-security": /curl|http|cookie|sql/i,
      "network-analysis": /tshark|tcpdump|pcap|nc\b/i,
      osint: /whois|dig|rdap/i,
      programming: /python3|gcc|node\b/i,
      miscellaneous: /./,
    };
    return Boolean(needles[category]?.test(text));
  }

  private make(
    index: number,
    category: string,
    support: string[],
    contradictions: string[],
    score: number,
    status: HypothesisStatus,
    confidence: HypothesisConfidence,
  ): SolutionHypothesis {
    const label = categoryDisplayName(category as ChallengeCategory) || category;
    return {
      id: `hyp_${index + 1}`,
      interpretation: `Kategori ${label}: jalur ini didukung sinyal yang teramati dan perlu diuji dengan perintah nyata.`,
      supportingEvidence: support,
      contradictingEvidence: contradictions,
      requiredVerification: "Jalankan perintah paling informatif untuk kategori ini, lalu bandingkan output dengan format flag dan indikator server.",
      status,
      confidence,
      score: Number(score.toFixed(2)),
    };
  }
}
