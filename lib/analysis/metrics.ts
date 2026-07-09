import type { MatchDto, ParticipantDto } from '../riot/types';
import type { TimelineFacts } from './timelineFacts';

export type MetricCategory = 'laning' | 'vision' | 'fighting' | 'survivability';

export type Band = 'weak' | 'below_avg' | 'avg' | 'good' | 'excellent';

export interface MetricValue {
  value: number;
  /** "Goodness" percentile 0–100 (direction-adjusted). Undefined without a benchmark. */
  percentile?: number;
  band?: Band;
}

export type MetricName =
  | 'csAt10'
  | 'goldDiffAt10'
  | 'xpDiffAt14'
  | 'platesTaken'
  | 'deathsPre14'
  | 'visionScorePerMin'
  | 'controlWardsPurchased'
  | 'wardsKilled'
  | 'killParticipation'
  | 'soloKills'
  | 'damagePerMin'
  | 'damageShare'
  | 'deaths'
  | 'soloDeathsLate';

interface MetricMeta {
  category: MetricCategory;
  /** Whether a higher raw value is better; drives band direction. */
  higherIsBetter: boolean;
}

export const METRIC_META: Record<MetricName, MetricMeta> = {
  csAt10: { category: 'laning', higherIsBetter: true },
  goldDiffAt10: { category: 'laning', higherIsBetter: true },
  xpDiffAt14: { category: 'laning', higherIsBetter: true },
  platesTaken: { category: 'laning', higherIsBetter: true },
  deathsPre14: { category: 'laning', higherIsBetter: false },
  visionScorePerMin: { category: 'vision', higherIsBetter: true },
  controlWardsPurchased: { category: 'vision', higherIsBetter: true },
  wardsKilled: { category: 'vision', higherIsBetter: true },
  killParticipation: { category: 'fighting', higherIsBetter: true },
  soloKills: { category: 'fighting', higherIsBetter: true },
  damagePerMin: { category: 'fighting', higherIsBetter: true },
  damageShare: { category: 'fighting', higherIsBetter: true },
  deaths: { category: 'survivability', higherIsBetter: false },
  soloDeathsLate: { category: 'survivability', higherIsBetter: false },
};

/**
 * Looks up the percentile (0–100) of a raw metric value within the player's
 * rank/role/patch cohort. Returns undefined when no benchmark exists yet — the
 * engine then reports the raw value with no band (graceful pre-benchmark mode).
 */
export type BenchmarkLookup = (metric: MetricName, value: number) => number | undefined;

export interface MetricSet {
  metrics: Record<MetricName, MetricValue>;
  /** Weighted 0–100 per category, or null when no member metric has a benchmark. */
  scores: Record<MetricCategory, number | null>;
}

export function bandForPercentile(percentile: number): Band {
  if (percentile < 25) return 'weak';
  if (percentile < 45) return 'below_avg';
  if (percentile < 65) return 'avg';
  if (percentile < 85) return 'good';
  return 'excellent';
}

function participantFor(match: MatchDto, puuid: string): ParticipantDto {
  const p = match.info.participants.find((x) => x.puuid === puuid);
  if (!p) throw new Error(`PUUID ${puuid} not in match ${match.metadata.matchId}`);
  return p;
}

/** Raw metric values pulled from match `challenges` + timeline facts. */
export function rawMetricValues(
  participant: ParticipantDto,
  timeline: TimelineFacts
): Record<MetricName, number> {
  const c = participant.challenges ?? {};
  return {
    csAt10: c.laneMinionsFirst10Minutes ?? 0,
    goldDiffAt10: timeline.laneDiffs[10]?.gold ?? 0,
    xpDiffAt14: timeline.laneDiffs[14]?.xp ?? 0,
    platesTaken: c.turretPlatesTaken ?? 0,
    deathsPre14: timeline.deathBuckets.pre14,
    visionScorePerMin: c.visionScorePerMinute ?? 0,
    controlWardsPurchased: timeline.wards.controlWardsPurchased,
    wardsKilled: timeline.wards.killed,
    killParticipation: c.killParticipation ?? 0,
    soloKills: c.soloKills ?? 0,
    damagePerMin: c.damagePerMinute ?? 0,
    damageShare: c.teamDamagePercentage ?? 0,
    deaths: participant.deaths,
    soloDeathsLate: timeline.soloDeathsLate,
  };
}

/**
 * Compute the full metric set for one participant. `benchmark` is optional: with
 * it we produce percentiles + bands + category scores; without it, raw values only.
 */
export function computeMetrics(
  match: MatchDto,
  puuid: string,
  timeline: TimelineFacts,
  benchmark?: BenchmarkLookup
): MetricSet {
  const participant = participantFor(match, puuid);
  const raw = rawMetricValues(participant, timeline);

  const metrics = {} as Record<MetricName, MetricValue>;
  const buckets: Record<MetricCategory, number[]> = {
    laning: [],
    vision: [],
    fighting: [],
    survivability: [],
  };

  for (const name of Object.keys(METRIC_META) as MetricName[]) {
    const meta = METRIC_META[name];
    const value = raw[name];
    const rawPct = benchmark?.(name, value);
    if (rawPct === undefined) {
      metrics[name] = { value };
      continue;
    }
    // Direction-adjust so higher percentile always means "better".
    const goodness = meta.higherIsBetter ? rawPct : 100 - rawPct;
    metrics[name] = { value, percentile: goodness, band: bandForPercentile(goodness) };
    buckets[meta.category].push(goodness);
  }

  const scores = {} as Record<MetricCategory, number | null>;
  for (const category of Object.keys(buckets) as MetricCategory[]) {
    const vals = buckets[category];
    scores[category] = vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : null;
  }

  return { metrics, scores };
}
