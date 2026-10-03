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
test('calendar uses Monday-first six-week grids including leap days and year boundaries', () => {
 const oct = D.calendarDays('2026-10');
 assert.equal(oct.length, 42); assert.equal(oct[0], '2026-09-28'); assert.equal(oct[41], '2026-11-08');
 assert.equal(new Set(oct).size, 42);
 assert.ok(D.calendarDays('2028-02').includes('2028-02-29'));
 assert.ok(D.calendarDays('2027-01').includes('2026-12-28'));
});

function learningState() {
  return {
    students: [
      { StudentID: 'S1', StudentName: 'ปุญญ์ ทดสอบ', Nickname: 'ปุญญ์', Active: true },
      { StudentID: 'S1-copy', StudentName: ' ปุญญ์  ทดสอบ ', Nickname: 'ปุญญ์', Active: false },
      { StudentID: 'S2', StudentName: 'อีกคน ทดสอบ', Nickname: 'ปุญญ์', Active: true },
      { StudentID: 'S3', StudentName: 'นักเรียนใหม่', Active: true },
      { StudentID: 'blank', StudentName: '', Nickname: '' }
    ],
    courses: [
      { CourseID: 'C1', Course: 'JuniorDeveloper', Level: 'LV1', SessionCount: 4, TotalHours: 8 },
      { CourseID: 'C2', Course: 'JuniorDeveloper', Level: 'LV2', SessionCount: 4, TotalHours: 8 },
      { CourseID: 'C10', Course: 'JuniorDeveloper', Level: 'LV10', SessionCount: 4, TotalHours: 8 },
      { CourseID: 'B1', Course: 'JuniorBuilder', Level: 'LV1', SessionCount: 4, TotalHours: 8 }
    ],
    enrollments: [
      { EnrollmentID: 'E2', StudentID: 'S1', Course: 'JuniorDeveloper', Level: 'LV2', EnrollmentStatus: 'กำลังเรียน', PaymentStatus: 'ยังไม่ชำระ' },
      { EnrollmentID: 'E10', StudentID: 'S1', Course: 'JuniorDeveloper', Level: 'LV10', EnrollmentStatus: 'พักการเรียน' },
      { EnrollmentID: 'E1', StudentID: 'S1-copy', Course: 'JuniorDeveloper', Level: 'LV1', EnrollmentStatus: 'จบหลักสูตร' },
      { EnrollmentID: 'E-other', StudentID: 'S2', Course: 'JuniorBuilder', Level: 'LV1', EnrollmentStatus: 'ทดลองเรียน' },
      { EnrollmentID: 'E-new', StudentID: 'S3', Course: 'JuniorBuilder', Level: 'LV1', EnrollmentStatus: 'กำลังเรียน', PaymentStatus: 'ยังไม่ชำระ' },
      { EnrollmentID: 'E-missing-student', StudentID: 'missing', Course: 'JuniorDeveloper', Level: 'LV1', EnrollmentStatus: 'กำลังเรียน' },
      { EnrollmentID: 'E-blank-name', StudentID: 'blank', Course: 'JuniorDeveloper', Level: 'LV1', EnrollmentStatus: 'กำลังเรียน' },
      { EnrollmentID: 'E-missing-course', StudentID: 'S1', Course: 'Missing', Level: 'LV1', EnrollmentStatus: 'กำลังเรียน' }
    ],
    schedule: [
      { ScheduleID: 'SCH-old', EnrollmentID: 'E1', Date: '2026-09-01', StartTime: '10:00', EndTime: '12:00', SessionNo: 'Session 4' },
      { ScheduleID: 'SCH-past', EnrollmentID: 'E2', Date: '2026-10-01', StartTime: '10:00', EndTime: '12:00', SessionNo: 'Session 1' },
      { ScheduleID: 'SCH-next', EnrollmentID: 'E2', Date: '2026-10-10', StartTime: '10:00', EndTime: '12:00', SessionNo: 'Session 3' },
      { ScheduleID: 'SCH-rescheduled', EnrollmentID: 'E2', Date: '2026-10-17', StartTime: '10:00', EndTime: '12:00', SessionNo: 'Session 2' },
      { ScheduleID: 'SCH-trial', EnrollmentID: 'E-other', Date: '2026-09-01', StartTime: '10:00', EndTime: '12:00', SessionNo: 1 },
      { ScheduleID: 'SCH-new', EnrollmentID: 'E-new', Date: '2026-10-10', StartTime: '13:00', EndTime: '15:00', SessionNo: 1 }
    ]
  };
}
const statsNow = new Date('2026-10-03T05:00:00Z');

