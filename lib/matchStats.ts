import type { MatchDto, ParticipantDto } from './riot/types';
import { performanceBadge } from './matchBadges';

export interface MatchSummary {
  matchId: string;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  items: number[];
  summoner1Id: number;
  summoner2Id: number;
  durationSeconds: number;
  queueId: number;
  gameCreation: number;
  role: string | null;
  cs: number | null;
  badge: string | null;
}

export function toMatchSummary(match: MatchDto, puuid: string): MatchSummary {
  const participant = match.info.participants.find((p) => p.puuid === puuid);
  if (!participant) {
    throw new Error(`Player ${puuid} not found in match ${match.metadata.matchId}`);
  }
  return {
    matchId: match.metadata.matchId,
    championName: participant.championName,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    win: participant.win,
    items: [
      participant.item0,
      participant.item1,
      participant.item2,
      participant.item3,
      participant.item4,
      participant.item5,
      participant.item6,
    ],
    summoner1Id: participant.summoner1Id,
    summoner2Id: participant.summoner2Id,
    durationSeconds: match.info.gameDuration,
    queueId: match.info.queueId,
    gameCreation: match.info.gameCreation,
    role: participant.teamPosition ?? null,
    cs:
      participant.totalMinionsKilled !== undefined
        ? participant.totalMinionsKilled + (participant.neutralMinionsKilled ?? 0)
        : null,
    badge: performanceBadge(participant),
  };
}

export interface RecentPerformance {
  games: number;
  wins: number;
  losses: number;
  winRatePct: number;
  kdaRatio: number | null;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgKillParticipationPct: number | null;
  streak: { result: 'win' | 'loss'; count: number } | null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** `participants` ordered newest-first (the order the match-id list arrives in). */
export function computeRecentPerformance(participants: ParticipantDto[]): RecentPerformance {
  const games = participants.length;
  if (games === 0) {
    return {
      games: 0, wins: 0, losses: 0, winRatePct: 0, kdaRatio: null,
      avgKills: 0, avgDeaths: 0, avgAssists: 0,
      avgKillParticipationPct: null, streak: null,
    };
  }
  const wins = participants.filter((p) => p.win).length;
  const kills = participants.reduce((s, p) => s + p.kills, 0);
  const deaths = participants.reduce((s, p) => s + p.deaths, 0);
  const assists = participants.reduce((s, p) => s + p.assists, 0);
  const kps = participants
    .map((p) => p.challenges?.killParticipation)
    .filter((v): v is number => v !== undefined);

  let count = 1;
  const first = participants[0].win;
  while (count < games && participants[count].win === first) count++;

  return {
    games,
    wins,
    losses: games - wins,
    winRatePct: Math.round((wins / games) * 100),
    kdaRatio: round1((kills + assists) / Math.max(deaths, 1)),
    avgKills: round1(kills / games),
    avgDeaths: round1(deaths / games),
    avgAssists: round1(assists / games),
    avgKillParticipationPct: kps.length
      ? Math.round((kps.reduce((a, b) => a + b, 0) / kps.length) * 100)
      : null,
    streak: { result: first ? 'win' : 'loss', count },
  };
}

export interface ChampionPoolEntry {
  championName: string;
  games: number;
  wins: number;
  winRatePct: number;
  kda: number | null;
  csPerMin: number | null;
}

export function computeChampionPool(
  matches: MatchDto[],
  puuid: string,
  limit = 4
): ChampionPoolEntry[] {
  interface Acc { games: number; wins: number; k: number; d: number; a: number; cs: number; csSeconds: number }
  const byChampion = new Map<string, Acc>();
  for (const m of matches) {
    const part = m.info.participants.find((x) => x.puuid === puuid);
    if (!part) continue;
    const acc = byChampion.get(part.championName) ?? { games: 0, wins: 0, k: 0, d: 0, a: 0, cs: 0, csSeconds: 0 };
    acc.games += 1;
    if (part.win) acc.wins += 1;
    acc.k += part.kills; acc.d += part.deaths; acc.a += part.assists;
    if (part.totalMinionsKilled !== undefined) {
      acc.cs += part.totalMinionsKilled + (part.neutralMinionsKilled ?? 0);
      acc.csSeconds += m.info.gameDuration;
    }
    byChampion.set(part.championName, acc);
  }
  return [...byChampion.entries()]
    .sort((a, b) => b[1].games - a[1].games)
    .slice(0, limit)
    .map(([championName, acc]) => ({
      championName,
      games: acc.games,
      wins: acc.wins,
      winRatePct: Math.round((acc.wins / acc.games) * 100),
      kda: Math.round(((acc.k + acc.a) / Math.max(acc.d, 1)) * 100) / 100,
      csPerMin: acc.csSeconds > 0 ? Math.round((acc.cs / (acc.csSeconds / 60)) * 10) / 10 : null,
    }));
}

export function bestChampionIndex(pool: ChampionPoolEntry[]): number {
  if (pool.length === 0) return -1;
  let best = -1;
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].games < 3) continue;
    if (best === -1 || pool[i].winRatePct > pool[best].winRatePct) best = i;
  }
  return best === -1 ? 0 : best;
}

export type QueueFilter = 'all' | 'solo' | 'flex' | 'aram';

const QUEUE_IDS: Record<Exclude<QueueFilter, 'all'>, number> = { solo: 420, flex: 440, aram: 450 };

export function filterByQueue(matches: MatchSummary[], filter: QueueFilter): MatchSummary[] {
  if (filter === 'all') return matches;
  return matches.filter((m) => m.queueId === QUEUE_IDS[filter]);
}
