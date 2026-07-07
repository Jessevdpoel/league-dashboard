import { describe, it, expect, vi } from 'vitest';
import type { FactSheet } from '../../lib/analysis/factSheet';
import {
  validateAnalysisOutput,
  scorecardFrom,
  AnalysisValidationError,
  type AnalysisOutput,
} from '../../lib/analysis/analysisOutput';
import { costUsd, modelForAnalysis, fallbackModel } from '../../lib/analysis/pricing';
import {
  analyzeMatch,
  type AnthropicMessagesClient,
  type AnalysisStore,
  type CacheKey,
} from '../../lib/analysis/analyzeMatch';

// --- Fixtures -------------------------------------------------------------

function mkFactSheet(over: Partial<FactSheet> = {}): FactSheet {
  return {
    context: {
      champion: 'Ahri',
      role: 'MIDDLE',
      rank: 'GOLD',
      result: 'loss',
      durationMinutes: 28.4,
      patch: '14.13',
      opponent: 'Zed',
    },
    scores: { laning: 40, vision: null, fighting: 55, survivability: 30 },
    findings: [
      { id: 'early_deaths_to_ganks', kind: 'improvement', severity: 'high', tag: 'survivability', data: { deaths_pre14: 3, gank_death_minutes: [6.2, 9.1, 12.8] } },
      { id: 'weak_early_farm', kind: 'improvement', severity: 'medium', tag: 'laning', data: { cs_at_10: 48 } },
      { id: 'strong_teamfighting', kind: 'strength', tag: 'fighting', data: { damage_share: 0.31, kill_participation: 0.66 } },
    ],
    focusCategory: 'survivability',
    trend: null,
    ...over,
  };
}

const KEY: CacheKey = { puuid: 'p1', matchId: 'EUW1_1', type: 'single', promptVersion: 'single-v1' };

const validOutput: AnalysisOutput = {
  headline: 'A close loss where your teamfighting carried but early ganks piled up.',
  strengths: [{ title: 'Teamfight impact', body: '31% damage share and 66% KP.', metric_refs: ['strong_teamfighting'] }],
  improvements: [{ title: 'Dying to early ganks', body: '3 deaths before 14:00.', priority: 1, metric_refs: ['early_deaths_to_ganks'] }],
  tips: [{ body: 'Track the enemy jungler after level 3.', tag: 'survivability' }],
  focus_next_game: 'Ward your flanks before minute 6.',
};

function mkClient(text: string, usage = { input_tokens: 1500, output_tokens: 600 }): AnthropicMessagesClient {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text }], usage }),
    },
  };
}

function mkStore(cached: AnalysisOutput | null = null) {
  const saved: unknown[] = [];
  const store: AnalysisStore = {
    findCached: vi.fn().mockResolvedValue(cached),
    save: vi.fn(async (row) => { saved.push(row); }),
  };
  return { store, saved };
}

// --- validateAnalysisOutput ----------------------------------------------

describe('validateAnalysisOutput', () => {
  const ids = new Set(['early_deaths_to_ganks', 'weak_early_farm', 'strong_teamfighting']);

  it('accepts a well-formed output that cites real finding ids', () => {
    expect(validateAnalysisOutput(validOutput, ids)).toEqual(validOutput);
  });

  it('rejects a hallucinated metric_ref (hallucination guard)', () => {
    const bad = { ...validOutput, improvements: [{ ...validOutput.improvements[0], metric_refs: ['made_up_id'] }] };
    expect(() => validateAnalysisOutput(bad, ids)).toThrow(AnalysisValidationError);
  });

  it('rejects a missing headline', () => {
    const bad = { ...validOutput, headline: '' };
    expect(() => validateAnalysisOutput(bad, ids)).toThrow(/headline/);
  });

  it('rejects an improvement without a numeric priority', () => {
    const bad = { ...validOutput, improvements: [{ title: 't', body: 'b', metric_refs: [], priority: 'high' }] };
    expect(() => validateAnalysisOutput(bad, ids)).toThrow(AnalysisValidationError);
  });
});

// --- scorecardFrom --------------------------------------------------------

