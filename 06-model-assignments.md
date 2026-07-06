# 06 — Claude Model Assignments (reference)

Principle: **cheapest model that reliably does the job.** The stats engine does the hard thinking deterministically, so most LLM work here is "structured facts → prose", which Haiku handles well.

Pricing per MTok (verified 2026-07-06; IDs are exact API strings):
Haiku 4.5 (`claude-haiku-4-5`) = $1/$5 · Sonnet 5 (`claude-sonnet-5`) = $3/$15 (intro $2/$10 through 2026-08-31) · Opus 4.8 (`claude-opus-4-8`) = $5/$25. Batch API = 50% off. Prompt cache reads ≈ 90% off (note: Haiku 4.5 needs a ≥4096-token prefix to cache at all — see 03-ai-analysis.md).

## A. Runtime (your website's API calls — this is recurring cost, be strict)

| Task | Model | Why |
|---|---|---|
| Single-match analysis prose | **Haiku 4.5** | High volume, small grounded input, formatting/fluency task. 5x cheaper than Sonnet |
| 20-game trend analysis | **Sonnet 5** | Cross-game pattern synthesis; low volume (≤1/user/day) |
| Retry after failed JSON validation (2x on Haiku) | Sonnet 5 | Rare fallback only |
| Anything else user-facing | Haiku 4.5 first; escalate only with measured quality failure | Default-down policy |

Never use Opus-class models at runtime. Always: prompt caching on the system prompt, permanent result cache, per-user quotas.

## B. Offline/batch jobs (run rarely — quality over cost, still use Batch API for 50% off)

| Task | Model | Cadence |
|---|---|---|
| Champion/role tips library (~170 champs x roles) | **Opus 4.8 via Batch API** | Once per patch (~2 weeks) |
| SEO insight-page copy from benchmark data | Sonnet 5 via Batch API | Once per patch |
| Prompt quality review / red-teaming analysis outputs | Opus 4.8 | On prompt version change |
| Trigger-rule threshold sanity review (given benchmark distributions) | Opus 4.8 | Quarterly |

## C. Claude Code agents building the feature (dev-time cost)

| Build task | Agent model | Rationale |
|---|---|---|
| Architecture review of this plan, stats-engine metric & trigger design | **Opus** | Highest-leverage decisions, done once |
| Rate-limited Riot client, fetch jobs, DB schema/migrations | Sonnet | Standard backend work |
| Timeline extraction functions + tests | Sonnet | Fiddly but well-specified |
| Rule engine + 20 MVP rules | Sonnet (Opus review of the rules once) | Logic correctness matters |
| Claude API service, prompts, caching | Sonnet | Core integration |
| Frontend pages/components | Sonnet | UI implementation |
| Boilerplate: config files, fixtures, README updates, small refactors, lint fixes | Haiku | Don't burn Sonnet/Opus budget on chores |
| Final pre-merge review of the whole feature | Opus | One expensive pass beats many cheap bugs |

Practical tip: run the orchestrating/planning agent on Opus (or your plan's default) and spawn subagent tasks on Sonnet/Haiku per the table; in Claude Code you can set the model per session with `--model` or `ANTHROPIC_MODEL`.

## D. Escalation policy

1. Start every new LLM task on the cheapest row above.
2. Escalate one tier only after a *measured* failure (validation errors, user thumbs-down rate, review finding), not vibes.
3. Re-benchmark Haiku vs Sonnet on 50 cached fact sheets whenever models update — model quality moves fast; yesterday's Sonnet task is often today's Haiku task.
