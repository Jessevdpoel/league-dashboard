import type { FactSheet } from './factSheet';
import type { Finding, FindingTag } from './rules';

/**
 * The strict JSON contract the LLM must emit (03-ai-analysis.md). This same shape
 * is produced deterministically by `scorecardFrom` when the LLM is unavailable, so
 * the UI renders identically whether or not prose was generated.
 */
export interface AnalysisStrength {
  title: string;
  body: string;
  metric_refs: string[];
}

export interface AnalysisImprovement {
  title: string;
  body: string;
  priority: number;
  metric_refs: string[];
}

export interface AnalysisTip {
  body: string;
  tag: string;
}

export interface AnalysisOutput {
  headline: string;
  strengths: AnalysisStrength[];
  improvements: AnalysisImprovement[];
  tips: AnalysisTip[];
  focus_next_game: string;
}

export class AnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisValidationError';
  }
}

const isNonEmptyString = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const isStringArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((v) => typeof v === 'string');

/**
 * Validate an untrusted object (parsed LLM JSON) against the AnalysisOutput
 * contract *and* guard against hallucinated metric references: every `metric_refs`
 * entry must be the id of a finding we actually provided. Throws on any violation
 * so the caller can retry / fall back.
 */
export function validateAnalysisOutput(raw: unknown, validFindingIds: Set<string>): AnalysisOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new AnalysisValidationError('output is not an object');
  }
  const o = raw as Record<string, unknown>;

  if (!isNonEmptyString(o.headline)) throw new AnalysisValidationError('headline missing/empty');
  if (!isNonEmptyString(o.focus_next_game)) {
    throw new AnalysisValidationError('focus_next_game missing/empty');
  }
  if (!Array.isArray(o.strengths)) throw new AnalysisValidationError('strengths not an array');
  if (!Array.isArray(o.improvements)) throw new AnalysisValidationError('improvements not an array');
  if (!Array.isArray(o.tips)) throw new AnalysisValidationError('tips not an array');

  const checkRefs = (refs: string[], where: string) => {
    for (const ref of refs) {
      if (!validFindingIds.has(ref)) {
        throw new AnalysisValidationError(`hallucinated metric_ref "${ref}" in ${where}`);
      }
    }
  };

  const strengths: AnalysisStrength[] = o.strengths.map((s, i) => {
    const it = s as Record<string, unknown>;
    if (!isNonEmptyString(it.title) || !isNonEmptyString(it.body) || !isStringArray(it.metric_refs)) {
      throw new AnalysisValidationError(`strengths[${i}] malformed`);
    }
    checkRefs(it.metric_refs, `strengths[${i}]`);
    return { title: it.title, body: it.body, metric_refs: it.metric_refs };
  });

  const improvements: AnalysisImprovement[] = o.improvements.map((s, i) => {
    const it = s as Record<string, unknown>;
    if (
      !isNonEmptyString(it.title) ||
      !isNonEmptyString(it.body) ||
      typeof it.priority !== 'number' ||
      !isStringArray(it.metric_refs)
    ) {
      throw new AnalysisValidationError(`improvements[${i}] malformed`);
    }
    checkRefs(it.metric_refs, `improvements[${i}]`);
    return { title: it.title, body: it.body, priority: it.priority, metric_refs: it.metric_refs };
  });

  const tips: AnalysisTip[] = o.tips.map((s, i) => {
    const it = s as Record<string, unknown>;
    if (!isNonEmptyString(it.body) || !isNonEmptyString(it.tag)) {
      throw new AnalysisValidationError(`tips[${i}] malformed`);
    }
    return { body: it.body, tag: it.tag };
  });

  return { headline: o.headline, strengths, improvements, tips, focus_next_game: o.focus_next_game };
}

const SEVERITY_PRIORITY = { high: 1, medium: 2, low: 3, undefined: 4 } as const;

/** Human-readable label from a finding id, e.g. "early_deaths_to_ganks" -> "Early deaths to ganks". */
function humanize(id: string): string {
  const s = id.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Render a finding's numeric data into a short "3 deaths before 14:00" style clause. */
function describeData(data: Finding['data']): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const label = key.replace(/_/g, ' ');
    parts.push(`${label}: ${Array.isArray(value) ? value.join(', ') : value}`);
  }
  return parts.join('; ');
}

const CATEGORY_FOCUS: Record<FindingTag, string> = {
  laning: 'Focus on a cleaner laning phase — trade efficiently and hit your CS timings.',
  vision: 'Prioritise vision — buy control wards and clear enemy wards before objectives.',
  fighting: 'Look for higher-impact fights — group with your team and commit to winning skirmishes.',
  survivability: 'Cut the avoidable deaths — respect the map and play around your cooldowns.',
  objectives: 'Convert your leads into objectives — turn advantages into towers and dragons.',
};

/**
 * Deterministic, LLM-free analysis built straight from the fact sheet. Used as the
 * graceful-degradation "scorecard" when the LLM is unavailable or keeps failing
 * validation, and as the guaranteed baseline the UI can always render.
 */
export function scorecardFrom(factSheet: FactSheet): AnalysisOutput {
  const { context, findings, focusCategory } = factSheet;
  const strengths = findings.filter((f) => f.kind === 'strength');
  const improvements = findings.filter((f) => f.kind === 'improvement');

  const ordered = [...improvements].sort(
    (a, b) => SEVERITY_PRIORITY[a.severity ?? 'undefined'] - SEVERITY_PRIORITY[b.severity ?? 'undefined']
  );

  const resultWord = context.result === 'win' ? 'Victory' : 'Defeat';
  const focus = focusCategory
    ? CATEGORY_FOCUS[focusCategory]
    : 'Keep stacking clean, consistent games — the fundamentals are holding up.';

  return {
    headline: `${resultWord} on ${context.champion} (${context.role}) — ${context.durationMinutes} min.`,
    strengths: strengths.map((f) => ({
      title: humanize(f.id),
      body: describeData(f.data),
      metric_refs: [f.id],
    })),
    improvements: ordered.map((f, i) => ({
      title: humanize(f.id),
      body: describeData(f.data),
      priority: i + 1,
      metric_refs: [f.id],
    })),
    tips: [],
    focus_next_game: focus,
  };
}
