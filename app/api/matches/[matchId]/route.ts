import { NextResponse } from 'next/server';
import { getMatchById } from '@/lib/riot/match';
import { getLeagueEntriesByPuuid } from '@/lib/riot/league';
import { platformFromMatchId } from '@/lib/riot/regions';
import { RiotApiError } from '@/lib/riot/client';
import { buildMatchDetailPayload } from '@/lib/matchDetail';

export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await params;
    const platform = platformFromMatchId(matchId);
    const match = await getMatchById(platform, matchId);
    if (new URL(request.url).searchParams.get('ranks') !== '1') {
      return NextResponse.json(match);
    }
    const payload = await buildMatchDetailPayload(match, (puuid) =>
      getLeagueEntriesByPuuid(platform, puuid)
    );
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof RiotApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
