# Focused practice plan

## Goal

Persist enough per-result typing detail to build long-term weak-word and weak-combo stats, then generate targeted practice through existing custom mode.

## Product direction

- Generate practice via custom mode first.
- Collect stats from generated wordlists, including repeated tests at reduced weight.
- Do not collect stats from stats-generated practice.
- Ignore punctuation and numbers when bucketing stats.
- Decay old data so practice adapts over time.
- Make repeated-test contribution weight configurable in settings.

## Current state

- Status: core implementation is in place; test coverage is partial.
- Persisted results are aggregate: wpm, raw, acc, charStats, chartData, key timing summaries.
- Frontend transient data is richer: target words, typed input, missedWords, burstHistory, errorHistory.
- Existing result-screen practice already uses transient missed words, missed biwords, and slow words.
- Long-term focus needs a compact persisted aggregate, not full input histories.

## Agent instructions

- After implementing any focused-practice change, update this file and `focused practice design decisions.md`.
- Keep status/checklists current: mark what shipped, what changed, and what remains.

## Implementation status

Implemented:

- `CompletedEvent.practiceStats` schema and bounded payload entries.
- `GET /users/practiceStats` and `POST /users/practiceStats` contracts/routes/controllers.
- `userPracticeStats` DAL with lazy decay, weighted updates, clamped weight, and focus-item scoring.
- Normal result save updates practice stats and does not store `practiceStats` on result docs.
- Repeated tests can submit stats-only updates without inserting normal results.
- Frontend collector builds word/biword aggregates from generated `time`/`words` tests.
- Collection skips punctuation, numbers, word-mutating funboxes, and focused-practice sessions.
- Repeated-test weight setting exists with default `0.25` and schema range `0..1`.
- Focused-practice generator fetches focus items, builds custom-mode pipe-delimited shuffled text, adds filler, and marks the session active.
- Result-screen commandline entry point exists as `focused practice`.
- Global commandline entry point exists as `Focused practice` because focused practice uses historical data, not the latest result.
- Backend DAL tests cover repeated-key increments, weight scaling/clamping, decay, and scoring.

Not implemented / still needed:

- Frontend unit tests for collector eligibility, weighted repeated tests, disabled repeated contribution, focused-practice exclusion, word aggregation, and biword aggregation.
- Backend/controller or integration tests proving normal result save updates aggregates and stats-only updates insert no result.
- Explicit test that `practiceStats` is omitted from persisted result documents.
- Contract/schema tests for bounded `practiceStats` and focus endpoint response.
- Opportunistic pruning for tiny/old `userPracticeStats` docs.

## Data model

Backend collection exists, not a large user-document field.

Collection: `userPracticeStats`

Suggested document shape:

```ts
type UserPracticeStat = {
  uid: string;
  language: string;
  type: "word" | "biword";
  key: string;
  attempts: number;
  misses: number;
  burstSum: number;
  burstCount: number;
  lastSeen: number;
  decayedAt: number;
};
```

Unique index:

```ts
{ uid: 1, language: 1, type: 1, key: 1 }
```

Bucket only by language. Do not split by punctuation, numbers, mode, or mode2.

## Per-result payload

Add optional `practiceStats` to `CompletedEvent`.

Do not store this field on normal result documents. Use it only during result save to update `userPracticeStats`, then drop it.

For repeated tests, do not save a normal result. Submit the same compact payload through a stats-only update path when repeated-test weight is greater than 0.

Suggested shape:

```ts
type CompletedEventPracticeStats = {
  source: "generated";
  language: string;
  weight?: number;
  words: PracticeStatEntry[];
  biwords: PracticeStatEntry[];
};

type PracticeStatEntry = {
  key: string;
  attempts: number;
  misses: number;
  burstSum: number;
  burstCount: number;
};
```

## Frontend collection

Build `practiceStats` from existing transient data at result completion.

Only collect when all are true:

- mode is `time` or `words`
- active text came from generated wordlist
- not custom
- not quote
- not zen
- not focused-practice/custom-generated-from-stats
- no funbox that mutates words, if easy to detect

Repeated tests:

- collect stats, but scale attempts, misses, burstSum, and burstCount by a repeated-test weight
- default repeated-test weight: 0.25
- normal generated tests use weight 1
- setting should allow disabling repeated-test contribution by setting weight to 0
- repeated tests stay invalid for normal result/PB/history saving
- when repeated-test weight > 0, submit focused-practice stats even though the result is not saved

Word stats:

- attempted word = target word index typed before result ended
- miss = target word was included in `missedWords` or typed input did not equal target
- burst = `burstHistory[index]` when present and positive

Biword stats:

- key = previous target word + space + current target word
- attempt when current word attempted and previous target exists
- miss if current word missed
- burst can use current word burst initially

Cap payload size:

