# Focused practice design decisions

Agent note: after implementing any focused-practice change, update this file and `plan for focused practice.md`.

- Stats live in `userPracticeStats`, not user docs, to keep user reads small.
- `practiceStats` is accepted on `CompletedEvent` but omitted by `buildDbResult`, so normal result docs stay unchanged.
- Collection key is `{ uid, language, type, key }`; no buckets for mode, punctuation, numbers, or mode2.
- Initial collection only runs for generated `time`/`words` tests with punctuation/numbers off and no word-mutating funbox.
- Words are lowercased, common punctuation stripped, and digit-containing keys skipped.
- Per-result aggregate payload is capped at 200 words and 200 biwords.
- Biword misses follow current-word miss. Burst uses current-word burst.
- Focused practice uses custom mode with pipe delimiter and shuffle, matching existing practice words behavior.
- Focused practice sessions feed stats back at a dampened weight (default 0.5), separate from the repeated-test weight. Filler words are dampened identically; biwords spanning practice + filler are not disentangled (accept the noise — see "Stats from focused practice runs" in the plan).
- Decay is lazy on update/query with 30-day half-life, rounded to 3 decimals.
- Scoring uses miss rate plus slow-burst score against the user's language baseline, plus a char-affinity term, with a recency multiplier on the base: `score = confidence × (0.7·missRate + 0.3·slowScore) × recency + 0.15·charAffinity`. Recency = `1 + 0.5 × max(0, 1 - daysSincePeak/30)` — freshly identified peaks get up to 50% boost, fading linearly to baseline at 30 days. Char affinity is the mean normalized substitution weight across an item's alpha chars (max-normalized over all target chars). Affinity bypasses confidence and recency so items composed of the user's known-bad keys can enter the pool even with low miss rate.
- Query returns all qualifying items (score > 0), sorted by score descending; long tail is naturally low-probability via score-weighted sampling.
- Session pool is built by score-weighted sampling with replacement: `focusedPracticeWordCount` total words, split evenly between words and biwords for the practice fraction, with filler words filling the remainder at probability `focusedPracticeFillerProbability`. Session limit equals word count exactly.
- Entry points are the global commandline `Focused practice` command and the existing result-screen practice command subgroup as `focused`.
- The global entry point is always visible and always starts a session. If there's no qualifying data, the session bootstraps from filler and a one-line notice is shown. Unfilled practice slots in either category backfill into filler so total session length always equals `focusedPracticeWordCount`.
- Filler is sampled Zipf-weighted (using `zipfyRandomArrayIndex`) from the full language word list when `language.orderedByFrequency` is true; otherwise uniform over the first 100 words as a fallback.
