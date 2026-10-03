const { test } = require('node:test'), assert = require('node:assert/strict');
const { createBackend } = require('./backend-harness.cjs');

function enrollment(count=1, overrides={}) {
  return { StudentID:'STU002', Course:'JuniorBuilder', Level:'Lv2', EnrollmentStatus:'กำลังเรียน', PaymentStatus:'ยังไม่ชำระ', Note:'new', SessionCount:count,
    Sessions:Array.from({length:Math.max(0,count)},(_,i)=>({Date:`2026-10-${String(i+4).padStart(2,'0')}`,StartTime:'13:00',EndTime:'15:00'})), ...overrides };
}
function addPerson(b,n,course='JuniorBuilder',name=`นักเรียน ${n}`) {
  const student=`STU${String(n).padStart(3,'0')}`, id=`ENR${String(n).padStart(3,'0')}`;
  b.data.Students.push([student,name,'','','',true,'']);
  b.data.Enrollments.push([id,student,course,'Lv1','กำลังเรียน','ชำระแล้ว','2026-10-01','']);
  return id;
}
function schedule(b,n,id,start='10:00',end='12:00',date='2026-10-03') {
  b.data.Schedule.push([`SCH${String(n).padStart(3,'0')}`,id,date,start,end,2,'Session 1','']);
}
function confirm(b,action,p) {
  let r=b.post(action,p);
  if(r.code==='CONFLICT') {p.conflictVersion=r.conflictVersion;r=b.post(action,p);}
  if(r.code==='HOLIDAY') {p.holidayVersion=r.holidayVersion;r=b.post(action,p);}
  return r;
}

test('time slots come from Lists, retain late closing times, and reject lunch/off-list times',()=>{
  const b=createBackend(),slots=b.post('getTimeSlots').data;
  assert.equal(slots[0],'09:00');assert.equal(slots.at(-1),'21:30');assert.ok(!slots.includes('12:30'));
  const p={EnrollmentID:'ENR002',Date:'2026-10-04',StartTime:'20:00',EndTime:'21:30'};
  assert.equal(b.post('saveSchedule',p).success,true);
  const before=b.writes();
  for(const [start,end] of [['10:15','11:00'],['12:00','13:00'],['11:00','14:00'],['21:00','22:00']]) assert.equal(b.post('saveSchedule',{...p,StartTime:start,EndTime:end}).code,'INVALID_TIME_SLOT');
  assert.equal(b.writes(),before);
  b.data.Lists[1][4]='08:30';assert.equal(b.post('getTimeSlots').data[0],'08:30');
});

test('create enrollment saves 15 numbered appointments and target count as one validated batch',()=>{
  const b=createBackend(),p=enrollment(15),r=b.post('saveEnrollment',p);
  assert.equal(r.success,true);assert.equal(r.data.length,3);assert.equal(r.schedule.length,16);
  const saved=r.data.find(e=>e.EnrollmentID===r.EnrollmentID),own=r.schedule.filter(s=>s.EnrollmentID===r.EnrollmentID);
  assert.equal(saved.SessionCount,'15');assert.equal(saved.PaymentStatus,'ยังไม่ชำระ');
  assert.equal(own[0].SessionNo,'Session 1');assert.equal(own.at(-1).SessionNo,'Session 15');assert.equal(own.at(-1).Date,'2026-10-18');
  assert.equal(own[0].Duration,'2');assert.equal(b.data.Enrollments[0].at(-1),'SessionCount');
});

test('invalid counts, incomplete sessions, and invalid last session cause no sheet writes',()=>{
  for(const count of [0,16,1.5]) {
    const b=createBackend(),r=b.post('saveEnrollment',enrollment(1,{SessionCount:count}));assert.equal(r.code,'INVALID_SESSION_COUNT');assert.equal(b.writes(),0);
  }
  const b=createBackend();assert.equal(b.post('saveEnrollment',enrollment(2,{Sessions:enrollment(1).Sessions})).code,'INVALID_SESSION_COUNT');
  const p=enrollment(3);p.Sessions[2].Date='31/02/2026';assert.equal(b.post('saveEnrollment',p).success,false);
  assert.equal(b.writes(),0);assert.equal(b.data.Enrollments.length,3);assert.equal(b.data.Schedule.length,2);assert.ok(!b.data.Enrollments[0].includes('SessionCount'));
});

