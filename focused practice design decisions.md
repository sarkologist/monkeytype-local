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
- Scoring uses miss rate plus slow-burst score against the user's language baseline, plus a char-affinity term, with recency and evidence multipliers on the base: `score = confidence × (0.7·missRate + 0.3·slowScore) × recency × evidence + 0.15·charAffinity`. Confidence ramps `min(1, attempts/8)`; recency = `1 + 0.5 × max(0, 1 - daysSincePeak/30)`; evidence = `min(2, 1 + 0.5·log10(attempts/8))` — items with more accumulated attempts at the same rate rank higher (8 attempts → 1.0×, 80 → 1.5×, 800 → capped 2.0×). Char affinity is the mean normalized substitution weight across an item's alpha chars (max-normalized over all target chars). Affinity bypasses confidence/recency/evidence so items composed of the user's known-bad keys can enter the pool even with low miss rate.
- Query returns all qualifying items (score > 0), sorted by score descending; long tail is naturally low-probability via score-weighted sampling.
- Session pool is built by score-weighted sampling with replacement: `focusedPracticeWordCount` total words, split evenly between words and biwords for the practice fraction, with filler words filling the remainder at probability `focusedPracticeFillerProbability`. Session limit equals word count exactly.
- Retention interleaving: graduated items (those that previously hit `peakMissRate ≥ 10%` and are now `< 5%`) are returned alongside struggle items in `retentionWords`/`retentionBiwords` with score = peakMissRate. Frontend allocates 10% of word/biword practice slots to retention (or all slots if no struggle items exist). When no graduated items exist, retention quota collapses and full quota goes to struggle. Lets us test retention without re-creating struggle.
- Entry points are the global commandline `Focused practice` command and the existing result-screen practice command subgroup as `focused`.
- The global entry point is always visible and always starts a session. If there's no qualifying data, the session bootstraps from filler and a one-line notice is shown. Unfilled practice slots in either category backfill into filler so total session length always equals `focusedPracticeWordCount`.
- Filler is sampled Zipf-weighted (using `zipfyRandomArrayIndex`) from the full language word list when `language.orderedByFrequency` is true; otherwise uniform over the first 100 words as a fallback.
