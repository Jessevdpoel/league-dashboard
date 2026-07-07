import type { AnalysisType } from '@prisma/client';

/**
 * Runtime model IDs — exact API strings, no date suffixes (03-ai-analysis.md).
 * Opus is intentionally absent: it is offline/batch-only and must never be routed
 * to at runtime.
 */
export type RuntimeModel = 'claude-haiku-4-5' | 'claude-sonnet-5';

/** Standard per-MTok pricing verified 2026-07-06. Intro discounts ignored (upper bound). */
const PRICING: Record<RuntimeModel, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
};

/**
 * Model routing: the hard reasoning already happened in the stats engine, so a
 * single match only needs "facts -> fluent prose" (Haiku, 5x cheaper). Cross-game
 * trend narration benefits from more reasoning (Sonnet), and runs at most daily.
 */
export function modelForAnalysis(type: AnalysisType): RuntimeModel {
  return type === 'trend' ? 'claude-sonnet-5' : 'claude-haiku-4-5';
}

/** The model to retry on when the primary keeps failing JSON validation. */
export function fallbackModel(): RuntimeModel {
  return 'claude-sonnet-5';
}

/** USD cost of a completed call. Cache reads/writes are not modelled (upper bound). */
export function costUsd(model: RuntimeModel, tokensIn: number, tokensOut: number): number {
  const p = PRICING[model];
  const raw = (tokensIn / 1_000_000) * p.input + (tokensOut / 1_000_000) * p.output;
  return Math.round(raw * 1_000_000) / 1_000_000; // 6dp, matches Decimal(10,6)
}
