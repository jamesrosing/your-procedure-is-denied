// List prices per 1M tokens, USD, read from dev.meta.ai/docs/pricing-rate-limits
// and the Baseten and Fireworks model pages on Oct 26, 2026. Thinking tokens
// are already counted inside output_tokens by the Meta API, so they are not
// billed twice here; they are kept in usage for the results table. Meta
// publishes no cache-write price, so cache writes bill at the input rate and
// are tracked separately so the assumption is visible in every result.
export interface Price {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
}

export const PRICES: Record<string, Price> = {
  'muse-spark-1.3': { input: 1.25, cachedInput: 0.15, cacheWrite: 1.25, output: 4.25 },
  'muse-wonder-1.0': { input: 4.0, cachedInput: 0.2, cacheWrite: 4.0, output: 20.0 },
  'muse-spark-open': { input: 1.25, cachedInput: 0.15, cacheWrite: 1.25, output: 4.25 },
};

export interface Usage {
  inputTokens: number; // uncached, non-cache-write input, as the API reports it
  cachedInputTokens: number; // read from cache
  cacheWriteTokens: number; // written to cache on this call
  outputTokens: number; // includes thinking
  thinkingTokens: number;
}

const USAGE_FIELDS: (keyof Usage)[] = ['inputTokens', 'cachedInputTokens', 'cacheWriteTokens', 'outputTokens', 'thinkingTokens'];

export function costUsd(priceKey: string, usage: Usage): number {
  const p = PRICES[priceKey];
  if (!p) throw new Error(`no price on file for ${priceKey}`);
  for (const field of USAGE_FIELDS) {
    const v = usage[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`usage field ${field} is not a number`);
  }
  return (usage.inputTokens * p.input + usage.cachedInputTokens * p.cachedInput + usage.cacheWriteTokens * p.cacheWrite + usage.outputTokens * p.output) / 1_000_000;
}