test('three people of one course may overlap at different levels; a fourth is never confirmable',()=>{
  const b=createBackend();schedule(b,2,addPerson(b,3));
  const p={EnrollmentID:'ENR002',Date:'2026-10-03',StartTime:'10:00',EndTime:'12:00'};
  assert.equal(confirm(b,'saveSchedule',p).success,true);
  const fourth=addPerson(b,4),before=b.writes();
  const r=b.post('saveSchedule',{...p,EnrollmentID:fourth,conflictVersion:'anything',holidayVersion:'anything'});
  assert.equal(r.code,'CAPACITY');assert.equal(b.writes(),before);
});

test('mixed courses and same person in different enrollments cannot overlap',()=>{
  const b=createBackend();b.data.Courses.push(['C3','JuniorDeveloper','Lv1',8,4,'#123456',true]);
  const mixed=addPerson(b,3,'JuniorDeveloper'),p={EnrollmentID:mixed,Date:'2026-10-03',StartTime:'10:00',EndTime:'11:00',conflictVersion:'approved'};
  assert.equal(b.post('saveSchedule',p).code,'COURSE_MISMATCH');
  b.data.Enrollments.push(['ENR004','STU001','JuniorDeveloper','Lv1','กำลังเรียน','ชำระแล้ว','2026-10-01','']);
  assert.equal(b.post('saveSchedule',{...p,EnrollmentID:'ENR004'}).code,'STUDENT_OVERLAP');
  const duplicate=addPerson(b,5,'JuniorBuilder','  นักเรียนทดสอบ   เอ  ');
  assert.equal(b.post('saveSchedule',{...p,EnrollmentID:duplicate}).code,'STUDENT_OVERLAP');assert.equal(b.writes(),0);
});

test('capacity measures the peak concurrent students, not total touching appointments',()=>{
  const b=createBackend();b.data.Schedule[1][3]='09:00';b.data.Schedule[1][4]='10:30';
  schedule(b,2,addPerson(b,3),'09:00','10:00');schedule(b,3,addPerson(b,4),'10:30','12:00');schedule(b,4,addPerson(b,5),'11:00','12:00');
  const p={EnrollmentID:'ENR002',Date:'2026-10-03',StartTime:'09:00',EndTime:'12:00'};
  const challenge=b.post('saveSchedule',p);assert.equal(challenge.code,'CONFLICT');assert.equal(challenge.conflicts.length,4);
  p.conflictVersion=challenge.conflictVersion;assert.equal(b.post('saveSchedule',p).success,true);
});

test('duplicate legacy rows count one person; orphan rows reserve no classroom places',()=>{
  const b=createBackend();schedule(b,2,'ENR001');schedule(b,3,'ENR999');
  b.data.Enrollments.push(['ENR888','STU999','JuniorBuilder','Lv1','กำลังเรียน','ชำระแล้ว','2026-10-01','']);schedule(b,4,'ENR888');
  b.data.Enrollments.push(['ENR777','STU002','Missing course','Lv1','กำลังเรียน','ชำระแล้ว','2026-10-01','']);schedule(b,5,'ENR777');
  schedule(b,6,addPerson(b,3));
  assert.equal(confirm(b,'saveSchedule',{EnrollmentID:'ENR002',Date:'2026-10-03',StartTime:'10:00',EndTime:'12:00'}).success,true);
});

test('a later batch conflict rejects every proposed session before adding enrollment metadata',()=>{
  const b=createBackend();schedule(b,2,addPerson(b,3));schedule(b,3,addPerson(b,4));
  const p=enrollment(2);p.Sessions[1]={Date:'2026-10-03',StartTime:'10:00',EndTime:'12:00'};
  assert.equal(b.post('saveEnrollment',p).code,'CAPACITY');assert.equal(b.writes(),0);assert.ok(!b.data.Enrollments[0].includes('SessionCount'));
  const duplicate=enrollment(2);duplicate.Sessions[1]={...duplicate.Sessions[0]};assert.equal(b.post('saveEnrollment',duplicate).code,'STUDENT_OVERLAP');assert.equal(b.writes(),0);
});

test('batch conflicts and holiday confirmations complete before any row is saved',()=>{
  const b=createBackend();b.data.Holidays.push(['2026-10-04','หยุดทดสอบ','วันหยุด',true]);
  const p=enrollment(2,{requestId:'batch-confirm'});p.Sessions=[{Date:'2026-10-03',StartTime:'11:00',EndTime:'12:00'},{Date:'2026-10-04',StartTime:'13:00',EndTime:'15:00'}];
  let r=b.post('saveEnrollment',p);assert.equal(r.code,'CONFLICT');assert.equal(r.conflicts[0].Date,'2026-10-03');assert.equal(b.writes(),0);
  p.conflictVersion=r.conflictVersion;r=b.post('saveEnrollment',p);assert.equal(r.code,'HOLIDAY');assert.equal(r.holidays[0].Date,'2026-10-04');assert.equal(b.writes(),0);
  p.holidayVersion=r.holidayVersion;b.data.Holidays[1][1]='เปลี่ยนวันหยุด';r=b.post('saveEnrollment',p);assert.equal(r.code,'HOLIDAY');assert.equal(b.writes(),0);
  p.holidayVersion=r.holidayVersion;r=b.post('saveEnrollment',p);assert.equal(r.success,true);assert.equal(r.schedule.length,3);
});

