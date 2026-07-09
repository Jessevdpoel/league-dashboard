/**
 * Dev/manual benchmark filler:
 *   npm run benchmarks:fill                          # drain all pending jobs
 *   npm run benchmarks:fill -- --enqueue GOLD euw1   # pre-warm a cohort, then drain
 * Same engine as the cron route; the local rate limiter paces requests.
 */
process.loadEnvFile?.('.env');

async function main(): Promise<void> {
  // Import after env load: lib/db.ts reads DATABASE_URL at module init.
  const { processFillTick, sweepDirtyCohorts } = await import('../lib/analysis/benchmarkFill');
  const { prismaFillStore, riotFetcher, enqueueBenchmarkJob } = await import(
    '../lib/analysis/benchmarkDb'
  );
  const { cohortTier } = await import('../lib/analysis/cohort');
  const { getLatestDDragonVersion, patchFromVersion } = await import('../lib/dataDragon');

  const args = process.argv.slice(2);
  if (args[0] === '--enqueue') {
    const [, tier, region] = args;
    if (!tier || !region) {
      console.error('Usage: npm run benchmarks:fill -- --enqueue <TIER> <region>');
      process.exit(1);
    }
    const patch = patchFromVersion(await getLatestDDragonVersion());
    await enqueueBenchmarkJob({ patch, rankTier: cohortTier(tier), region });
    console.log(`Enqueued fill for ${patch} ${cohortTier(tier)} (${region})`);
  }

  for (;;) {
    const result = await processFillTick({ store: prismaFillStore, riot: riotFetcher });
    if (!result) break;
    console.log(
      `tick: job ${result.jobId} — ${result.requestsUsed} requests, ` +
        `${result.matchesProcessed} matches${result.finished ? ', FINISHED' : ''}`
    );
  }
  const swept = await sweepDirtyCohorts(prismaFillStore);
  console.log(`No pending jobs. Dirty cohorts re-aggregated: ${swept}.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
