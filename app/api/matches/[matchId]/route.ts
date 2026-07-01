import { NextResponse } from 'next/server';
import { getMatchById } from '@/lib/riot/match';
import { platformFromMatchId } from '@/lib/riot/regions';
import { RiotApiError } from '@/lib/riot/client';

export async function GET(_request: Request, { params }: { params: { matchId: string } }) {
  try {
    const platform = platformFromMatchId(params.matchId);
    const match = await getMatchById(platform, params.matchId);
    return NextResponse.json(match);
  } catch (error) {
    if (error instanceof RiotApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
