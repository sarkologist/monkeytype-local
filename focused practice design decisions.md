# Focused practice design decisions

- Stats live in `userPracticeStats`, not user docs, to keep user reads small.
- `practiceStats` is accepted on `CompletedEvent` but omitted by `buildDbResult`, so normal result docs stay unchanged.
- Collection key is `{ uid, language, type, key }`; no buckets for mode, punctuation, numbers, or mode2.
- Initial collection only runs for generated `time`/`words` tests with punctuation/numbers off and no word-mutating funbox.
- Words are lowercased, common punctuation stripped, and digit-containing keys skipped.
- Per-result aggregate payload is capped at 200 words and 200 biwords.
- Biword misses follow current-word miss. Burst uses current-word burst.
- Focused practice uses custom mode with pipe delimiter and shuffle, matching existing practice words behavior.
- Focused practice sessions set a frontend flag and use custom mode, so generated practice does not feed stats.
- Decay is lazy on update/query with 30-day half-life, rounded to 3 decimals.
- Scoring uses miss rate plus slow-burst score against the user's language baseline.
- Query returns top 30 words and top 30 biwords, enough for generation without exposing the whole table.
- Filler comes from the active language's first 100 words, capped around 30% of focused items.
- Entry point is the existing result-screen practice command subgroup as `focused`.
