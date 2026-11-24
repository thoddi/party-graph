import test from 'node:test';
import assert from 'node:assert/strict';
import { rowCenter, CARD_SIZE, ROW_GAP } from '../src/services/layout.js';

test('the middle of a row follows the measured card size and gap', () => {
  assert.equal(rowCenter(0, 96, 16), 48);
  assert.equal(rowCenter(2, 96, 16), 2 * 112 + 48);
  assert.equal(rowCenter(1), CARD_SIZE + ROW_GAP + CARD_SIZE / 2);   // desktop values when nothing is measured
});
