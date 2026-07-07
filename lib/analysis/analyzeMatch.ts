import type { AnalysisType } from '@prisma/client';
import type { FactSheet } from './factSheet';
import {
  AnalysisValidationError,
  scorecardFrom,
  validateAnalysisOutput,
  type AnalysisOutput,
} from './analysisOutput';
import { costUsd, fallbackModel, modelForAnalysis, type RuntimeModel } from './pricing';
import { PROMPT_VERSION, SINGLE_MATCH_SYSTEM_PROMPT, userMessageFor } from './prompt';

/** Minimal shape of the Anthropic Messages API we depend on (injectable for tests). */
export interface AnthropicMessagesClient {
  messages: {
    create(body: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: 'user'; content: string }[];
    }): Promise<{
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export interface CacheKey {
  puuid: string;
  matchId: string;
  type: AnalysisType;
  promptVersion: string;
}

export interface PersistedAnalysis extends CacheKey {
  modelUsed: string;
  inputFacts: FactSheet;
  outputJson: AnalysisOutput;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

/** Permanent cache of analyses. A finished match never changes, so this is safe. */
export interface AnalysisStore {
  findCached(key: CacheKey): Promise<AnalysisOutput | null>;
  save(row: PersistedAnalysis): Promise<void>;
}

export interface AnalyzeDeps {
  /** undefined => build from ANTHROPIC_API_KEY; null => force scorecard degradation. */
  anthropic?: AnthropicMessagesClient | null;
  store?: AnalysisStore | null;
  maxTokens?: number;
}

export interface AnalyzeResult {
  output: AnalysisOutput;
  /** Served from the permanent cache (no LLM call). */
  cached: boolean;
  /** Scorecard fallback with no LLM prose (no key, LLM failure, or repeated invalid JSON). */
  degraded: boolean;
  modelUsed: string | null;
}

/** Parse a model text response into JSON, tolerating stray markdown fences. */
function parseModelJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(trimmed);
}

async function callModel(
  client: AnthropicMessagesClient,
  model: RuntimeModel,
  factSheet: FactSheet,
  maxTokens: number,
  validIds: Set<string>
): Promise<{ output: AnalysisOutput; tokensIn: number; tokensOut: number }> {
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: SINGLE_MATCH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessageFor(factSheet) }],
  });
  const text = res.content.find((b) => b.type === 'text')?.text ?? '';
  const output = validateAnalysisOutput(parseModelJson(text), validIds);
  return { output, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens };
}

/** Lazily construct the real SDK client from env; returns null when no key is set. */
async function resolveAnthropic(
  provided: AnthropicMessagesClient | null | undefined
): Promise<AnthropicMessagesClient | null> {
  if (provided !== undefined) return provided;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey }) as unknown as AnthropicMessagesClient;
}

/**
 * Turn a fact sheet into a coaching analysis: cache-first, LLM (Haiku) for prose,
 * validated + hallucination-guarded, with a single Sonnet retry, and a deterministic
 * scorecard fallback that always renders. The heavy reasoning already lives in the
 * stats engine; this layer only narrates it.
 */
export async function analyzeMatch(
  factSheet: FactSheet,
  key: CacheKey,
  deps: AnalyzeDeps = {}
): Promise<AnalyzeResult> {
  const store = deps.store ?? null;
  const validIds = new Set(factSheet.findings.map((f) => f.id));

  if (store) {
    const hit = await store.findCached(key);
    if (hit) return { output: hit, cached: true, degraded: false, modelUsed: null };
  }

  const client = await resolveAnthropic(deps.anthropic);
  if (!client) {
    return { output: scorecardFrom(factSheet), cached: false, degraded: true, modelUsed: null };
  }

  const maxTokens = deps.maxTokens ?? 1200;
  const primary = modelForAnalysis(key.type);
  const attempts: RuntimeModel[] = [primary];
  if (fallbackModel() !== primary) attempts.push(fallbackModel());

  let lastError: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    const model = attempts[i];
    const isLast = i === attempts.length - 1;
    try {
      const { output, tokensIn, tokensOut } = await callModel(
        client,
        model,
        factSheet,
        maxTokens,
        validIds
      );
      if (store) {
        await store.save({
          ...key,
          modelUsed: model,
          inputFacts: factSheet,
          outputJson: output,
          tokensIn,
          tokensOut,
          costUsd: costUsd(model, tokensIn, tokensOut),
        });
      }
      return { output, cached: false, degraded: false, modelUsed: model };
    } catch (err) {
      lastError = err;
      // Retry the fallback model only for our own validation failures. A transport
      // error would just repeat, so fall straight through to the scorecard.
      if (!(err instanceof AnalysisValidationError) || isLast) break;
    }
  }

  if (lastError) console.error('analyzeMatch: falling back to scorecard —', lastError);
  return { output: scorecardFrom(factSheet), cached: false, degraded: true, modelUsed: null };
}

export { PROMPT_VERSION };
