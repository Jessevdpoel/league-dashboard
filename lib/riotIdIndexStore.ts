import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { normalizeGameName, type RiotIdIndexRow } from './riotIdIndex';

/**
 * Batched upsert in a single statement (a profile view produces ~100 rows;
 * per-row prisma.upsert would be ~100 round trips through pgBouncer).
 * Rows must already be deduped by puuid (mergeObservations guarantees this).
 * On conflict: seen counts accumulate; name fields only move forward in time.
 */
export async function upsertRiotIdRows(rows: RiotIdIndexRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values = rows.map(
    (r) =>
      Prisma.sql`(${r.puuid}, ${r.region}, ${r.gameName}, ${r.gameNameNormalized}, ${r.tagLine}, ${r.seenCount}, ${r.lastSeenAt})`
  );
  await prisma.$executeRaw`
    INSERT INTO riot_id_index
      (puuid, region, game_name, game_name_normalized, tag_line, seen_count, last_seen_at)
    VALUES ${Prisma.join(values)}
    ON CONFLICT (puuid) DO UPDATE SET
      seen_count = riot_id_index.seen_count + EXCLUDED.seen_count,
      game_name = CASE WHEN EXCLUDED.last_seen_at >= riot_id_index.last_seen_at
        THEN EXCLUDED.game_name ELSE riot_id_index.game_name END,
      game_name_normalized = CASE WHEN EXCLUDED.last_seen_at >= riot_id_index.last_seen_at
        THEN EXCLUDED.game_name_normalized ELSE riot_id_index.game_name_normalized END,
      tag_line = CASE WHEN EXCLUDED.last_seen_at >= riot_id_index.last_seen_at
        THEN EXCLUDED.tag_line ELSE riot_id_index.tag_line END,
      region = CASE WHEN EXCLUDED.last_seen_at >= riot_id_index.last_seen_at
        THEN EXCLUDED.region ELSE riot_id_index.region END,
      last_seen_at = GREATEST(riot_id_index.last_seen_at, EXCLUDED.last_seen_at)
  `;
}

export interface RiotIdSuggestion {
  gameName: string;
  tagLine: string;
}

/** Top Riot IDs we've indexed whose name starts with `query`, most-seen first. */
export async function suggestRiotIds(
  region: string,
  query: string,
  limit = 5
): Promise<RiotIdSuggestion[]> {
  const normalized = normalizeGameName(query);
  if (!normalized) return [];
  return prisma.riotIdIndex.findMany({
    where: { region, gameNameNormalized: { startsWith: normalized } },
    orderBy: [{ seenCount: 'desc' }, { lastSeenAt: 'desc' }],
    take: limit,
    select: { gameName: true, tagLine: true },
  });
}
