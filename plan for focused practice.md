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

- Persisted results are aggregate: wpm, raw, acc, charStats, chartData, key timing summaries.
- Frontend transient data is richer: target words, typed input, missedWords, burstHistory, errorHistory.
- Existing result-screen practice already uses transient missed words, missed biwords, and slow words.
- Long-term focus needs a compact persisted aggregate, not full input histories.

## Data model

Add a backend collection, not a large user-document field.

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

1. Add schemas for `CompletedEventPracticeStats` and API response.
2. Add repeated-test contribution setting.
3. Add frontend collector near result completion.
4. Add focused-practice session flag so generated practice results are excluded from collection.
5. Add DAL collection helpers: update aggregates with lazy decay, query focus items.
6. Call aggregate update during normal result save after validation, before/near normal result insert.
7. Add stats-only update path for repeated tests so no result is inserted.
8. Add GET endpoint for focus items.
9. Add frontend generator that fetches focus items and starts custom mode.
10. Add commandline/result-screen entry point.
11. Add tests.

## Tests

Frontend:

- collector includes only generated wordlist tests
- repeated generated tests emit weighted practiceStats when setting > 0
- repeated generated tests emit no practiceStats when setting is 0
- custom/focused practice does not emit practiceStats
- missed and slow words aggregate correctly
- biwords use previous + current target words

Backend:

- result save updates aggregate docs
- repeated stats-only update updates aggregate docs but inserts no result
- repeated saves increment same keys
- payload weight scales attempts, misses, burstSum, and burstCount
- payload weight is clamped to 0-1
- decay is applied before increment
- query returns scored top words/biwords
- practiceStats is not persisted on result documents

Contract/schema:

- completed event accepts bounded optional practiceStats
- focus endpoint validates response

## Open questions

- Exact half-life: start with 30 days?
- Should funboxes that only change visuals still collect stats?
- Should biword miss count mean current word missed, either word missed, or combo typed incorrectly?
- Should filler words come from current language top words or random active wordlist?
- Exact repeated-test weight range/step: 0-1 by 0.05?
- Should repeated stats-only updates reuse result save rate limit or get a stricter one?
