import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { AnalysisOutput } from './analysisOutput';
import type { AnalysisStore, CacheKey, PersistedAnalysis } from './analyzeMatch';

/**
 * Prisma-backed permanent cache for LLM analyses, keyed by
 * (puuid, matchId, type, promptVersion). Injected into `analyzeMatch` from server
 * components; tests use a fake store instead so they never touch a database.
 */
export const prismaAnalysisStore: AnalysisStore = {
  async findCached(key: CacheKey): Promise<AnalysisOutput | null> {
    const row = await prisma.analysis.findUnique({
      where: {
        analysis_cache_key: {
          puuid: key.puuid,
          matchId: key.matchId,
          type: key.type,
          promptVersion: key.promptVersion,
        },
      },
      select: { outputJson: true },
    });
    return row ? (row.outputJson as unknown as AnalysisOutput) : null;
  },

  async save(row: PersistedAnalysis): Promise<void> {
    await prisma.analysis.upsert({
      where: {
        analysis_cache_key: {
          puuid: row.puuid,
          matchId: row.matchId,
          type: row.type,
          promptVersion: row.promptVersion,
        },
      },
      create: {
        puuid: row.puuid,
        matchId: row.matchId,
        type: row.type,
        promptVersion: row.promptVersion,
        modelUsed: row.modelUsed,
        inputFacts: row.inputFacts as unknown as Prisma.InputJsonValue,
        outputJson: row.outputJson as unknown as Prisma.InputJsonValue,
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        costUsd: new Prisma.Decimal(row.costUsd),
      },
      update: {},
    });
  },
};
