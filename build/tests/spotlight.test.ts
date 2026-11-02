import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SPOT_REGIONS, spotSelector } from '../viewer/src/spotlight.js';

// The presenter spotlight (Nov 1): a named region of the page is ringed and the
// rest dimmed, so a recorded take can lead the narration to the part being
// spoken about. Driven from outside the page (window.ypid.spotlight), never by
// the replay itself.
describe('the presenter spotlight', () => {
  test('every named region resolves to one selector, and the three panels are among them', () => {
    for (const name of SPOT_REGIONS) assert.equal(typeof spotSelector(name), 'string');
    assert.equal(spotSelector('chart'), '.panel.chart');
    assert.equal(spotSelector('criteria'), '.panel.criteria');
    assert.equal(spotSelector('draft'), '.panel.draft');
    assert.equal(spotSelector('writ-footnotes'), '#writ-footnotes');
    assert.equal(spotSelector('writ-reason'), '#writ-reason');
    assert.equal(spotSelector('figures'), '#figure-list');
  });

  test('a sentence is addressed by index, and an unknown name is null', () => {
    assert.equal(spotSelector('sentence:3'), 'li.sentence[data-index="3"]');
    assert.equal(spotSelector('nothing-here'), null);
  });
});