- include only words/biwords actually attempted in that test
- aggregate duplicates inside the test before sending
- enforce schema max counts to prevent oversized payloads

## Decay

Use lazy decay on update/query rather than cron initially.

Decay formula:

```ts
decay = Math.pow(0.5, daysSinceDecayedAt / halfLifeDays);
```

Suggested half-life: 30 days.

Before applying increments:

- multiply attempts, misses, burstSum, burstCount by decay
- multiply new increments by payload weight
- add weighted new increments
- set `decayedAt` and `lastSeen`

Clamp payload weight server-side to 0-1.

Keep fractional stored counters or round to 3 decimals. Do not round to integers after decay.

Prune tiny/old docs opportunistically:

- if attempts < 0.05 and not seen recently, delete
- or add later maintenance job if collection grows too much

## Scoring

Backend endpoint returns top focus items for the current language.

Score should prefer:

- high miss rate
- slow average burst compared to user's baseline
- enough attempts to be meaningful
- recent evidence

Initial simple score:

```ts
missRate = misses / attempts;
avgBurst = burstSum / burstCount;
slowScore = baselineBurst > 0 ? Math.max(0, (baselineBurst - avgBurst) / baselineBurst) : 0;
confidence = Math.min(1, attempts / 8);
score = confidence * (missRate * 0.7 + slowScore * 0.3);
```

Baseline can be user's average burst for same language if available, otherwise use result raw/wpm fallback or omit slowScore at first.

Minimums:

- attempts >= 3 for words
- attempts >= 2 for biwords

## API

Add endpoint under users or practice namespace:

```http
GET /users/practiceStats?language=english
```

If repeated tests remain invalid for normal result saving, also add a stats-only update endpoint:

```http
POST /users/practiceStats
```

Request body:

```ts
CompletedEventPracticeStats
```

Use the same auth and validation as result save, but only update `userPracticeStats`; never insert a result.

Response:

```ts
{
  words: FocusItem[];
  biwords: FocusItem[];
}

type FocusItem = {
  key: string;
  type: "word" | "biword";
  attempts: number;
  misses: number;
  averageBurst?: number;
  score: number;
};
```

Return enough items for generation, not the whole stat table.

## Practice generation

Use custom mode with pipe delimiter, following existing `practise-words.ts`.

Generation v1:

- fetch focus words and biwords
- build custom text sections
- weight by score
- include some normal language words as filler
- set custom mode to shuffle
- set pipe delimiter true
- set limit mode section
- mark session as focused practice so it does not feed back into stats

Suggested custom text:

- top 10 words repeated/weighted
- top 10 biwords as pipe sections
- 20-30% filler from active language wordlist

## UX

Add low-blast-radius entry points first:

- result screen command: focused practice
- global commandline command: Focused practice
- commandline list item near existing practice words actions

If user has insufficient data:

- show notice
- optionally fall back to current missed/slow word practice for the latest result

Avoid a new typing mode until the behavior is proven.

Settings:

- add focused practice repeated-test weight
- suggested control: numeric stepper or slider from 0 to 1
- default: 0.25
- copy should make clear this affects focused practice data only, not saved results/PBs

## Implementation steps

1. [x] Add schemas for `CompletedEventPracticeStats` and API response.
2. [x] Add repeated-test contribution setting.
3. [x] Add frontend collector near result completion.
4. [x] Add focused-practice session flag so generated practice results are excluded from collection.
5. [x] Add DAL collection helpers: update aggregates with lazy decay, query focus items.
6. [x] Call aggregate update during normal result save after validation, before/near normal result insert.
7. [x] Add stats-only update path for repeated tests so no result is inserted.
8. [x] Add GET endpoint for focus items.
9. [x] Add frontend generator that fetches focus items and starts custom mode.
10. [x] Add commandline/result-screen entry points.
11. [ ] Add remaining tests.

## Tests

Frontend:

- [ ] collector includes only generated wordlist tests
- [ ] repeated generated tests emit weighted practiceStats when setting > 0
- [ ] repeated generated tests emit no practiceStats when setting is 0
- [ ] custom/focused practice does not emit practiceStats
- [ ] missed and slow words aggregate correctly
- [ ] biwords use previous + current target words

Backend:

- [ ] result save updates aggregate docs
- [ ] repeated stats-only update updates aggregate docs but inserts no result
- [x] repeated saves increment same keys
- [x] payload weight scales attempts, misses, burstSum, and burstCount
- [x] payload weight is clamped to 0-1
- [x] decay is applied before increment
- [x] query returns scored top words/biwords
- [ ] practiceStats is not persisted on result documents

Contract/schema:

- [ ] completed event accepts bounded optional practiceStats
- [ ] focus endpoint validates response

## Open questions

- Exact repeated-test UI step size is not documented in the plan.
- Stats-only update rate-limit behavior still needs explicit confirmation/documentation.
