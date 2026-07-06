# 02 — Stats Engine (deterministic, no LLM)

**Goal:** Turn one match (or 20 matches) into a small, structured **fact sheet** of scored findings. This layer decides *what is true*; the LLM layer only decides *how to say it*.

## Metric catalog (MVP ~15 metrics, weighted by role)

| Category | Metrics | Main source |
|---|---|---|
| Laning | CS@10, gold diff@10, xp diff@14, plates taken, deaths pre-14 | timeline + challenges |
| Farming | CS/min overall, CS/min after 20min | match |
| Vision | vision score/min, control wards bought, wards killed, first control ward minute | match + timeline |
| Aggression/Fighting | kill participation, solo kills, damage/min, damage share of team | match challenges |
| Survivability | deaths/game, solo deaths, deaths near enemy tower, death timing distribution | timeline |
| Objectives | objective participation %, dragon/baron presence | timeline events |
| Itemization | first item completion minute, gold spent efficiency proxy | timeline |

Role weighting (Mobalytics-style): vision weighs heavily for support/jungle, CS for ADC/mid, plates/solo kills for top. Store weights in a config file, not code.

## Scoring

For each metric: look up the player's rank/role/patch percentile from the `benchmarks` table →

```
score = percentile (0–100)
band  = weak (<25) | below_avg (25–45) | avg (45–65) | good (65–85) | excellent (>85)
```

## Trigger rules → findings

A **finding** is fired when rule conditions match. Rules live in a declarative file (JSON/TS config) so non-engineers can tune them. Examples:

```
id: early_deaths_to_ganks
when: deaths_pre14 >= 2 AND (killer_role == 'JUNGLE' in >=50% of early deaths)
severity: high
category: improvement
data: {deaths_pre14, gank_death_minutes, ward_coverage_at_death}

id: strong_laning
when: gold_diff_at_10.percentile >= 75 AND cs_at_10.percentile >= 65
category: strength

id: lead_no_convert   (classic "wins lane loses game")
when: gold_diff_at_14 > +500 AND game.win == false AND objective_participation.percentile < 40

id: vision_gap
when: role in [SUPPORT, JUNGLE] AND vision_score_per_min.percentile < 30

id: late_game_throws
when: deaths_25plus >= 3 AND deaths_25plus_solo >= 2
```

Ship ~20 rules for MVP covering: laning, farming, vision, deaths/positioning, objective play, itemization timing, and 5 "strength" rules (people need positive reinforcement too — always surface at least 2 strengths).

## Fact sheet output (the LLM's entire input)

```json
{
  "context": {"champion":"Ahri","role":"MID","rank":"GOLD II","result":"loss","duration":31.4,"patch":"26.13","opponent":"Syndra"},
  "scores": {"laning":62,"farming":41,"vision":28,"fighting":71,"survivability":35,"objectives":44},
  "findings": [
    {"id":"early_deaths_to_ganks","severity":"high","data":{"deaths_pre14":3,"minutes":[6,9,13],"no_river_ward_in":"3/3"}},
    {"id":"strong_teamfighting","data":{"damage_share":0.31,"kill_participation":0.68}},
    {"id":"cs_falloff","data":{"cs_min_0_20":7.1,"cs_min_20_plus":3.2,"benchmark_p50":5.8}}
  ],
  "trend": null
}
```

Target size: **under 1,500 tokens.** This is the whole point — small input, grounded numbers.

For **trend analysis**, the fact sheet aggregates 20 games: average scores, finding frequency ("vision_gap fired in 14/20 games"), win rate by finding, champion pool stats.

## Implementation note

Follow the existing pattern: `lib/matchStats.ts` already does pure-function match derivation with unit tests in `tests/matchStats.test.ts` — build the metric engine the same way (suggested: `lib/analysis/metrics.ts`, `lib/analysis/rules.ts`, `lib/analysis/factSheet.ts`). Most "challenges"-based metrics require first extending `ParticipantDto` in `lib/riot/types.ts` (see 01-data-pipeline.md).

## Definition of done

- [ ] Metric computation as pure functions with unit tests
- [ ] Role-weight config file
- [ ] Declarative rule engine + 20 MVP rules
- [ ] Fact-sheet builder for single-match and 20-game trend
- [ ] Snapshot tests: fixture match → expected fact sheet
