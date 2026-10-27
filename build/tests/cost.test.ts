import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { costUsd, PRICES } from '../src/cost.js';

describe('costUsd', () => {
  test('bills cached input at the cached rate and thinking as output', () => {
    const p = PRICES['muse-spark-1.3']!;
    const usd = costUsd('muse-spark-1.3', { inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 1_000_000, thinkingTokens: 500_000 });
    assert.equal(usd, p.input + p.cachedInput + p.output);
  });

  test('throws on an unknown model rather than guessing a price', () => {
    assert.throws(() => costUsd('nope', { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, thinkingTokens: 0 }), /price/);
  });
});
