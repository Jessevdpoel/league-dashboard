import { NextResponse } from 'next/server';
import { processFillTick, sweepDirtyCohorts } from '@/lib/analysis/benchmarkFill';
import { prismaFillStore, riotFetcher } from '@/lib/analysis/benchmarkDb';

// ~50 sequential Riot requests can take up to ~60s with backoff.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * One benchmark-fill tick. Schedule every minute (external scheduler or Vercel
 * Cron — see vercel.json; Hobby-tier crons are daily, use cron-job.org or the
 * `benchmarks:fill` CLI for minutely cadence). Guarded by CRON_SECRET.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const tick = await processFillTick({ store: prismaFillStore, riot: riotFetcher });
  const sweptCohorts = await sweepDirtyCohorts(prismaFillStore);
  return NextResponse.json({ tick, sweptCohorts });
}
