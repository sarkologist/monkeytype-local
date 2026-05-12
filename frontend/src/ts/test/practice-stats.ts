import type { Config as ConfigSchema } from "@monkeytype/schemas/configs";
import type {
  CompletedEventPracticeStats,
  PracticeStatEntry,
} from "@monkeytype/schemas/results";

export type PracticeStatsConfig = Pick<
  ConfigSchema,
  | "mode"
  | "punctuation"
  | "numbers"
  | "language"
  | "focusedPracticeRepeatedTestWeight"
  | "focusedPracticeWeight"
>;

type BuildPracticeStatsOptions = {
  config: PracticeStatsConfig;
  focusedPracticeActive: boolean;
  isRepeated: boolean;
  hasWordMutatingFunbox: boolean;
  typedWords: readonly string[];
  targetWords: readonly (string | undefined)[];
  missedWords: Record<string, unknown>;
  burstHistory: readonly (number | undefined)[];
};

function normalizePracticeKey(word: string | undefined): string {
  return (word ?? "")
    .toLowerCase()
    .replace(/[.?!":\-,]/g, "")
    .trim();
}

function addPracticeEntry(
  entries: Map<string, PracticeStatEntry>,
  key: string,
  missed: boolean,
  burst: number,
): void {
  if (key === "" || /\d/.test(key)) return;

  const entry =
    entries.get(key) ??
    ({
      key,
      attempts: 0,
      misses: 0,
      burstSum: 0,
      burstSqSum: 0,
      burstCount: 0,
    } satisfies PracticeStatEntry);

  entry.attempts++;
  if (missed) entry.misses++;
  if (burst > 0) {
    entry.burstSum += burst;
    entry.burstSqSum = (entry.burstSqSum ?? 0) + burst * burst;
    entry.burstCount++;
  }
  entries.set(key, entry);
}

function collectCharSubstitutions(
  target: string,
  typed: string,
  counts: Map<string, { target: string; typed: string; count: number }>,
): void {
  const len = Math.min(target.length, typed.length);
  for (let i = 0; i < len; i++) {
    const t = target[i] as string;
    const k = typed[i] as string;
    if (t === k) continue;
    if (!/^[a-zÀ-ɏ]$/i.test(t)) continue;
    if (!/^[a-zÀ-ɏ]$/i.test(k)) continue;
    const id = `${t}>${k}`;
    const existing = counts.get(id);
    if (existing === undefined) {
      counts.set(id, { target: t, typed: k, count: 1 });
    } else {
      existing.count++;
    }
  }
}

export function buildPracticeStats({
  config,
  focusedPracticeActive,
  isRepeated,
  hasWordMutatingFunbox,
  typedWords,
  targetWords,
  missedWords,
  burstHistory,
}: BuildPracticeStatsOptions): CompletedEventPracticeStats | undefined {
  if (focusedPracticeActive) {
    if (config.mode !== "custom") return undefined;
    if (config.focusedPracticeWeight <= 0) return undefined;
  } else {
    if (!["time", "words"].includes(config.mode)) return undefined;
  }
  if (config.punctuation || config.numbers) return undefined;
  if (hasWordMutatingFunbox) return undefined;
  if (isRepeated && config.focusedPracticeRepeatedTestWeight <= 0) {
    return undefined;
  }

  if (typedWords.length === 0) return undefined;

  const words = new Map<string, PracticeStatEntry>();
  const biwords = new Map<string, PracticeStatEntry>();
  const chars = new Map<
    string,
    { target: string; typed: string; count: number }
  >();

  typedWords.forEach((typedWord, index) => {
    const target = normalizePracticeKey(targetWords[index]);
    const typed = normalizePracticeKey(typedWord);
    const missed = missedWords[target] !== undefined || typed !== target;
    const burst = burstHistory[index] ?? 0;

    addPracticeEntry(words, target, missed, burst);
    collectCharSubstitutions(target, typed, chars);

    if (index > 0) {
      const previous = normalizePracticeKey(targetWords[index - 1]);
      addPracticeEntry(biwords, `${previous} ${target}`, missed, burst);
    }
  });

  const practiceStats: CompletedEventPracticeStats = {
    source: "generated",
    language: config.language,
    words: [...words.values()].slice(0, 200),
    biwords: [...biwords.values()].slice(0, 200),
  };
  if (chars.size > 0) {
    practiceStats.chars = [...chars.values()].slice(0, 200);
  }
  if (isRepeated) {
    practiceStats.weight = config.focusedPracticeRepeatedTestWeight;
  } else if (focusedPracticeActive) {
    practiceStats.weight = config.focusedPracticeWeight;
  }
  return practiceStats;
}
