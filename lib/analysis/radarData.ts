import type { MetricCategory } from '@/lib/analysis/metrics';

const CATEGORY_LABELS: ReadonlyArray<[MetricCategory, string]> = [
  ['laning', 'Laning'],
  ['vision', 'Vision'],
  ['fighting', 'Fighting'],
  ['survivability', 'Survivability'],
];

/**
 * Null when any category lacks a score — a partial radar shape misleads.
 *
 * Deliberately kept in a plain (non `'use client'`) module: it's pure data
 * transformation with no browser/React dependency, and needs to be callable
 * directly from Server Components (e.g. `SkillProfilePanel`) to decide
 * whether to render the panel at all. A function exported from a
 * `'use client'` file becomes a client reference that can only be rendered
 * as a component, not invoked directly, from server code.
 */
export function radarData(
  scores: Record<MetricCategory, number | null>
): Array<{ skill: string; score: number }> | null {
  const data: Array<{ skill: string; score: number }> = [];
  for (const [category, label] of CATEGORY_LABELS) {
    const score = scores[category];
    if (score === null) return null;
    data.push({ skill: label, score });
  }
  return data;
}
