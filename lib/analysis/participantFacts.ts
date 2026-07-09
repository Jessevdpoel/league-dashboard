import type { MatchDto, MatchTimelineDto } from '../riot/types';
import { QUEUE_RANKED_SOLO } from '../riot/match';
import { extractTimelineFacts } from './timelineFacts';
import { findLaneOpponentPuuid, rolesByParticipantId } from './factSheet';
import { rawMetricValues, type MetricName } from './metrics';

/** Mirrors the Prisma `ParticipantFacts` row (`prisma/schema.prisma`). */
export interface ParticipantFactsRow {
  matchId: string;
  puuid: string;
  role: string;
  championId: number;
  patch: string;
  rankTier: string;
  metrics: Record<MetricName, number>;
}

const MIN_GAME_SECONDS = 14 * 60;

/**
 * Extract benchmark-corpus facts for ALL 10 participants of one match. Pure CPU
 * (no I/O). Returns [] for games the corpus excludes: non ranked-solo queues and
 * remakes (< 14 min). All participants are tagged with the anchor player's
 * cohort (patch, rankTier) — solo-queue lobbies are tier-homogeneous, which
 * saves 10 rank lookups per match (see design spec, "tier-tagging shortcut").
 */
export function extractMatchFacts(
  match: MatchDto,
  timeline: MatchTimelineDto,
  opts: { patch: string; rankTier: string }
): ParticipantFactsRow[] {
  if (match.info.queueId !== QUEUE_RANKED_SOLO) return [];
  if (match.info.gameDuration < MIN_GAME_SECONDS) return [];

  const roles = rolesByParticipantId(match, timeline);

  return match.info.participants.flatMap((participant) => {
    if (!participant.teamPosition) return [];
    const timelineFacts = extractTimelineFacts(timeline, participant.puuid, {
      opponentPuuid: findLaneOpponentPuuid(match, participant.puuid),
      rolesByParticipantId: roles,
    });
    return [
      {
        matchId: match.metadata.matchId,
        puuid: participant.puuid,
        role: participant.teamPosition,
        championId: participant.championId,
        patch: opts.patch,
        rankTier: opts.rankTier,
        metrics: rawMetricValues(participant, timelineFacts),
      },
    ];
  });
}
