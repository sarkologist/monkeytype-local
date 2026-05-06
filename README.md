# Monkeytype, locally improved

A self-hosted fork of [Monkeytype](https://monkeytype.com) — same minimalist typing test you know, with one big addition: **focused practice**, a stats-driven engine that finds your weak words and drills them.

Run it on your own machine, against your own database. Your typing data stays yours.

# Why this fork

Vanilla Monkeytype tells you how fast you type. It doesn't tell you _which_ words and transitions are dragging you down — and it certainly doesn't generate practice sessions targeting them. This fork does.

# Focused practice

Every generated test silently logs per-word and per-biword (two-word transition) data: misses, slow bursts, the works. Over time that builds a personal weakness profile, scored against your language baseline. One commandline action turns that profile into a tailored drill.

How it works:

- **Passive collection.** While you take normal `time` / `words` tests, the collector records misses and slow bursts per word and per word pair. Capped at 200 words / 200 biwords per result so it stays cheap.
- **Smart scoring.** Each word/biword gets a score combining miss rate and slow-burst delta vs. your baseline. Scores decay with a 30-day half-life so old struggles fade as you improve.
- **Weighted sampling.** A focused session draws from your full weak-item pool by score. High-score items appear often; the long tail still shows up occasionally so nothing gets ignored forever.
- **Configurable mix.** Set the session length (10–100 words) and the filler probability (0–1) — filler is Zipf-sampled common words to keep sessions feeling natural. Practice runs feed back into stats at a dampened weight (default 0.5) so the loop self-corrects.
- **Profile view.** The account page shows your current weak words, biwords, miss rate, and average burst, with a "load more" tail.

Trigger it from the commandline (`Focused practice`) or from the result screen's practice subgroup. Bootstraps from filler on a fresh account so it always works.

See `focused practice design decisions.md` for the full design.

# Everything else from upstream

- Minimal design, optional focus mode
- Type what you see, see what you type
- Live errors, WPM, accuracy
- Many test lengths and languages
- Punctuation, numbers, quotes
- Themes, smooth caret, sounds
- Account system with history
- Challenges and funbox modifiers

# Running locally

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for the dev setup. The standard Monkeytype stack — Firebase for auth, MongoDB for data, Redis for queues — runs fine on a single machine via the provided Docker compose files in `docker/`.

# Stack

TypeScript across the board. SolidJS (with Tailwind) for new frontend components, vanilla JS for legacy. Express + ts-rest + Zod on the backend. PNPM + Turborepo + Vite + Vitest for build and test.

# Credits

Forked from [monkeytypegame/monkeytype](https://github.com/monkeytypegame/monkeytype). All upstream contributors deserve the credit for the typing test itself; this fork only adds the practice layer on top.

[Montydrei](https://www.reddit.com/user/montydrei) suggested the original name. The [original Reddit post](https://www.reddit.com/r/MechanicalKeyboards/comments/gc6wx3/experimenting_with_a_completely_new_type_of/) seeded the prototype. See [upstream contributors](https://github.com/monkeytypegame/monkeytype/graphs/contributors).

# License

Same as upstream — see [LICENSE](./LICENSE).
