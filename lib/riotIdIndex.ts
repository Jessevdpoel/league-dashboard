import type { PlatformRegion } from './riot/regions';
import type { MatchDto } from './riot/types';

/** One sighting of a Riot ID at a point in time (match gameCreation, or "now" for Account-V1). */
export interface RiotIdObservation {
  puuid: string;
  gameName: string;
  tagLine: string;
  observedAtMs: number;
}

/** Upsert-ready row for the riot_id_index table. */
export interface RiotIdIndexRow {
  puuid: string;
  region: PlatformRegion;
  gameName: string;
  gameNameNormalized: string;
  tagLine: string;
  seenCount: number;
  lastSeenAt: Date;
}

/** Case/width-insensitive key used for prefix lookups. */
export function normalizeGameName(name: string): string {
  return name.normalize('NFKC').toLowerCase().trim();
}

/**
 * Riot IDs in a match payload are the names as of when the match was played,
 * so each observation is stamped with gameCreation — newer matches win merges.
 */
export function observationsFromMatch(match: MatchDto): RiotIdObservation[] {
  return match.info.participants
    .filter((p) => p.riotIdGameName && p.riotIdTagline)
    .map((p) => ({
      puuid: p.puuid,
      gameName: p.riotIdGameName,
      tagLine: p.riotIdTagline,
      observedAtMs: match.info.gameCreation,
    }));
}

/**
 * Collapse observations to one row per puuid: seenCount accumulates, the
 * newest observation supplies the display name. Dedup is required before the
 * batched upsert — Postgres rejects ON CONFLICT hitting the same row twice
 * in one statement.
 */
export function mergeObservations(
  region: PlatformRegion,
  observations: RiotIdObservation[]
): RiotIdIndexRow[] {
  const byPuuid = new Map<string, RiotIdIndexRow>();
  for (const obs of observations) {
    const existing = byPuuid.get(obs.puuid);
    if (!existing) {
      byPuuid.set(obs.puuid, {
        puuid: obs.puuid,
        region,
        gameName: obs.gameName,
        gameNameNormalized: normalizeGameName(obs.gameName),
        tagLine: obs.tagLine,
        seenCount: 1,
        lastSeenAt: new Date(obs.observedAtMs),
      });
      continue;
    }
    existing.seenCount += 1;
    if (obs.observedAtMs >= existing.lastSeenAt.getTime()) {
      existing.gameName = obs.gameName;
      existing.gameNameNormalized = normalizeGameName(obs.gameName);
      existing.tagLine = obs.tagLine;
      existing.lastSeenAt = new Date(obs.observedAtMs);
    }
  }
  return [...byPuuid.values()];
}
