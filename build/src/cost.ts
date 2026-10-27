// List prices per 1M tokens, USD, read from dev.meta.ai/docs/pricing-rate-limits
// and the Baseten and Fireworks model pages on Oct 26, 2026. Thinking tokens
// are already counted inside output_tokens by the Meta API, so they are not
// billed twice here; they are kept in usage for the results table.
export interface Price {
  input: number;
  cachedInput: number;
  output: number;
}

export const PRICES: Record<string, Price> = {
  'muse-spark-1.3': { input: 1.25, cachedInput: 0.15, output: 4.25 },
  'muse-wonder-1.0': { input: 4.0, cachedInput: 0.2, output: 20.0 },
  'muse-spark-open': { input: 1.25, cachedInput: 0.15, output: 4.25 },
};

export interface Usage {
  inputTokens: number; // uncached input only, as the API reports it
  cachedInputTokens: number;
  outputTokens: number; // includes thinking
  thinkingTokens: number;
}

export function costUsd(priceKey: string, usage: Usage): number {
  const p = PRICES[priceKey];
  if (!p) throw new Error(`no price on file for ${priceKey}`);
  return (usage.inputTokens * p.input + usage.cachedInputTokens * p.cachedInput + usage.outputTokens * p.output) / 1_000_000;
}
