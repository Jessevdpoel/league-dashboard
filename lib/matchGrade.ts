import type { MatchDto, ParticipantDto } from '@/lib/riot/types';

/*
 * In-match relative performance grade (spec: 2026-07-13-scoreboard-faceoff).
 * Every player is ranked against the other participants of the SAME match on
 * 8 weighted metrics — no external benchmarks, fully deterministic.
 */

export interface ParticipantGrade {
  puuid: string;
  /** 0.0–10.0, one decimal. Clean sweep of every metric = 10. */
  score: number;
  /** 1–n placement within the match (ties share the better ordinal). */
  ordinal: number;
  badge: 'MVP' | 'ACE' | null;
}

export interface MatchGrades {
  byPuuid: Record<string, ParticipantGrade>;
}

const WEIGHTS = {
  damage: 1.2,
  kp: 1.1,
  deaths: 1.1,
  goldPerMin: 0.9,
  csPerMin: 0.8,
  vision: 0.8,
  tanking: 0.6,
  objectives: 0.5,
} as const;

type MetricKey = keyof typeof WEIGHTS;

const METRIC_KEYS = Object.keys(WEIGHTS) as MetricKey[];
const WEIGHT_SUM = METRIC_KEYS.reduce((sum, key) => sum + WEIGHTS[key], 0);
const REMAKE_SECONDS = 300;

function metricsFor(
  p: ParticipantDto,
  minutes: number,
  teamKills: number
): Record<MetricKey, number> {
  return {
    damage: p.totalDamageDealtToChampions,
    tanking: p.totalDamageTaken,
    kp: (p.kills + p.assists) / Math.max(teamKills, 1),
    deaths: -p.deaths,
    vision: p.visionScore,
    csPerMin: ((p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0)) / minutes,
    goldPerMin: p.goldEarned / minutes,
    objectives: p.damageDealtToObjectives ?? 0,
  };
}

/** Rank 1 = best (highest value); ties share the better (lower) rank. */
function rankOf(value: number, all: number[]): number {
  return all.filter((other) => other > value).length + 1;
}

export function gradeMatch(match: MatchDto): MatchGrades {
  const participants = match.info.participants;
  const n = participants.length;
  const minutes = Math.max(match.info.gameDuration / 60, 1);

  const killsByTeam = new Map<number, number>();
  for (const p of participants) {
    killsByTeam.set(p.teamId, (killsByTeam.get(p.teamId) ?? 0) + p.kills);
  }

  const metrics = participants.map((p) =>
    metricsFor(p, minutes, killsByTeam.get(p.teamId) ?? 0)
  );

  const totals = participants.map((_, i) =>
    METRIC_KEYS.reduce((sum, key) => {
      const rank = rankOf(metrics[i][key], metrics.map((m) => m[key]));
      return sum + WEIGHTS[key] * ((n + 1 - rank) / n);
    }, 0)
  );

  // Min–max scale: all ranks 1 -> WEIGHT_SUM; all ranks n -> WEIGHT_SUM / n.
  const maxPossible = WEIGHT_SUM;
  const minPossible = WEIGHT_SUM / n;
  const scores = totals.map(
    (total) => Math.round(((total - minPossible) / (maxPossible - minPossible)) * 100) / 10
  );

  const ordinals = totals.map((total) => totals.filter((other) => other > total).length + 1);

  const isRemake = match.info.gameDuration < REMAKE_SECONDS;
  const outcomes = new Set(participants.map((p) => p.win));
  let mvpIndex = -1;
  let aceIndex = -1;
  if (!isRemake && outcomes.size === 2) {
    participants.forEach((p, i) => {
      if (p.win) {
        if (mvpIndex === -1 || totals[i] > totals[mvpIndex]) mvpIndex = i;
      } else if (aceIndex === -1 || totals[i] > totals[aceIndex]) {
        aceIndex = i;
      }
    });
  }

  const byPuuid: Record<string, ParticipantGrade> = {};
  participants.forEach((p, i) => {
    byPuuid[p.puuid] = {
      puuid: p.puuid,
      score: scores[i],
      ordinal: ordinals[i],
      badge: i === mvpIndex ? 'MVP' : i === aceIndex ? 'ACE' : null,
    };
  });
  return { byPuuid };
}
