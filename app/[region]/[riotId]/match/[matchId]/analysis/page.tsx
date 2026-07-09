import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isPlatformRegion, type PlatformRegion } from '@/lib/riot/regions';
import { getAccountByRiotId } from '@/lib/riot/account';
import { getLeagueEntriesByPuuid } from '@/lib/riot/league';
import { getMatchById, getMatchTimeline } from '@/lib/riot/match';
import { parseRiotIdSegment } from '@/lib/riotId';
import { RiotApiError } from '@/lib/riot/client';
import { getLatestDDragonVersion, patchFromVersion } from '@/lib/dataDragon';
import { buildSingleMatchFactSheet, findLaneOpponentPuuid } from '@/lib/analysis/factSheet';
import { extractGoldDiffSeries, extractTimelineFacts } from '@/lib/analysis/timelineFacts';
import { analyzeMatch, PROMPT_VERSION } from '@/lib/analysis/analyzeMatch';
import { prismaAnalysisStore } from '@/lib/analysis/analysisStore';
import { AnalysisView } from '@/components/analysis/AnalysisView';
import { cohortTier, isBenchmarkableTier } from '@/lib/analysis/cohort';
import { loadBenchmarkLookup } from '@/lib/analysis/benchmarkStore';
import {
  enqueueBenchmarkJob,
  hasActiveBenchmarkJob,
  prismaBenchmarkReader,
  saveParticipantFacts,
} from '@/lib/analysis/benchmarkDb';
import { extractMatchFacts } from '@/lib/analysis/participantFacts';
import type { BenchmarkLookup } from '@/lib/analysis/metrics';

export default async function MatchAnalysisPage({
  params,
}: {
  params: Promise<{ region: string; riotId: string; matchId: string }>;
}) {
  const { region, riotId, matchId } = await params;
  if (!isPlatformRegion(region)) notFound();
  const platform: PlatformRegion = region;

  const parsed = parseRiotIdSegment(riotId);
  if (!parsed) notFound();

  const basePath = `/${region}/${riotId}`;

  try {
    const account = await getAccountByRiotId(platform, parsed.gameName, parsed.tagLine);
    const [match, timeline, leagueEntries, version] = await Promise.all([
      getMatchById(platform, matchId),
      getMatchTimeline(platform, matchId),
      getLeagueEntriesByPuuid(platform, account.puuid),
      getLatestDDragonVersion(),
    ]);

    const participant = match.info.participants.find((p) => p.puuid === account.puuid);
    if (!participant) notFound();

    const solo = leagueEntries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
    const rank = solo?.tier ?? 'UNRANKED';
    const patch = patchFromVersion(version);

    // Benchmarks: batched lookup with previous-patch fallback; a true miss
    // enqueues a background cohort fill. Organic facts persist from every view.
    // All of it is best-effort — DB trouble must never break the page.
    const role = participant.teamPosition ?? '';
    const rankTier = isBenchmarkableTier(rank) ? cohortTier(rank) : null;
    let benchmark: BenchmarkLookup | undefined;
    let benchmarkPending = false;
    if (process.env.DATABASE_URL && rankTier && role) {
      try {
        benchmark =
          (await loadBenchmarkLookup({ patch, rankTier, role }, prismaBenchmarkReader)) ??
          undefined;
        saveParticipantFacts(extractMatchFacts(match, timeline, { patch, rankTier })).catch(console.error);
        if (!benchmark) {
          enqueueBenchmarkJob({ patch, rankTier, region: platform }).catch(console.error);
          benchmarkPending = await hasActiveBenchmarkJob(patch, rankTier);
        }
      } catch (error) {
        console.error('benchmarks unavailable (non-fatal) —', error);
      }
    }

    const factSheet = buildSingleMatchFactSheet(match, timeline, account.puuid, {
      rank,
      patch,
      benchmark,
    });

    const goldDiffSeries = extractGoldDiffSeries(
      timeline,
      account.puuid,
      findLaneOpponentPuuid(match, account.puuid)
    );
    const timelineFacts = extractTimelineFacts(timeline, account.puuid);

    const { output, degraded } = await analyzeMatch(
      factSheet,
      { puuid: account.puuid, matchId, type: 'single', promptVersion: PROMPT_VERSION },
      { store: process.env.DATABASE_URL ? prismaAnalysisStore : null }
    );

    return (
      <div className="mx-auto max-w-4xl p-6 md:p-8">
        <Link href={basePath} className="text-sm text-muted-foreground hover:text-accent-foreground">
          {account.gameName}#{account.tagLine}
        </Link>
        <div className="mt-4">
          <AnalysisView
            output={output}
            factSheet={factSheet}
            degraded={degraded}
            kda={{ kills: participant.kills, deaths: participant.deaths, assists: participant.assists }}
            version={version}
            basePath={basePath}
            goldDiffSeries={goldDiffSeries}
            deaths={timelineFacts.deaths}
            benchmarkPending={benchmarkPending}
          />
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof RiotApiError && error.status === 404) {
      return (
        <p className="p-8 text-foreground">
          We couldn&apos;t find that match. It may be too old for Riot&apos;s API, or the summoner
          isn&apos;t in it.
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
