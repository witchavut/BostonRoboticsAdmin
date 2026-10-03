const { test } = require('node:test'), assert = require('node:assert/strict');
const { createBackend } = require('./backend-harness.cjs');
test('all personal data actions reject anonymous calls and sessions invalidate on logout',()=>{
 const b=createBackend(); for(const action of ['getStudents','getCourses','getEnrollments','getSchedule','getHolidays','saveStudent','saveSchedule']) assert.equal(b.post(action).code,'UNAUTHORIZED');
 assert.equal(JSON.parse(b.context.doGet({parameter:{action:'getStudents'}}).text).code,'UNAUTHORIZED');
 const token=b.login(); assert.equal(b.post('getStudents',{},token).success,true); b.post('logout',{},token); assert.equal(b.post('getStudents',{},token).code,'UNAUTHORIZED');
});
test('password failures rate limited and missing setup fails closed',()=>{
 const b=createBackend(); for(let i=0;i<5;i++) assert.equal(b.post('login',{password:'wrong'}).success,false);
 assert.match(b.post('login',{password:'test-only-password-123'}).message,/1 นาที/);
 const c=createBackend(); c.props.delete('ADMIN_PASSWORD'); assert.equal(c.post('login',{password:''}).success,false);
});
test('schema reads filter blank rows and normalize dates',()=>{
 const b=createBackend(), t=b.login(); b.data.Enrollments.push(['','','','','','','','formula tail']);
 const r=b.post('getEnrollments',{},t); assert.equal(r.data.length,2); assert.equal(r.data[0].EnrollDate,'2026-08-09');
 assert.equal(b.post('getSchedule',{},t).data[0].Date,'2026-10-03');
});
test('overlap needs current explicit confirmation and preserves other sessions',()=>{
 const b=createBackend(),t=b.login(),p={EnrollmentID:'ENR002',Date:'2026-10-03',StartTime:'11:00',EndTime:'13:00',Note:'new'};
 const before=JSON.stringify(b.data.Schedule[1]); let r=b.post('saveSchedule',p,t); assert.equal(r.code,'CONFLICT'); assert.equal(b.writes(),0);
 assert.match(r.conflicts[0].StudentName,/เอ/); assert.equal(r.conflicts[0].Course,'JuniorBuilder'); assert.equal(r.conflicts[0].Level,'Lv1');
 p.conflictVersion=r.conflictVersion; b.data.Schedule[1][4]='12:30'; r=b.post('saveSchedule',p,t); assert.equal(r.code,'CONFLICT'); assert.equal(b.writes(),0);
 p.conflictVersion=r.conflictVersion; r=b.post('saveSchedule',p,t); assert.equal(r.success,true); assert.equal(r.data.length,2); assert.equal(r.data[1].Duration,'2');
 assert.equal(b.data.Schedule[1][4],'12:30'); assert.equal(b.data.Schedule[1][1],'ENR001');
 assert.equal(b.post('saveSchedule',p,t).success,false); // exact duplicate blocked
});
test('adjacent sessions and self edits need no conflict confirmation',()=>{
 const b=createBackend(),t=b.login(); const r=b.post('saveSchedule',{EnrollmentID:'ENR002',Date:'2026-10-03',StartTime:'12:00',EndTime:'13:30'},t); assert.equal(r.success,true);
 assert.equal(b.post('saveSchedule',{ScheduleID:'SCH001',EnrollmentID:'ENR001',Date:'2026-10-03',StartTime:'10:00',EndTime:'11:00'},t).success,true);
});
test('holiday confirmation and invalid input never silently write',()=>{
 const b=createBackend(),t=b.login(); b.data.Holidays.push(['2026-10-04','ปิดสถาบัน','งดสอนพิเศษ',true]);
 const p={EnrollmentID:'ENR002',Date:'2026-10-04',StartTime:'10:00',EndTime:'11:00'};
 let r=b.post('saveSchedule',p,t); assert.equal(r.code,'HOLIDAY'); assert.equal(b.writes(),0); p.holidayVersion=r.holidayVersion; assert.equal(b.post('saveSchedule',p,t).success,true);
 assert.equal(b.post('saveSchedule',{...p,Date:'31/02/2026'},t).success,false);
 assert.equal(b.post('saveStudent',{StudentID:'missing',StudentName:'X'},t).success,false);
});
test('editing enrollment preserves original date and notes are persisted',()=>{
 const b=createBackend(),t=b.login(); const e=b.post('getEnrollments',{},t).data[0]; e.Note='updated'; assert.equal(b.post('saveEnrollment',e,t).success,true);
 assert.equal(b.data.Enrollments[1][6],'09/08/2026'); assert.equal(b.data.Enrollments[1][7],'updated');
});
