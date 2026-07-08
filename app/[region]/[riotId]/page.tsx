import { after } from 'next/server';
import { notFound } from 'next/navigation';
import { isPlatformRegion, type PlatformRegion } from '@/lib/riot/regions';
import { getAccountByRiotId } from '@/lib/riot/account';
import { getSummonerByPuuid } from '@/lib/riot/summoner';
import { getLeagueEntriesByPuuid } from '@/lib/riot/league';
import { getMatchIdsByPuuid, getMatchById } from '@/lib/riot/match';
import { parseRiotIdSegment } from '@/lib/riotId';
import { toMatchSummary, computeTopChampions } from '@/lib/matchStats';
import { RiotApiError } from '@/lib/riot/client';
import { getLatestDDragonVersion } from '@/lib/dataDragon';
import { observationsFromMatch, mergeObservations } from '@/lib/riotIdIndex';
import { upsertRiotIdRows } from '@/lib/riotIdIndexStore';
import { RankCard } from '@/components/RankCard';
import { RecentFormCard } from '@/components/RecentFormCard';
import { TopChampionsCard } from '@/components/TopChampionsCard';
import { MatchHistory } from '@/components/MatchHistory';

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

    // Feed every Riot ID we just saw into the self-built search index.
    // Runs after the response streams; failures must never affect the page.
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
    });

    const summaries = matches.map((match) => toMatchSummary(match, account.puuid));
    const soloQueueEntry = leagueEntries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5') ?? null;
    const recentResults = summaries.map((summary) => summary.win);
    const championParticipants = matches
      .map((match) => match.info.participants.find((p) => p.puuid === account.puuid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    const topChampions = computeTopChampions(championParticipants);

    return (
      <div className="flex flex-col gap-6 p-8 max-w-5xl mx-auto">
        <header>
          <h1 className="text-3xl font-bold text-foreground">
            {account.gameName}#{account.tagLine}
          </h1>
          <p className="text-muted-foreground font-semibold">Level {summoner.summonerLevel}</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RankCard entry={soloQueueEntry} />
          <RecentFormCard results={recentResults} />
          <TopChampionsCard champions={topChampions} version={version} />
        </div>
        <section>
          <h2 className="text-xl font-bold text-foreground mb-3">Match History</h2>
          <MatchHistory matches={summaries} version={version} basePath={`/${region}/${riotId}`} />
        </section>
      </div>
    );
  } catch (error) {
    if (error instanceof RiotApiError && error.status === 404) {
      return (
        <p className="text-foreground p-8">
          We couldn&apos;t find that summoner. Double check the name, tag, and region.
        </p>
      );
    }
    if (error instanceof RiotApiError && error.status === 429) {
      return (
        <p className="text-foreground p-8">
          We&apos;re being rate limited by Riot right now. Please wait a moment and try again.
        </p>
      );
    }
    throw error;
  }
}