test('stable request IDs prevent duplicated enrollment/session records on retries',()=>{
  const b=createBackend(),p=enrollment(2,{requestId:'stable-request'}),first=b.post('saveEnrollment',p),before=b.writes();
  assert.equal(first.success,true);
  const replay=b.post('saveEnrollment',{...p,holidayVersion:'irrelevant'});assert.equal(replay.success,true);assert.equal(replay.EnrollmentID,first.EnrollmentID);assert.equal(b.writes(),before);assert.equal(replay.schedule.length,3);
  assert.equal(b.post('saveEnrollment',{...p,Note:'changed'}).code,'REQUEST_MISMATCH');assert.equal(b.writes(),before);
});

test('interrupted batch resumes reserved IDs even after a different registration succeeds',()=>{
  for (const stage of ['before-enrollment','before-schedule']) {
    const b=createBackend(),p=enrollment(2,{requestId:`interrupted-${stage}`});
    b.failNextWrite(({name})=>name===(stage==='before-enrollment'?'Enrollments':'Schedule'));
    assert.equal(b.post('saveEnrollment',p).success,false);
    const marker=Array.from(b.props.values()).filter(v=>String(v).includes('"state":"pending"')).map(v=>JSON.parse(v))[0];
    assert.equal(marker.EnrollmentID,'ENR003');assert.deepEqual(marker.schedule.map(s=>s.ScheduleID),['SCH002','SCH003']);
    const other=enrollment(1,{requestId:`other-${stage}`,Sessions:[{Date:'2026-11-01',StartTime:'13:00',EndTime:'15:00'}]});
    const savedOther=b.post('saveEnrollment',other);assert.equal(savedOther.success,true);assert.equal(savedOther.EnrollmentID,'ENR004');assert.equal(savedOther.schedule.find(s=>s.EnrollmentID==='ENR004').ScheduleID,'SCH004');
    const retry=b.post('saveEnrollment',p);assert.equal(retry.success,true);assert.equal(retry.EnrollmentID,'ENR003');
    assert.equal(retry.data.filter(e=>e.EnrollmentID==='ENR003').length,1);assert.equal(retry.schedule.filter(s=>s.EnrollmentID==='ENR003').length,2);assert.equal(retry.schedule.filter(s=>s.EnrollmentID==='ENR004').length,1);
    assert.equal(new Set(retry.schedule.map(s=>s.ScheduleID)).size,retry.schedule.length);
    const before=b.writes();assert.equal(b.post('saveEnrollment',p).success,true);assert.equal(b.writes(),before);
  }
});

test('retry finishes a partially written schedule batch without losing formulas or duplicating rows',()=>{
  const b=createBackend(),p=enrollment(2,{requestId:'partial-schedule'});
  b.setFormula('Schedule',3,6,'=IF(B3="","",24*(E3-D3))');b.setFormula('Schedule',3,7,'=IF(B3="","",COUNTIF(B$2:B3,B3))');b.setFormula('Schedule',3,8,'=IF(B3="","",B3)');
  b.failNextWrite(({name,row})=>name==='Schedule'&&row===4);
  assert.equal(b.post('saveEnrollment',p).success,false);assert.equal(b.post('getSchedule').data.filter(s=>s.EnrollmentID==='ENR003').length,1);
  const retry=b.post('saveEnrollment',p);assert.equal(retry.success,true);assert.equal(retry.data.filter(e=>e.EnrollmentID==='ENR003').length,1);assert.equal(retry.schedule.filter(s=>s.EnrollmentID==='ENR003').length,2);
  assert.equal(b.formulas.Schedule.get('3,7'),'=IF(B3="","",COUNTIF(B$2:B3,B3))');
});

