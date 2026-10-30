import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { wilson, ruleOfThree, formatInterval } from '../src/stats.js';

describe('intervals for small counts', () => {
  test('Wilson interval brackets the proportion, narrows with n, and handles 0 and n of n', () => {
    const [lo, hi] = wilson(45, 50);
    assert.ok(lo < 0.9 && hi > 0.9);
    assert.ok(lo > 0.78 && lo < 0.80, String(lo)); // 45 of 50: about 0.79 to 0.96
    assert.ok(hi > 0.95 && hi < 0.97, String(hi));
    const [lo50, hi50] = wilson(50, 50);
    assert.ok(lo50 > 0.92 && lo50 < 0.94, String(lo50)); // 50 of 50: about 0.93 to 1
    assert.equal(hi50, 1);
    const [lo0] = wilson(0, 50);
    assert.equal(lo0, 0);
    assert.ok(wilson(90, 100)[1] - wilson(90, 100)[0] < hi - lo);
    assert.throws(() => wilson(0, 0));
  });
  test('rule of three gives the 95 percent upper bound on a rate observed zero times', () => {
    assert.ok(Math.abs(ruleOfThree(5781) - 3 / 5781) < 1e-9);
    assert.throws(() => ruleOfThree(0));
  });
  test('an interval prints as whole percents', () => {
    assert.equal(formatInterval(45, 50), '79 to 96%');
    assert.equal(formatInterval(50, 50), '93 to 100%');
  });
});
