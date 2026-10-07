const { test } = require('node:test'), assert = require('node:assert/strict');
const { createBackend } = require('./backend-harness.cjs');

test('GET allows only read actions, matches POST data, and never saves', () => {
 const b=createBackend(), get=action=>JSON.parse(b.context.doGet({parameter:{action}}).text);
 assert.ok(get('getHealth').capabilities.includes('readGet'));
 for(const action of ['getStudents','getCourses','getEnrollments','getSchedule','getHolidays','getTimeSlots','getBootstrap']) {
   assert.deepEqual(get(action).data,b.post(action).data);
 }
 for(const action of ['saveStudent','saveEnrollment','saveSchedule','saveHoliday','toString',undefined]) {
   assert.equal(get(action).code,'METHOD_NOT_ALLOWED');
 }
 assert.equal(b.writes(),0);
 b.data.Students[0][0]='Broken';
 assert.equal(get('getStudents').success,false);
 assert.match(get('getStudents').message,/Students/);
});

test('bootstrap reuses one spreadsheet and preserves individual read results and formulas', () => {
 const b=createBackend(); let opens=0;
 const open=b.context.SpreadsheetApp.openById;
 b.context.SpreadsheetApp.openById=(id)=>{opens++;return open(id);};
 b.setFormula('Schedule',2,7,'=ROW()-1','Session 1');
 const batch=b.post('getBootstrap');
 assert.equal(opens,1); assert.equal(batch.success,true); assert.deepEqual(batch.errors,{});
 for(const key of Object.keys(batch.data)) {
   const action='get'+key[0].toUpperCase()+key.slice(1);
   assert.deepEqual(batch.data[key],b.post(action).data);
 }
 assert.equal(b.writes(),0);
 assert.ok(batch.serverMs>=0);
 b.data.Students[1][1]='Changed directly in Sheets';
 assert.equal(b.post('getBootstrap').data.students[0].StudentName,'Changed directly in Sheets');
});

test('bootstrap reports a broken sheet without dropping other collections', () => {
 const b=createBackend(); b.data.Schedule[0][0]='InvalidHeader';
 const batch=b.post('getBootstrap');
 assert.equal(batch.success,true); assert.match(batch.errors.schedule,/Schedule/);
 assert.equal(batch.data.schedule,undefined); assert.equal(batch.data.students.length,2);
 assert.ok(batch.data.timeSlots.length>2); assert.equal(b.writes(),0);
});
test('version 2.2 reads and writes without a password or token',()=>{
 const b=createBackend(); b.props.delete('ADMIN_PASSWORD');
 const health=JSON.parse(b.context.doGet({parameter:{action:'getHealth'}}).text);
 assert.equal(health.version,'2.2'); assert.equal(health.authMode,'none');
 for(const action of ['getStudents','getCourses','getEnrollments','getSchedule','getHolidays','getTimeSlots']) assert.equal(b.post(action).success,true);
 assert.equal(b.post('saveStudent',{StudentName:'New student',Active:true}).success,true);
 assert.equal(b.post('login').code,'UNKNOWN_ACTION');
 assert.equal(b.post('toString').code,'UNKNOWN_ACTION');
 assert.equal(JSON.parse(b.context.doGet({parameter:{action:'saveStudent'}}).text).code,'METHOD_NOT_ALLOWED');
});
test('schema reads filter blank rows and normalize dates',()=>{
 const b=createBackend(), t=undefined; b.data.Enrollments.push(['','','','','','','','formula tail']);
 const r=b.post('getEnrollments',{},t); assert.equal(r.data.length,2); assert.equal(r.data[0].EnrollDate,'2026-08-09');
 assert.equal(b.post('getSchedule',{},t).data[0].Date,'2026-10-03');
});
test('overlap needs current explicit confirmation and preserves other sessions',()=>{
 const b=createBackend(),t=undefined,p={EnrollmentID:'ENR002',Date:'2026-10-03',StartTime:'11:00',EndTime:'12:00',Note:'new'};
 const before=JSON.stringify(b.data.Schedule[1]); let r=b.post('saveSchedule',p,t); assert.equal(r.code,'CONFLICT'); assert.equal(b.writes(),0);
 assert.match(r.conflicts[0].StudentName,/เอ/); assert.equal(r.conflicts[0].Course,'JuniorBuilder'); assert.equal(r.conflicts[0].Level,'Lv1');
 p.conflictVersion=r.conflictVersion; b.data.Schedule[1][4]='11:30'; r=b.post('saveSchedule',p,t); assert.equal(r.code,'CONFLICT'); assert.equal(b.writes(),0);
 p.conflictVersion=r.conflictVersion; r=b.post('saveSchedule',p,t); assert.equal(r.success,true); assert.equal(r.data.length,2); assert.equal(r.data[1].Duration,'1');
 assert.equal(b.data.Schedule[1][4],'11:30'); assert.equal(b.data.Schedule[1][1],'ENR001');
 assert.equal(b.post('saveSchedule',p,t).success,false); // exact duplicate blocked
});
test('adjacent sessions and self edits need no conflict confirmation',()=>{
 const b=createBackend(),t=undefined; const r=b.post('saveSchedule',{EnrollmentID:'ENR002',Date:'2026-10-03',StartTime:'09:00',EndTime:'10:00'},t); assert.equal(r.success,true);
 assert.equal(b.post('saveSchedule',{ScheduleID:'SCH001',EnrollmentID:'ENR001',Date:'2026-10-03',StartTime:'10:00',EndTime:'11:00'},t).success,true);
});
test('holiday confirmation and invalid input never silently write',()=>{
 const b=createBackend(),t=undefined; b.data.Holidays.push(['2026-10-04','ปิดสถาบัน','งดสอนพิเศษ',true]);
 const p={EnrollmentID:'ENR002',Date:'2026-10-04',StartTime:'10:00',EndTime:'11:00'};
 let r=b.post('saveSchedule',p,t); assert.equal(r.code,'HOLIDAY'); assert.equal(b.writes(),0); p.holidayVersion=r.holidayVersion; assert.equal(b.post('saveSchedule',p,t).success,true);
 assert.equal(b.post('saveSchedule',{...p,Date:'31/02/2026'},t).success,false);
 assert.equal(b.post('saveStudent',{StudentID:'missing',StudentName:'X'},t).success,false);
});
test('editing enrollment preserves original date and notes are persisted',()=>{
 const b=createBackend(),t=undefined; const e=b.post('getEnrollments',{},t).data[0]; e.Note='updated'; assert.equal(b.post('saveEnrollment',e,t).success,true);
 assert.equal(b.data.Enrollments[1][6],'09/08/2026'); assert.equal(b.data.Enrollments[1][7],'updated');
});
