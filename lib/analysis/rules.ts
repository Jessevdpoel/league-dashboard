import type { MetricCategory, MetricName, MetricSet } from './metrics';
import type { TimelineFacts } from './timelineFacts';

export type FindingKind = 'strength' | 'improvement';
export type Severity = 'low' | 'medium' | 'high';
export type FindingTag = MetricCategory | 'objectives';

export interface RuleContext {
  metrics: MetricSet;
  timeline: TimelineFacts;
  role?: string;
  win: boolean;
}

export type FindingData = Record<string, number | string | boolean | number[]>;

export interface Finding {
  id: string;
  kind: FindingKind;
  severity?: Severity;
  tag: FindingTag;
  data: FindingData;
}

interface Rule {
  id: string;
  kind: FindingKind;
  tag: FindingTag;
  severity?: Severity;
  when: (ctx: RuleContext) => boolean;
  data: (ctx: RuleContext) => FindingData;
}

/** Shorthand: raw value of a metric. */
const v = (ctx: RuleContext, name: MetricName): number => ctx.metrics.metrics[name].value;

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Declarative MVP rule set. Thresholds are value-based so findings fire before
 * any benchmark data exists; once benchmarks are populated, percentile bands on
 * each metric can tighten these. Every fired finding carries the numbers it used
 * so the LLM layer can cite them and never invents a stat.
 */
export const RULES: Rule[] = [
  // --- Improvements ---
  {
    id: 'early_deaths_to_ganks',
    kind: 'improvement',
    tag: 'survivability',
    severity: 'high',
    when: (ctx) => {
      const early = ctx.timeline.deaths.filter((d) => d.minute < 14);
      const ganks = early.filter((d) => d.killerRole === 'JUNGLE');
      return early.length >= 2 && ganks.length / early.length >= 0.5;
    },
    data: (ctx) => {
      const early = ctx.timeline.deaths.filter((d) => d.minute < 14);
      return {
        deaths_pre14: early.length,
        gank_death_minutes: early.map((d) => round(d.minute, 1)),
      };
    },
  },
  {
    id: 'lead_no_convert',
    kind: 'improvement',
    tag: 'objectives',
    severity: 'high',
    when: (ctx) => (ctx.timeline.laneDiffs[14]?.gold ?? 0) > 500 && !ctx.win,
    data: (ctx) => ({ gold_diff_at_14: ctx.timeline.laneDiffs[14]?.gold ?? 0 }),
  },
  {
    id: 'vision_gap',
    kind: 'improvement',
    tag: 'vision',
    severity: 'medium',
    when: (ctx) =>
      (ctx.role === 'UTILITY' || ctx.role === 'JUNGLE') && v(ctx, 'visionScorePerMin') < 0.8,
    data: (ctx) => ({ vision_score_per_min: round(v(ctx, 'visionScorePerMin')) }),
  },
  {
    id: 'late_game_throws',
    kind: 'improvement',
    tag: 'survivability',
    severity: 'high',
    when: (ctx) => ctx.timeline.deathBuckets.late >= 3 && ctx.timeline.soloDeathsLate >= 2,
    data: (ctx) => ({
      deaths_25plus: ctx.timeline.deathBuckets.late,
      solo_deaths_25plus: ctx.timeline.soloDeathsLate,
    }),
  },
  {
    id: 'low_kill_participation',
    kind: 'improvement',
    tag: 'fighting',
    severity: 'medium',
    when: (ctx) => v(ctx, 'killParticipation') > 0 && v(ctx, 'killParticipation') < 0.4,
    data: (ctx) => ({ kill_participation: round(v(ctx, 'killParticipation')) }),
  },
  {
    id: 'weak_early_farm',
    kind: 'improvement',
    tag: 'laning',
    severity: 'medium',
    when: (ctx) => v(ctx, 'csAt10') > 0 && v(ctx, 'csAt10') < 60,
    data: (ctx) => ({ cs_at_10: v(ctx, 'csAt10') }),
  },
  {
    id: 'no_control_wards',
    kind: 'improvement',
    tag: 'vision',
    severity: 'low',
    when: (ctx) => v(ctx, 'controlWardsPurchased') === 0,
    data: () => ({ control_wards_purchased: 0 }),
  },

  // --- Strengths ---
  {
    id: 'strong_laning',
    kind: 'strength',
    tag: 'laning',
    when: (ctx) => (ctx.timeline.laneDiffs[10]?.gold ?? 0) > 300 && v(ctx, 'csAt10') >= 70,
    data: (ctx) => ({
      gold_diff_at_10: ctx.timeline.laneDiffs[10]?.gold ?? 0,
      cs_at_10: v(ctx, 'csAt10'),
    }),
  },
  {
    id: 'strong_teamfighting',
    kind: 'strength',
    tag: 'fighting',
    when: (ctx) => v(ctx, 'damageShare') >= 0.28 && v(ctx, 'killParticipation') >= 0.6,
    data: (ctx) => ({
      damage_share: round(v(ctx, 'damageShare')),
      kill_participation: round(v(ctx, 'killParticipation')),
    }),
  },
  {
    id: 'vision_control',
    kind: 'strength',
    tag: 'vision',
    when: (ctx) => v(ctx, 'visionScorePerMin') >= 1.5 || v(ctx, 'controlWardsPurchased') >= 3,
    data: (ctx) => ({
      vision_score_per_min: round(v(ctx, 'visionScorePerMin')),
      control_wards_purchased: v(ctx, 'controlWardsPurchased'),
    }),
  },
  {
    id: 'clean_game',
    kind: 'strength',
    tag: 'survivability',
    when: (ctx) => v(ctx, 'deaths') <= 3 && ctx.win,
    data: (ctx) => ({ deaths: v(ctx, 'deaths') }),
  },
  {
    id: 'carry_performance',
    kind: 'strength',
    tag: 'fighting',
    when: (ctx) => v(ctx, 'soloKills') >= 2,
    data: (ctx) => ({ solo_kills: v(ctx, 'soloKills') }),
  },
];

/** Evaluate all rules against a match context, returning the fired findings. */
export function evaluateRules(ctx: RuleContext): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    if (!rule.when(ctx)) continue;
    findings.push({
      id: rule.id,
      kind: rule.kind,
      severity: rule.severity,
      tag: rule.tag,
      data: rule.data(ctx),
    });
  }
  return findings;
}
