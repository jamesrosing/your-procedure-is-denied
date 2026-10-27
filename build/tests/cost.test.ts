import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { costUsd, PRICES } from '../src/cost.js';

describe('costUsd', () => {
  test('bills each token class at its own rate; thinking is inside output and not billed twice', () => {
    const p = PRICES['muse-spark-1.3']!;
    const usd = costUsd('muse-spark-1.3', { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, cacheWriteTokens: 1_000_000, outputTokens: 1_000_000, thinkingTokens: 500_000 });
    assert.equal(usd, p.input + p.cachedInput + p.cacheWrite + p.output);
  });

  test('cache writes are not free: Meta publishes no write price, so they bill at the input rate', () => {
    for (const p of Object.values(PRICES)) assert.equal(p.cacheWrite, p.input);
  });

  test('throws on an unknown model rather than guessing a price', () => {
    assert.throws(() => costUsd('nope', { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, thinkingTokens: 0 }), /price/);
  });

  test('throws on a non-numeric usage field instead of returning NaN', () => {
    const bad = { inputTokens: undefined as unknown as number, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, thinkingTokens: 0 };
    assert.throws(() => costUsd('muse-spark-1.3', bad), /usage/);
  });
});
