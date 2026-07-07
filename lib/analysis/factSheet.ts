import type { MatchDto, MatchTimelineDto, ParticipantDto } from '../riot/types';
import { extractTimelineFacts } from './timelineFacts';
import { computeMetrics, type BenchmarkLookup, type MetricCategory } from './metrics';
import { evaluateRules, type Finding } from './rules';
import { weightsForRole } from './roleWeights';

export interface FactSheetContext {
  champion: string;
  role: string;
  rank: string;
  result: 'win' | 'loss';
  durationMinutes: number;
  patch: string;
  opponent: string | null;
}

export interface FactSheet {
  context: FactSheetContext;
  scores: Record<MetricCategory, number | null>;
  findings: Finding[];
  /** Category the coaching should lead with, or null if undecidable. */
  focusCategory: MetricCategory | null;
  /** Populated only for 20-game trend fact sheets. */
  trend: null;
}

export interface BuildOptions {
  rank: string;
  patch: string;
  benchmark?: BenchmarkLookup;
}

function participantFor(match: MatchDto, puuid: string): ParticipantDto {
  const p = match.info.participants.find((x) => x.puuid === puuid);
  if (!p) throw new Error(`PUUID ${puuid} not in match ${match.metadata.matchId}`);
  return p;
}

/** Lane opponent = same teamPosition on the enemy team. */
function findOpponent(match: MatchDto, player: ParticipantDto): ParticipantDto | undefined {
  if (!player.teamPosition) return undefined;
  return match.info.participants.find(
    (p) => p.teamId !== player.teamId && p.teamPosition === player.teamPosition
  );
}

/** timeline participantId -> role, joined via puuid through the match. */
function rolesByParticipantId(match: MatchDto, timeline: MatchTimelineDto): Record<number, string> {
  const roleByPuuid = new Map(match.info.participants.map((p) => [p.puuid, p.teamPosition ?? '']));
  const out: Record<number, string> = {};
  for (const tp of timeline.info.participants) {
    const role = roleByPuuid.get(tp.puuid);
    if (role) out[tp.participantId] = role;
  }
  return out;
}

function pickFocusCategory(
  scores: Record<MetricCategory, number | null>,
  findings: Finding[],
  role: string | undefined
): MetricCategory | null {
  const weights = weightsForRole(role);
  const scored = (Object.keys(scores) as MetricCategory[]).filter((c) => scores[c] !== null);
  if (scored.length > 0) {
    // Most important weakness = lowest score amplified by role weight.
    return scored.reduce((worst, c) =>
      (scores[c] as number) / weights[c] < (scores[worst] as number) / weights[worst] ? c : worst
    );
  }
  // No benchmarks yet: lead with the highest-severity improvement's category.
  const order = { high: 3, medium: 2, low: 1, undefined: 0 } as const;
  const improvements = findings
    .filter((f) => f.kind === 'improvement' && f.tag !== 'objectives')
    .sort((a, b) => order[b.severity ?? 'undefined'] - order[a.severity ?? 'undefined']);
  return (improvements[0]?.tag as MetricCategory) ?? null;
}

/**
 * Build the compact, grounded fact sheet that is the LLM's entire input for a
 * single-match analysis (target < 1,500 tokens). Deterministic and pure.
 */
export function buildSingleMatchFactSheet(
  match: MatchDto,
  timeline: MatchTimelineDto,
  puuid: string,
  options: BuildOptions
): FactSheet {
  const player = participantFor(match, puuid);
  const opponent = findOpponent(match, player);

  const timelineFacts = extractTimelineFacts(timeline, puuid, {
    opponentPuuid: opponent?.puuid,
    rolesByParticipantId: rolesByParticipantId(match, timeline),
  });

  const { metrics, scores } = computeMetrics(match, puuid, timelineFacts, options.benchmark);
  const findings = evaluateRules({
    metrics: { metrics, scores },
    timeline: timelineFacts,
    role: player.teamPosition,
    win: player.win,
  });

  return {
    context: {
      champion: player.championName,
      role: player.teamPosition ?? 'UNKNOWN',
      rank: options.rank,
      result: player.win ? 'win' : 'loss',
      durationMinutes: Math.round((match.info.gameDuration / 60) * 10) / 10,
      patch: options.patch,
      opponent: opponent?.championName ?? null,
    },
    scores,
    findings,
    focusCategory: pickFocusCategory(scores, findings, player.teamPosition),
    trend: null,
  };
}
