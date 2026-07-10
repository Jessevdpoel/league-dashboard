import type { ParticipantDto } from '../riot/types';
import {
  METRIC_META,
  type BenchmarkLookup,
  type MetricCategory,
  type MetricName,
} from './metrics';

/*
 * Profile-level insight derivation. Works ONLY from participant fields available
 * without a timeline fetch — the profile page must not add Riot API calls.
 */

export const PROFILE_METRICS = [
  'csAt10',
  'platesTaken',
  'visionScorePerMin',
  'killParticipation',
  'soloKills',
  'damagePerMin',
  'damageShare',
  'deaths',
] as const satisfies readonly MetricName[];

function rawValue(p: ParticipantDto, metric: MetricName): number | undefined {
  const c = p.challenges;
  switch (metric) {
    case 'csAt10': return c?.laneMinionsFirst10Minutes;
    case 'platesTaken': return c?.turretPlatesTaken;
    case 'visionScorePerMin': return c?.visionScorePerMinute;
    case 'killParticipation': return c?.killParticipation;
    case 'soloKills': return c?.soloKills;
    case 'damagePerMin': return c?.damagePerMinute;
    case 'damageShare': return c?.teamDamagePercentage;
    case 'deaths': return p.deaths;
    default: return undefined;
  }
}

export function profileMetricMeans(
  participants: ParticipantDto[]
): Partial<Record<MetricName, number>> {
  const means: Partial<Record<MetricName, number>> = {};
  for (const metric of PROFILE_METRICS) {
    const samples = participants
      .map((p) => rawValue(p, metric))
      .filter((v): v is number => v !== undefined);
    if (samples.length > 0) {
      means[metric] = samples.reduce((a, b) => a + b, 0) / samples.length;
    }
  }
  return means;
}

/** "Goodness" percentile (higher = better) of the window mean for one metric. */
function goodness(
  metric: MetricName,
  mean: number,
  lookup: BenchmarkLookup
): number | undefined {
  const raw = lookup(metric, mean);
  if (raw === undefined) return undefined;
  return METRIC_META[metric].higherIsBetter ? raw : 100 - raw;
}

export function profileSkillScores(
  participants: ParticipantDto[],
  lookup: BenchmarkLookup
): Record<MetricCategory, number | null> {
  const means = profileMetricMeans(participants);
  const buckets: Record<MetricCategory, number[]> = {
    laning: [], vision: [], fighting: [], survivability: [],
  };
  for (const metric of PROFILE_METRICS) {
    const mean = means[metric];
    if (mean === undefined) continue;
    const g = goodness(metric, mean, lookup);
    if (g === undefined) continue;
    buckets[METRIC_META[metric].category].push(g);
  }
  const scores = {} as Record<MetricCategory, number | null>;
  for (const category of Object.keys(buckets) as MetricCategory[]) {
    const vals = buckets[category];
    scores[category] = vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : null;
  }
  return scores;
}
