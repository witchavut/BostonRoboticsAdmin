const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/domain');
test('Thai sheet dates are normalized without US date ambiguity', () => {
  assert.equal(D.date('09/08/2026'), '2026-08-09');
  assert.equal(D.date('9/8/2569'), '2026-08-09');
  assert.equal(D.date('2026-08-09'), '2026-08-09');
  assert.equal(D.date('31/02/2026'), '');
  assert.equal(D.time('9:05:00'), '09:05');
});
test('Bangkok today crosses midnight seven hours before UTC', () => {
  assert.equal(D.today(new Date('2026-10-02T17:01:00Z')), '2026-10-03');
});
test('hours deducted at end, fractional hours, recalculation never double deducts', () => {
  const sessions = [{ Date: '03/10/2026', StartTime: '10:00', EndTime: '11:30' }];
  assert.equal(D.progress(sessions, 8, new Date('2026-10-03T04:29:59Z')).used, 0);
  const expected = { used: 1.5, remaining: 6.5, percent: 19 };
  assert.deepEqual(D.progress(sessions, 8, new Date('2026-10-03T04:30:00Z')), expected);
  assert.deepEqual(D.progress(sessions, 8, new Date('2026-10-04T04:30:00Z')), expected);
});
test('overlap includes partial overlaps but excludes adjacency and self', () => {
  const rows = [{ ScheduleID: 'self', Date: '2026-10-03', StartTime: '10:00', EndTime: '12:00' }, { ScheduleID: 'overlap', Date: '2026-10-03', StartTime: '11:30', EndTime: '13:00' }, { ScheduleID: 'adjacent', Date: '2026-10-03', StartTime: '12:00', EndTime: '14:00' }];
  assert.deepEqual(D.overlaps(rows, rows[0]).map(s => s.ScheduleID), ['overlap']);
});
test('blank rows excluded and booleans consistent', () => {
  assert.equal(D.normalize('enrollments', [{ EnrollmentID: 'ENR001' }, { EnrollmentID: '', Note: 'formula tail' }]).length, 1);
  assert.equal(D.normalize('courses', [{ CourseID: 'C1', Active: 'FALSE' }])[0].Active, false);
});