test('session labels preserve the sheet number when dates change', () => {
  for (const value of [3, '3', 'Session 3', 'session 3', 'ครั้งที่ 3']) assert.equal(D.sessionNumber({ SessionNo: value }), 3);
  for (const value of ['', undefined, 0, -2, 1.5, 'Session two', '3 / 4']) assert.equal(D.sessionNumber({ SessionNo: value }), null);
  const state = learningState(), enrollment = state.enrollments[0];
  assert.deepEqual(D.enrollmentProgress(enrollment, state, statsNow).sessions.map(D.sessionNumber), [1, 2, 3]);
  assert.equal(D.sessionNumber(state.schedule.find(s => s.ScheduleID === 'SCH-rescheduled')), 2);
});

test('session target supports optional enrollment override without requiring a new sheet column', () => {
  const state = learningState(), enrollment = state.enrollments[0];
  assert.equal(D.sessionTarget(enrollment, state.courses), 4);
  assert.equal(D.sessionTarget({ ...enrollment, SessionCount: '15' }, state.courses), 15);
  assert.equal(D.sessionTarget({ ...enrollment, SessionCount: '' }, state.courses), 4);
  assert.equal(D.sessionTarget({ Course: 'unknown', Level: 'LV1' }, state.courses), 0);
});

test('calendar validity rejects missing student, course, enrollment, names, or invalid dates and times', () => {
  const state = learningState(), row = state.schedule[0];
  assert.equal(D.validSchedule(row, state), true);
  for (const EnrollmentID of ['unknown', 'E-missing-student', 'E-blank-name', 'E-missing-course']) {
    assert.equal(D.validSchedule({ ...row, EnrollmentID }, state), false, EnrollmentID);
  }
  assert.equal(D.validSchedule({ ...row, Date: '2026-02-30' }, state), false);
  assert.equal(D.validSchedule({ ...row, StartTime: '12:00', EndTime: '10:00' }, state), false);
});

test('session progress counts remaining appointments and unbooked sessions, not merely planned rows', () => {
  const state = learningState();
  const { sessions, ...actual } = D.enrollmentProgress(state.enrollments[0], state, statsNow);
  assert.deepEqual(actual, { target: 4, completed: 1, remaining: 3, scheduled: 3, upcoming: 2, unbooked: 1, usedHours: 2, remainingHours: 6, percent: 25 });
  assert.equal(sessions.length, 3);
  assert.equal(D.enrollmentProgress(state.enrollments[0], state, new Date('2026-10-01T04:59:59Z')).completed, 0);
});

test('same full name combines student history and orders levels numerically without merging shared nicknames', () => {
  const state = learningState();
  assert.deepEqual(D.studentEnrollments('S1', state).filter(e => e.Course === 'JuniorDeveloper').map(e => e.Level), ['LV1', 'LV2', 'LV10']);
  assert.deepEqual(D.studentEnrollments('S1-copy', state), D.studentEnrollments('S1', state));
  const groups = D.studentGroups(state);
  assert.equal(groups.length, 3);
  const merged = groups.find(g => g.student.StudentID === 'S1');
  assert.deepEqual(merged.studentIds, ['S1', 'S1-copy']);
  assert.ok(merged.enrollments.every(e => e.StudentID !== 'S2'));
  assert.equal(D.studentName({ Nickname: 'ปุญญ์' }), 'ปุญญ์');
});

test('student totals count attendance, active course totals include unpaid but exclude trial, paused, and finished study', () => {
  const state = learningState();
  assert.deepEqual(D.studentStats(state, statsNow), {
    total: 2, active: 2, trials: 1,
    activeByCourse: [{ course: 'JuniorBuilder', count: 1 }, { course: 'JuniorDeveloper', count: 1 }]
  });
  state.enrollments[0].SessionCount = 1; // stale active status after finishing still excludes that enrollment
  assert.equal(D.studentStats(state, statsNow).active, 1);
  state.enrollments.find(e => e.EnrollmentID === 'E-new').EnrollmentStatus = 'ยกเลิก';
  assert.equal(D.studentStats(state, statsNow).active, 0);
});

test('one student in multiple active courses counts once overall and once in each course', () => {
  const state = learningState();
  state.enrollments.push({ EnrollmentID: 'E-extra', StudentID: 'S1-copy', Course: 'JuniorBuilder', Level: 'LV1', EnrollmentStatus: 'กำลังเรียน' });
  assert.deepEqual(D.studentStats(state, statsNow), {
    total: 2, active: 2, trials: 1,
    activeByCourse: [{ course: 'JuniorBuilder', count: 2 }, { course: 'JuniorDeveloper', count: 1 }]
  });
});
test('lifetime student count preserves history even if the old course is no longer in the catalogue', () => {
  const state = learningState();
  state.students.push({StudentID:'S-past',StudentName:'Former student'});
  state.enrollments.push({EnrollmentID:'E-past',StudentID:'S-past',Course:'Retired course',Level:'LV1',EnrollmentStatus:'จบหลักสูตร'});
  state.schedule.push({EnrollmentID:'E-past',Date:'2026-09-01',StartTime:'09:00',EndTime:'10:00'});
  assert.equal(D.validSchedule(state.schedule.at(-1),state),false);
  assert.equal(D.studentStats(state,statsNow).total,3);
});
