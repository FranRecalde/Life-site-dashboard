import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, rangeDays, rangeStart, revealDateScrollLeft, shiftRange } from './view';

test('timeline periods cross month, year and DST boundaries without truncating dates', () => {
  assert.equal(addDays('2026-10-20', rangeDays('2026-10-20', 'fortnight') - 1), '2026-11-02');
  assert.equal(rangeDays('2026-10-22', 'day'), 1);
  assert.equal(shiftRange('2026-10-22', 'day', 1), '2026-10-23');
  assert.equal(shiftRange('2026-10-22', 'week', 1), '2026-10-29');
  assert.equal(shiftRange('2026-10-20', 'fortnight', -1), '2026-10-06');
  assert.equal(rangeStart('2026-10-22', 'month'), '2026-10-01');
  assert.equal(rangeDays('2026-10-01', 'month'), 31);
  assert.equal(rangeDays('2028-02-01', 'month'), 29);
  assert.equal(rangeDays('2027-02-01', 'month'), 28);
  assert.equal(shiftRange('2026-12-31', 'month', 1), '2027-01-01');
  assert.equal(shiftRange('2027-01-01', 'month', -1), '2026-12-01');
});

test('selecting a visible date after dragging preserves timeline scroll; clipped dates reveal only as needed', () => {
  // The clip: moving Thursday's block to visible Friday must not align Friday left.
  assert.equal(revealDateScrollLeft(0, 1000, 280, 610, 110), 0);
  assert.equal(revealDateScrollLeft(330, 1000, 280, 830, 110), 330);
  assert.equal(revealDateScrollLeft(330, 1000, 280, 610, 110), 330);
  // Reveal a date hidden by the sticky project column or beyond the right edge.
  assert.equal(revealDateScrollLeft(330, 1000, 280, 500, 110), 220);
  assert.equal(revealDateScrollLeft(0, 1000, 280, 940, 110), 50);
  // Phone viewport with its narrower sticky column.
  assert.equal(revealDateScrollLeft(0, 342, 132, 132, 110), 0);
  assert.equal(revealDateScrollLeft(0, 342, 132, 242, 110), 10);
});