describe('scorecardFrom', () => {
  it('builds a valid, self-consistent output from the fact sheet alone', () => {
    const card = scorecardFrom(mkFactSheet());
    // Round-trips through the same validator the LLM output must pass.
    const ids = new Set(mkFactSheet().findings.map((f) => f.id));
    expect(() => validateAnalysisOutput(card, ids)).not.toThrow();
    expect(card.strengths).toHaveLength(1);
    expect(card.improvements).toHaveLength(2);
    // Highest severity improvement is prioritised first.
    expect(card.improvements[0].metric_refs).toEqual(['early_deaths_to_ganks']);
    expect(card.improvements[0].priority).toBe(1);
  });
});

// --- pricing --------------------------------------------------------------

describe('pricing + routing', () => {
  it('routes single matches to Haiku and trends to Sonnet', () => {
    expect(modelForAnalysis('single')).toBe('claude-haiku-4-5');
    expect(modelForAnalysis('trend')).toBe('claude-sonnet-5');
    expect(fallbackModel()).toBe('claude-sonnet-5');
  });

  it('computes cost from per-MTok pricing', () => {
    // 1500 in, 600 out on Haiku: 1500/1e6*1 + 600/1e6*5 = 0.0015 + 0.003 = 0.0045
    expect(costUsd('claude-haiku-4-5', 1500, 600)).toBeCloseTo(0.0045, 6);
    expect(costUsd('claude-sonnet-5', 1500, 600)).toBeCloseTo(0.0135, 6);
  });
});

// --- analyzeMatch orchestration ------------------------------------------

describe('analyzeMatch', () => {
  it('serves from cache without calling the model', async () => {
    const client = mkClient('{}');
    const { store } = mkStore(validOutput);
    const res = await analyzeMatch(mkFactSheet(), KEY, { anthropic: client, store });
    expect(res).toMatchObject({ cached: true, degraded: false });
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it('calls Haiku, validates, and persists on a cache miss', async () => {
    const client = mkClient(JSON.stringify(validOutput));
    const { store, saved } = mkStore(null);
    const res = await analyzeMatch(mkFactSheet(), KEY, { anthropic: client, store });
    expect(res).toMatchObject({ cached: false, degraded: false, modelUsed: 'claude-haiku-4-5' });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ modelUsed: 'claude-haiku-4-5', costUsd: 0.0045 });
  });

  it('tolerates markdown-fenced JSON', async () => {
    const client = mkClient('```json\n' + JSON.stringify(validOutput) + '\n```');
    const { store } = mkStore(null);
    const res = await analyzeMatch(mkFactSheet(), KEY, { anthropic: client, store });
    expect(res.degraded).toBe(false);
  });

  it('retries on Sonnet when Haiku returns invalid JSON, then succeeds', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '{"headline": ""}' }], usage: { input_tokens: 1, output_tokens: 1 } })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify(validOutput) }], usage: { input_tokens: 1500, output_tokens: 600 } });
    const client = { messages: { create } } as AnthropicMessagesClient;
    const { store } = mkStore(null);
    const res = await analyzeMatch(mkFactSheet(), KEY, { anthropic: client, store });
    expect(create).toHaveBeenCalledTimes(2);
    expect(res.modelUsed).toBe('claude-sonnet-5');
  });

  it('degrades to a scorecard when both attempts fail validation', async () => {
    const client = mkClient('{"nope": true}');
    const { store, saved } = mkStore(null);
    const res = await analyzeMatch(mkFactSheet(), KEY, { anthropic: client, store });
    expect(res.degraded).toBe(true);
    expect(res.modelUsed).toBeNull();
    expect(saved).toHaveLength(0);
    expect(res.output.improvements.length).toBeGreaterThan(0); // scorecard populated
  });

  it('degrades to a scorecard when no client is available (no API key)', async () => {
    const { store } = mkStore(null);
    const res = await analyzeMatch(mkFactSheet(), KEY, { anthropic: null, store });
    expect(res).toMatchObject({ degraded: true, modelUsed: null, cached: false });
  });
});
