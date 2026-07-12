import { after } from 'next/server';
import { notFound } from 'next/navigation';
import { isPlatformRegion, type PlatformRegion } from '@/lib/riot/regions';
import { getAccountByRiotId } from '@/lib/riot/account';
import { getSummonerByPuuid } from '@/lib/riot/summoner';
import { getLeagueEntriesByPuuid } from '@/lib/riot/league';
import { getMatchIdsByPuuid, getMatchById } from '@/lib/riot/match';
import { parseRiotIdSegment } from '@/lib/riotId';
import {
  computeChampionPool,
  computeRecentPerformance,
  toMatchSummary,
} from '@/lib/matchStats';
import { RiotApiError } from '@/lib/riot/client';
import { getLatestDDragonVersion, patchFromVersion } from '@/lib/dataDragon';
import { observationsFromMatch, mergeObservations } from '@/lib/riotIdIndex';
import { upsertRiotIdRows } from '@/lib/riotIdIndexStore';
import { cohortTier, cohortDisplayLabel, isBenchmarkableTier } from '@/lib/analysis/cohort';
import { loadBenchmarkLookup } from '@/lib/analysis/benchmarkStore';
import { prismaBenchmarkReader } from '@/lib/analysis/benchmarkDb';
import {
  deriveCoachInsights,
  profileSkillScores,
  type CoachInsight,
} from '@/lib/analysis/coachInsights';
import { formatLadderChip } from '@/lib/analysis/ladderPercentile';
import { findAnalyzedMatchIds } from '@/lib/analysis/analysisStore';
import { PROMPT_VERSION } from '@/lib/analysis/analyzeMatch';
import { recordRankSnapshots, getSoloRankSeries } from '@/lib/rankSnapshotsDb';
import type { MetricCategory } from '@/lib/analysis/metrics';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { CoachStrip } from '@/components/profile/CoachStrip';
import { RankPanel } from '@/components/profile/RankPanel';
import { PerformancePanel } from '@/components/profile/PerformancePanel';
import { SkillProfilePanel } from '@/components/profile/SkillProfilePanel';
import { ChampionPool } from '@/components/profile/ChampionPool';
import { MatchHistory } from '@/components/MatchHistory';

const REGION_LABELS: Partial<Record<PlatformRegion, string>> = {
  euw1: 'Europe West', eun1: 'Europe Nordic & East', na1: 'North America', kr: 'Korea',
};

export default async function SummonerProfilePage({
  params,
}: {
  params: Promise<{ region: string; riotId: string }>;
}) {
  const { region, riotId } = await params;
  if (!isPlatformRegion(region)) notFound();
  const platform: PlatformRegion = region;

  const parsed = parseRiotIdSegment(riotId);
  if (!parsed) notFound();

  try {
    const account = await getAccountByRiotId(platform, parsed.gameName, parsed.tagLine);
    const summoner = await getSummonerByPuuid(platform, account.puuid);
    const [leagueEntries, matchIds, version] = await Promise.all([
      getLeagueEntriesByPuuid(platform, account.puuid),
      getMatchIdsByPuuid(platform, account.puuid, { count: 10 }),
      getLatestDDragonVersion(),
    ]);
    const matches = await Promise.all(matchIds.map((id) => getMatchById(platform, id)));

    // Search-index feed + rank snapshot, after the response streams. Best-effort.
    after(async () => {
      try {
        const observations = matches.flatMap(observationsFromMatch);
        observations.push({
          puuid: account.puuid,
          gameName: account.gameName,
          tagLine: account.tagLine,
          observedAtMs: Date.now(),
        });
        await upsertRiotIdRows(mergeObservations(platform, observations));
      } catch (error) {
        console.error('riot id indexing failed', error);
      }
      if (process.env.DATABASE_URL) {
        await recordRankSnapshots(account.puuid, leagueEntries); // never throws
      }
    });

    const summaries = matches.map((m) => toMatchSummary(m, account.puuid));
    const participants = matches
      .map((m) => m.info.participants.find((p) => p.puuid === account.puuid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    const solo = leagueEntries.find((e) => e.queueType === 'RANKED_SOLO_5x5') ?? null;
    const flex = leagueEntries.find((e) => e.queueType === 'RANKED_FLEX_SR') ?? null;
    const perf = computeRecentPerformance(participants);
    const pool = computeChampionPool(matches, account.puuid, 4);
    const ladderChip = solo ? formatLadderChip(solo.tier, solo.rank) : null;

    // DB-backed extras — each degrades independently.
    let sparkSeries: number[] = [];
    let analyzedIds: string[] = [];
    let insights: CoachInsight[] = [];
    let skillScores: Record<MetricCategory, number | null> | null = null;
    if (process.env.DATABASE_URL) {
      try {
        sparkSeries = await getSoloRankSeries(account.puuid);
      } catch (error) {
        console.error('rank sparkline unavailable (non-fatal) —', error);
      }
      try {
        analyzedIds = [...(await findAnalyzedMatchIds(account.puuid, matchIds, PROMPT_VERSION))];
      } catch (error) {
        console.error('analyzed-state unavailable (non-fatal) —', error);
      }
      try {
        if (solo && isBenchmarkableTier(solo.tier)) {
          const roleCounts = new Map<string, number>();
          for (const p of participants) {
            if (p.teamPosition) roleCounts.set(p.teamPosition, (roleCounts.get(p.teamPosition) ?? 0) + 1);
          }
          const role = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
          if (role) {
            const rankTier = cohortTier(solo.tier);
            const lookup = await loadBenchmarkLookup(
              { patch: patchFromVersion(version), rankTier, role },
              prismaBenchmarkReader
            );
            if (lookup) {
              insights = deriveCoachInsights(participants, lookup, cohortDisplayLabel(rankTier));
              skillScores = profileSkillScores(participants, lookup);
            }
          }
        }
      } catch (error) {
        console.error('coach insights unavailable (non-fatal) —', error);
      }
    }

    return (
      <div className="summit-bg min-h-screen">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-8">
          <ProfileHero
            gameName={account.gameName}
            tagLine={account.tagLine}
            level={summoner.summonerLevel}
            profileIconId={summoner.profileIconId}
            version={version}
            regionLabel={REGION_LABELS[platform] ?? platform.toUpperCase()}
            ladderChip={ladderChip}
          />
          <CoachStrip insights={insights} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <RankPanel solo={solo} flex={flex} sparkSeries={sparkSeries} />
            <PerformancePanel perf={perf} />
            <SkillProfilePanel scores={skillScores} />
          </div>
          <ChampionPool pool={pool} version={version} />
          <MatchHistory
            matches={summaries}
            version={version}
            basePath={`/${region}/${riotId}`}
            analyzedIds={analyzedIds}
          />
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof RiotApiError && error.status === 404) {
      return (
        <p className="p-8 text-foreground">
          We couldn&apos;t find that summoner. Double check the name, tag, and region.
        </p>
      );
    }
    if (error instanceof RiotApiError && error.status === 429) {
      return (
        <p className="p-8 text-foreground">
          We&apos;re being rate limited by Riot right now. Please wait a moment and try again.
        </p>
      );
    }
    throw error;
  }
}