test('moving an appointment keeps sheet session numbers; new sessions use the next number',()=>{
  const b=createBackend();schedule(b,2,'ENR001','13:00','15:00','2026-10-05');b.data.Schedule[2][6]='Session 4';
  assert.equal(b.post('saveSchedule',{ScheduleID:'SCH001',EnrollmentID:'ENR001',Date:'2026-10-06',StartTime:'10:00',EndTime:'12:00'}).success,true);
  assert.equal(b.data.Schedule[1][6],'Session 1');assert.equal(b.data.Schedule[2][6],'Session 4');
  const r=b.post('saveSchedule',{EnrollmentID:'ENR001',Date:'2026-10-04',StartTime:'13:00',EndTime:'15:00'});assert.equal(r.success,true);assert.equal(r.data.at(-1).SessionNo,'Session 5');
});

test('editing enrollment preserves session count, appointment rows, and supports paused students',()=>{
  const b=createBackend(),created=b.post('saveEnrollment',enrollment(2)),e=created.data.at(-1),before=JSON.stringify(b.data.Schedule);
  delete e.SessionCount;e.EnrollmentStatus='พักการเรียน';
  const r=b.post('saveEnrollment',e);assert.equal(r.success,true);assert.equal(r.data.at(-1).SessionCount,'2');assert.equal(JSON.stringify(b.data.Schedule),before);
  assert.equal(b.post('saveEnrollment',{...e,Sessions:enrollment(1).Sessions}).success,false);assert.equal(JSON.stringify(b.data.Schedule),before);
});

test('additional appointments cannot exceed custom or course session counts; full enrollments can still edit',()=>{
  const b=createBackend(),created=b.post('saveEnrollment',enrollment(2)),p={EnrollmentID:created.EnrollmentID,Date:'2026-11-01',StartTime:'13:00',EndTime:'15:00'},before=b.writes();
  assert.equal(b.post('saveSchedule',p).code,'SESSION_LIMIT');assert.equal(b.writes(),before);
  const own=created.schedule.find(s=>s.EnrollmentID===created.EnrollmentID);assert.equal(b.post('saveSchedule',{...own,Date:'2026-11-01'}).success,true);
  schedule(b,20,'ENR001','13:00','15:00','2026-11-02');schedule(b,21,'ENR001','13:00','15:00','2026-11-03');schedule(b,22,'ENR001','13:00','15:00','2026-11-04');
  assert.equal(b.post('saveSchedule',{...p,EnrollmentID:'ENR001'}).code,'SESSION_LIMIT');
});

test('writes preserve array formulas, per-row formulas, and append into formula-tail rows',()=>{
  const b=createBackend();
  const note='=ARRAYFORMULA(IF(B2:B="","",IFERROR(VLOOKUP(B2:B,Students!A:C,3,FALSE),"")))';
  b.setFormula('Enrollments',2,8,note,'เอ');
  b.setFormula('Schedule',2,6,'=24*(E2-D2)',2);b.setFormula('Schedule',2,7,'=COUNTIF(B$2:B2,B2)','Session 1');b.setFormula('Schedule',2,8,'=XLOOKUP(B2,Enrollments!A:A,Enrollments!B:B)','เอ');
  b.setFormula('Schedule',3,6,'=IF(B3="","",24*(E3-D3))');b.setFormula('Schedule',3,7,'=IF(B3="","",COUNTIF(B$2:B3,B3))');b.setFormula('Schedule',3,8,'=IF(B3="","",XLOOKUP(B3,Enrollments!A:A,Enrollments!B:B))');
  b.setFormula('Schedule',25,6,'=IF(B25="","",24*(E25-D25))');
  const e=b.post('getEnrollments').data[0],s=b.post('getSchedule').data[0];assert.ok(e.readOnlyFields.includes('Note'));assert.deepEqual(s.readOnlyFields,['Duration','SessionNo','Note']);
  assert.equal(b.post('saveSchedule',{...s,Date:'2026-10-08',Note:'must not replace formula'}).success,true);
  assert.equal(b.formulas.Schedule.get('2,7'),'=COUNTIF(B$2:B2,B2)');assert.equal(b.formulas.Schedule.get('2,8'),'=XLOOKUP(B2,Enrollments!A:A,Enrollments!B:B)');
  const r=b.post('saveEnrollment',enrollment(1));assert.equal(r.success,true);
  assert.equal(b.data.Schedule[2][0],'SCH002');assert.equal(b.formulas.Schedule.get('3,7'),'=IF(B3="","",COUNTIF(B$2:B3,B3))');assert.ok(b.formulas.Schedule.has('25,6'));
  assert.equal(b.formulas.Enrollments.get('2,8'),note);assert.equal(b.data.Enrollments[3][7],undefined);assert.equal(b.data.Enrollments[3][8],1);
});
