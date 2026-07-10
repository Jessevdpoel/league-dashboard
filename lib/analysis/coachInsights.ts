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

const METRIC_LABELS: Record<(typeof PROFILE_METRICS)[number], string> = {
  csAt10: 'CS at 10',
  platesTaken: 'Plates taken',
  visionScorePerMin: 'Vision score/min',
  killParticipation: 'Kill participation',
  soloKills: 'Solo kills',
  damagePerMin: 'Damage/min',
  damageShare: 'Damage share',
  deaths: 'Deaths',
};

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export interface CoachInsight {
  kind: 'lever' | 'strength' | 'trend';
  message: string;
  good: boolean;
}

const LEVER_BELOW = 45;
const STRENGTH_ABOVE = 65;
const TREND_MIN_CHANGE_PCT = 15;

/** `participants` newest-first. 0–3 chips; empty means "hide the strip". */
export function deriveCoachInsights(
  participants: ParticipantDto[],
  lookup: BenchmarkLookup,
  cohortLabel: string
): CoachInsight[] {
  if (participants.length < 5) return [];
  const means = profileMetricMeans(participants);

  const scored: { metric: MetricName; pct: number }[] = [];
  for (const metric of PROFILE_METRICS) {
    const mean = means[metric];
    if (mean === undefined) continue;
    const g = goodness(metric, mean, lookup);
    if (g !== undefined) scored.push({ metric, pct: Math.round(g) });
  }

  const insights: CoachInsight[] = [];
  if (scored.length > 0) {
    const worst = scored.reduce((a, b) => (b.pct < a.pct ? b : a));
    if (worst.pct < LEVER_BELOW) {
      insights.push({
        kind: 'lever',
        message: `${METRIC_LABELS[worst.metric as keyof typeof METRIC_LABELS]} sits at the ~${ordinal(worst.pct)} percentile for ${cohortLabel} — your biggest lever`,
        good: false,
      });
    }
    const best = scored.reduce((a, b) => (b.pct > a.pct ? b : a));
    if (best.pct > STRENGTH_ABOVE) {
      insights.push({
        kind: 'strength',
        message: `${METRIC_LABELS[best.metric as keyof typeof METRIC_LABELS]} sits at the ~${ordinal(best.pct)} percentile for ${cohortLabel}`,
        good: true,
      });
    }
  }

  if (participants.length >= 10) {
    const mean = (xs: ParticipantDto[]) => xs.reduce((s, x) => s + x.deaths, 0) / xs.length;
    const recent = mean(participants.slice(0, 5));
    const older = mean(participants.slice(5, 10));
    if (older > 0) {
      const changePct = ((older - recent) / older) * 100;
      if (Math.abs(changePct) >= TREND_MIN_CHANGE_PCT) {
        const x = Math.abs(Math.round(changePct));
        insights.push(
          changePct > 0
            ? { kind: 'trend', message: `Deaths per game down ${x}% over your last 5 games`, good: true }
            : { kind: 'trend', message: `Deaths per game up ${x}% over your last 5 games`, good: false }
        );
      }
    }
  }

  return insights.slice(0, 3);
}
