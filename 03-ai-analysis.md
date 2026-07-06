# 03 — AI Analysis Layer (Claude API)

**Goal:** Turn the fact sheet from Layer 2 into warm, specific, readable coaching. One API call per analysis, aggressively cached.

## Runtime model routing (this is where the money is)

Pricing (per MTok, standard, verified 2026-07-06 against the Claude platform docs — model IDs are exact API strings, no date suffixes):

| Model | ID | Input | Output | Use for |
|---|---|---|---|---|
| Haiku 4.5 | `claude-haiku-4-5` | $1 | $5 | **Default for all user-facing analyses** |
| Sonnet 5 | `claude-sonnet-5` | $3 ($2 intro through 2026-08-31) | $15 ($10 intro) | Premium/complex path only |
| Opus 4.8 | `claude-opus-4-8` | $5 | $25 | **Never at runtime.** Offline content generation only |

(Claude Fable 5 exists above Opus at $10/$50 — irrelevant here, never use it in this product. "Sonnet 4.6" from earlier drafts is superseded by Sonnet 5.)

Discounts: Batch API = 50% off. Prompt cache reads ≈ 0.1x input price (~90% off); cache writes cost 1.25x (5-min TTL).

Routing rules:
1. **Single-match analysis → Haiku 4.5.** The hard reasoning already happened in the stats engine; Haiku is excellent at "structured facts → fluent prose" and is 5x cheaper than Sonnet.
2. **20-game trend analysis → Sonnet 5.** Cross-game pattern narration benefits from more reasoning; it's also generated at most once per user per day.
3. **Static tips library → Opus, offline, via Batch API.** Generate the champion/role tip snippets once per patch as a batch job (50% discount), review, store in DB. Runtime then serves them for free.
4. **Fallback:** if Haiku output fails JSON validation twice, retry once on Sonnet, log it.

## Prompt design

- **System prompt (identical for every call → prompt caching, ~90% off cached reads).** ⚠️ Caching gotcha: on Haiku 4.5 the **minimum cacheable prefix is 4096 tokens** — a ~700-token system prompt silently won't cache (no error, just `cache_creation_input_tokens: 0`). Either bundle enough static content into the system prompt to clear 4096 tokens (persona + full output schema + style rules + 2–3 few-shot example fact-sheet→output pairs — the examples also improve quality), or skip caching and eat ~$0.0007/call of uncached input; both are fine, but don't ship a `cache_control` marker that never hits. Contents: persona ("experienced LoL coach, encouraging but direct"), output JSON schema, style rules (address the player as "you", every claim must cite a number from the fact sheet, no invented stats, no generic filler like "ward more"), rank-adaptation rule (Iron/Bronze advice = fundamentals; Diamond+ = nuance).
- **User message:** the fact sheet JSON only.
- **Output (strict JSON, validated):**

```json
{
  "headline": "one-sentence game summary",
  "strengths": [{"title":"","body":"","metric_refs":["strong_teamfighting"]}],
  "improvements": [{"title":"","body":"","priority":1,"metric_refs":["early_deaths_to_ganks"]}],
  "tips": [{"body":"","tag":"vision"}],
  "focus_next_game": "single most impactful thing"
}
```

- `metric_refs` must match finding IDs from the input — reject and retry if the model references a finding that wasn't provided (hallucination guard).
- Version prompts (`promptVersion` in the cache key). Changing the prompt invalidates cache going forward only.
- `max_tokens`: 1200 single match, 2000 trend.

## Cost math (why this is safe for an ads-funded site)

Single-match on Haiku, worst case (system prompt below cache minimum, fully uncached): ~2.2K input + ~900 output ≈ $0.0022 + $0.0045 ≈ **~$0.007 per analysis**; with a cache-eligible (≥4096-token) system prompt, ~$0.005–0.006. Either way: once ever per match.
100,000 fresh analyses/month ≈ **~$500–700/month**, and far less in practice because of the permanent cache and repeat views costing $0.

Guardrails:
- Permanent cache on `(puuid, matchId, type, promptVersion)` — a finished match never changes.
- Per-IP/per-session daily analysis budget (e.g., 10 fresh analyses/day for anonymous users) to stop scraping abuse.
- Log `tokens_in/tokens_out/cost_usd` per analysis row; alert if daily spend > threshold.
- If ads RPM ≈ $1–3 per 1,000 pageviews, one fresh analysis (~$0.005) is covered by ~2–5 ad impressions — and cached views are pure margin. Keep this ratio in a dashboard.

## API integration notes

- Use the official TypeScript SDK (`@anthropic-ai/sdk`), server-side only; key in env/secret manager, never in client code. Use the exact model ID strings from the table above.
- Use prompt caching (`cache_control` on the system prompt block) — only effective once the system prompt clears Haiku's 4096-token minimum (see above). Verify with `usage.cache_read_input_tokens > 0` in cost logs.
- Timeout 30s, single retry; on total failure show the stats-engine findings raw (the feature degrades gracefully to a non-LLM "scorecard" view).
- Respect Anthropic rate limits; queue trend analyses.

## Definition of done

- [ ] `analyzeMatch(factSheet)` service with model routing, caching, JSON validation, hallucination guard
- [ ] Prompt v1 for single-match + trend (have an Opus-driven Claude Code agent review prompt wording once)
- [ ] Batch job generating patch tips library on Opus (Batch API)
- [ ] Cost logging + daily spend alert
- [ ] Graceful degradation path (scorecard without prose)
