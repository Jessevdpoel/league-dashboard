import type { MetricCategory } from './metrics';
import { weightsForRole } from './roleWeights';

/**
 * Role-weighted overall performance score (0–100) — the number the ScoreGauge
 * shows. Weighted mean of the non-null category scores using the same role
 * weights the coaching focus uses. Null when no category has a score yet
 * (no benchmark data — see 07-remaining-work.md F1).
 */
export function computeOverallScore(
  scores: Record<MetricCategory, number | null>,
  role: string | undefined
): number | null {
  const weights = weightsForRole(role);
  let weightedSum = 0;
  let weightTotal = 0;
  for (const category of Object.keys(scores) as MetricCategory[]) {
    const score = scores[category];
    if (score === null) continue;
    weightedSum += score * weights[category];
    weightTotal += weights[category];
  }
  if (weightTotal === 0) return null;
  return Math.round(weightedSum / weightTotal);
}
