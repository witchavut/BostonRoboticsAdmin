const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createApp(fetchImpl) {
  const elements = new Map(), calls = [], timers = new Map();
  let timerId = 0;
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        hidden: true, disabled: false, value: '', textContent: '', innerHTML: '', className: '', style: {}, children: [],
        classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
        replaceChildren(...children) { this.children = children; },
        add(child) { this.children.push(child); },
        get selectedIndex() { return this.children.findIndex(child => child.value === this.value); },
        querySelector: () => null, querySelectorAll: () => []
      });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    BostonDomain: require('../js/domain.js'), AbortController, TypeError,
    Option: function(text, value) { this.text = text; this.textContent = text; this.value = value; },
    document: { getElementById: element, querySelectorAll: () => [], addEventListener: () => {} },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : {};
      const action = body.action || new URL(url).searchParams.get('action');
      calls.push({ action, options, body });
      const value = await fetchImpl(action, options, body);
      return { ok: true, text: async () => typeof value === 'string' ? value : JSON.stringify(value) };
    }
  });
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);
  // Connection tests exercise the actual handlers, with rendering isolated.
  vm.runInContext('renderAll = () => updateButtons();', context);
  return { context, calls, element, timers, run: code => vm.runInContext(code, context) };
}
const health = { success: true, version: '2.2', authMode: 'none' };
const data = { success: true, data: [] };
const timeSlots = { success: true, data: ['09:00', '09:30', '10:00', '12:00', '13:00', '15:00'] };
const responseFor = action => action === 'getHealth' ? health : action === 'getTimeSlots' ? timeSlots : data;
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

test('bootstrap loads the same normalized state with two startup requests', async () => {
  const { createBackend } = require('./backend-harness.cjs');
  const backend = createBackend();
  const app = createApp(action => action === 'getHealth' ? JSON.parse(backend.context.doGet({parameter:{action}}).text) : backend.post(action));
  await app.context.initApp();
  assert.deepEqual(app.calls.map(c => c.action), ['getHealth', 'getBootstrap']);
  assert.equal(app.run('canWrite()'), true);
  assert.equal(app.run('state.schedule[0].Date'), '2026-10-03');
  assert.match(app.element('connection-status').textContent, /โหลดข้อมูล.*วินาที.*แบบรวม/);
  await app.context.loadData();
  assert.equal(app.calls.length, 3);
});

test('bootstrap failures and missing collections block writes and refresh recovers', async () => {
  const { createBackend } = require('./backend-harness.cjs');
  for (const failure of ['timeout', 'missing', 'partial', 'invalidSlots']) {
    const backend = createBackend(); let fail = true;
    const app = createApp(action => {
      if (action === 'getHealth') return { ...health, capabilities: ['bootstrap'] };
      if (fail && failure === 'timeout') throw abortError();
      const reply = backend.post(action);
      if (fail && failure === 'missing') delete reply.data.schedule;
      if (fail && failure === 'partial') reply.errors.schedule = 'sheet unavailable';
      if (fail && failure === 'invalidSlots') reply.data.timeSlots = ['09:00'];
      return reply;
    });
    await app.context.initApp();
    assert.equal(app.run('canWrite()'), false, failure);
    assert.equal(app.element('refresh-data').disabled, false);
    assert.equal(app.calls.length, 2); // No retry storm after a failed batch.
    fail = false;
    await app.context.loadData();
    assert.equal(app.run('canWrite()'), true);
    assert.equal(app.timers.size, 0);
  }
});

test('bootstrap keeps writes disabled and prevents duplicate refresh while pending', async () => {
  let complete;
  const app = createApp(() => new Promise(resolve => { complete = resolve; }));
  app.run('modernAPI = true; supportsBootstrap = true;');
  const pending = app.context.loadData();
  await app.context.loadData();
  assert.equal(app.calls.length, 1);
  assert.equal(app.run('canWrite()'), false);
  complete(require('./backend-harness.cjs').createBackend().post('getBootstrap'));
  await pending;
  assert.equal(app.run('canWrite()'), true);
});

test('health timeout does not request data or misreport an old deployment; refresh recovers', async () => {
  let fail = true;
  const app = createApp(action => { if (fail) throw abortError(); return responseFor(action); });
  await app.context.initApp();
  assert.deepEqual(app.calls.map(c => c.action), ['getHealth']);
  assert.match(app.element('connection-status').textContent, /ใช้เวลานานเกินไป/);
  assert.doesNotMatch(app.element('connection-status').textContent, /รุ่นเดิม|อัปเดต Code.gs/);
  assert.equal(app.element('refresh-data').disabled, false);
  fail = false;
  await app.context.initApp();
  assert.equal(app.run('canWrite()'), true);
});

test('network and malformed health replies do not start data requests', async () => {
  for (const reply of [() => { throw new TypeError('Failed to fetch'); }, () => '<html>Sign in</html>', () => null]) {
    const app = createApp(reply);
    await app.context.initApp();
    assert.deepEqual(app.calls.map(c => c.action), ['getHealth']);
    assert.equal(app.run('modernAPI'), false);
    assert.doesNotMatch(app.element('connection-status').textContent, /รุ่นเดิม|อัปเดต Code.gs/);
    assert.equal(app.element('refresh-data').disabled, false);
  }
});

test('older backend versions explain required Code.gs deployment without attempting reads', async () => {
  for (const previous of [{ success: true, version: '2.0', configured: true }, { success: true, version: '2.1', authMode: 'none' }]) {
    const app = createApp(() => previous);
    await app.context.initApp();
    assert.match(app.element('connection-status').textContent, /Code.gs รุ่น 2.2.*New version/);
    assert.equal(app.calls.length, 1);
    assert.equal(app.run('canWrite()'), false);
  }
});

test('opening the app loads all collections automatically without login or credentials', async () => {
  const app = createApp(responseFor);
  await app.context.initApp();
  assert.deepEqual(app.calls.map(c => c.action), ['getHealth', 'getStudents', 'getCourses', 'getEnrollments', 'getSchedule', 'getHolidays', 'getTimeSlots']);
  for (const call of app.calls.slice(1)) {
    assert.equal(call.options.method, 'POST');
    assert.equal('token' in call.body, false);
    assert.equal('password' in call.body, false);
  }
  assert.equal(app.run('canWrite()'), true);
  assert.equal(app.timers.size, 0);
});

test('sheet time slots are normalized for the forms and missing slots prevent writes', async () => {
  const app = createApp(action => action === 'getTimeSlots' ? { success: true, data: ['13:00', '9:00:00', '', 'bad', '09:00'] } : responseFor(action));
  await app.context.initApp();
  assert.deepEqual(Array.from(app.run('state.timeSlots')), ['09:00', '13:00']);
  assert.equal(app.run('canWrite()'), true);
  assert.match(app.context.timeOptions('13:00'), /value="13:00" selected/);
  assert.doesNotMatch(app.context.timeOptions(), /value="10:00"|bad/);
  const missing = createApp(action => action === 'getTimeSlots' ? { success: true, data: ['09:00'] } : responseFor(action));
  await missing.context.initApp();
  assert.equal(missing.run('canWrite()'), false);
  assert.match(missing.element('connection-status').textContent, /TimeSlots.*Lists/);
});

test('data timeout keeps writes disabled and refresh can recover', async () => {
  let fail = true;
  const app = createApp(action => {
    if (fail && action === 'getSchedule') throw abortError();
    return responseFor(action);
  });
  app.run('modernAPI = true;');
  await app.context.loadData();
  assert.match(app.element('connection-status').textContent, /ตารางเรียน:.*ใช้เวลานานเกินไป/);
  assert.equal(app.run('canWrite()'), false);
  fail = false;
  await app.context.loadData();
  assert.equal(app.run('canWrite()'), true);
});

test('refresh cannot start a second batch while a read is pending', async () => {
  let complete;
  const app = createApp(action => action === 'getStudents' ? new Promise(resolve => { complete = resolve; }) : responseFor(action));
  app.run('modernAPI = true;');
  const pending = app.context.loadData();
  await app.context.loadData();
  assert.equal(app.calls.length, 1);
  assert.equal([...app.timers.values()][0].delay, 45000);
  complete(data); await pending;
  assert.equal(app.calls.length, 6);
  assert.equal(app.timers.size, 0);
});

test('calendar month arrows cross year boundaries and month reset uses Bangkok today', () => {
  const app = createApp(() => data);
  app.run("calendarMonth = '2026-12'; renderCalendar = () => {};");
  app.context.changeCalendarMonth(1);
  assert.equal(app.run('calendarMonth'), '2027-01');
  app.context.changeCalendarMonth(-1);
  assert.equal(app.run('calendarMonth'), '2026-12');
});

test('calendar escapes names, limits time groups on holidays, and keeps all day events', () => {
  const app = createApp(() => data);
  app.run(`calendarMonth = '2026-10'; selectedCalendarDate = '';
    Object.keys(state).forEach(k => ready[k] = true);
    state.students = [{StudentID:'S1', StudentName:'<script>bad</script>', Nickname:'Test'}];
    state.enrollments = [{EnrollmentID:'E1', StudentID:'S1', Course:'Robotics', Level:'Lv1'}];
    state.courses = [{Course:'Robotics', Level:'Lv1', ColorHex:'red;position:fixed'}];
    state.schedule = Array.from({length:5}, (_,i) => ({ScheduleID:'SCH'+i, EnrollmentID:'E1', Date:'2026-10-03', StartTime:String(9+i).padStart(2,'0')+':00', EndTime:String(10+i).padStart(2,'0')+':00'}));
    state.holidays = [{Date:'2026-10-03', Reason:'Closed', Active:true}, {Date:'2026-10-03', Reason:'Inactive', Active:false}];
  `);
  app.context.renderCalendar();
  const html = app.element('calendar-days').innerHTML;
  assert.equal((html.match(/data-calendar-date=/g) || []).length, 42);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|position:fixed|Inactive/);
  assert.match(html, /\+3 ช่วงเวลา/);
  assert.equal((html.match(/class="calendar-time-label"/g) || []).length, 2);
  app.run("selectedCalendarDate = '2026-10-03';");
  app.context.renderCalendarDay();
  assert.equal((app.element('calendar-day-list').innerHTML.match(/data-calendar-edit=/g) || []).length, 5);
  assert.equal((app.element('calendar-day-list').innerHTML.match(/class="calendar-day-time-label"/g) || []).length, 5);
});

test('calendar groups only identical date and time ranges, sharing the header without hiding learners', () => {
  const app = createApp(responseFor);
  app.run(`calendarMonth = '2026-10'; selectedCalendarDate = '';
    Object.keys(state).forEach(k => ready[k] = true);
    state.students = Array.from({ length: 7 }, (_, i) => ({ StudentID: 'S' + i, StudentName: 'Learner ' + i, Nickname: 'Kid' + i }));
    state.courses = [{ Course: 'JuniorDeveloper', Level: 'LV1', SessionCount: 4, ColorHex: '#2563eb' }];
    state.enrollments = state.students.map(s => ({ EnrollmentID: 'E' + s.StudentID, StudentID: s.StudentID, Course: 'JuniorDeveloper', Level: 'LV1' }));
    state.schedule = state.enrollments.map((e, i) => ({ ScheduleID: 'SCH' + i, EnrollmentID: e.EnrollmentID, Date: i === 6 ? '2026-10-04' : '2026-10-03', StartTime: i === 5 ? '11:00' : '10:00', EndTime: i === 4 ? '11:00' : '12:00', SessionNo: 'Session ' + (i % 4 + 1) }));
    state.holidays = [];
  `);
  app.context.renderCalendar();
  const html = app.element('calendar-days').innerHTML;
  assert.equal((html.match(/class="calendar-time-label"/g) || []).length, 4);
  assert.equal((html.match(/class="calendar-event"/g) || []).length, 7);
  assert.equal((html.match(/10:00–12:00/g) || []).length, 2); // one header per date
  assert.doesNotMatch(html, /class="calendar-more"/);
  for (let i = 0; i < 7; i++) assert.match(html, new RegExp('<b>Kid' + i + '</b>'));
  assert.equal((html.match(/class="calendar-group-course">JuniorDeveloper/g) || []).length, 4);
  assert.equal((html.match(/class="calendar-level">LV1/g) || []).length, 7);
  assert.doesNotMatch(html, /class="calendar-course"/);
  assert.match(html, /title="Kid0 \(Learner 0\) · JuniorDeveloper \/ LV1 · Session 1"/);
  assert.match(html, /--calendar-group-columns:3/);
  app.run("selectedCalendarDate = '2026-10-03';");
  app.context.renderCalendarDay();
  const details = app.element('calendar-day-list').innerHTML;
  assert.equal((details.match(/class="calendar-day-time-label"/g) || []).length, 3);
  assert.equal((details.match(/10:00–12:00/g) || []).length, 1);
  assert.equal((details.match(/data-calendar-edit=/g) || []).length, 6);
  assert.ok(details.indexOf('10:00–11:00') < details.indexOf('10:00–12:00'));
  assert.ok(details.indexOf('10:00–12:00') < details.indexOf('11:00–12:00'));
  for (let i = 0; i < 6; i++) assert.match(details, new RegExp('data-calendar-edit="SCH' + i + '"'));
  assert.doesNotMatch(details, /data-calendar-edit="SCH6"/);
  app.run("state.courses.push({ Course:'JuniorBuilder', Level:'LV1' }); state.enrollments[0].Course = 'JuniorBuilder'; selectedCalendarDate = ''; ");
  app.context.renderCalendar();
  const mixed = app.element('calendar-days').innerHTML;
  assert.match(mixed, /class="calendar-course">JuniorBuilder \/ LV1/);
  assert.match(mixed, /class="calendar-course">JuniorDeveloper \/ LV1/);
});

test('normal-day overflow counts hidden time groups instead of hidden appointments', () => {
  const app = createApp(responseFor);
  app.run(`calendarMonth = '2026-10'; selectedCalendarDate = '';
    Object.keys(state).forEach(k => ready[k] = true);
    state.students = [{ StudentID:'S1', StudentName:'Test' }];
    state.enrollments = [{ EnrollmentID:'E1', StudentID:'S1', Course:'Robotics', Level:'LV1' }];
    state.courses = [{ Course:'Robotics', Level:'LV1' }];
    state.schedule = Array.from({ length: 5 }, (_, i) => ({ ScheduleID:'SCH'+i, EnrollmentID:'E1', Date:'2026-10-03', StartTime:String(9+i).padStart(2,'0')+':00', EndTime:String(10+i).padStart(2,'0')+':00', SessionNo:i+1 }));
    state.schedule.push({ ...state.schedule[0], ScheduleID:'EXTRA1' }, { ...state.schedule[0], ScheduleID:'EXTRA2' });
    state.holidays = [];
  `);
  app.context.renderCalendar();
  const html = app.element('calendar-days').innerHTML;
  assert.match(html, /\+2 ช่วงเวลา/);
  assert.equal((html.match(/class="calendar-time-label"/g) || []).length, 3);
  assert.equal((html.match(/class="calendar-event"/g) || []).length, 5);
  assert.match(html, /, 7 นัดเรียน/);
  app.run("selectedCalendarDate = '2026-10-03';");
  app.context.renderCalendarDay();
  assert.equal((app.element('calendar-day-list').innerHTML.match(/data-calendar-edit=/g) || []).length, 7);
});

test('calendar and day details display the sheet session number and omit orphan appointments', () => {
  const app = createApp(responseFor);
  app.run(`calendarMonth = '2026-10'; selectedCalendarDate = '';
    Object.keys(state).forEach(k => ready[k] = true);
    state.students = [{ StudentID: 'S1', StudentName: 'นักเรียนทดสอบ' }, { StudentID: 'Sblank', StudentName: '', Nickname: '' }];
    state.courses = [{ Course: 'JuniorDeveloper', Level: 'LV2', SessionCount: 4, ColorHex: '#2563eb' }];
    state.enrollments = [
      { EnrollmentID: 'E1', StudentID: 'S1', Course: 'JuniorDeveloper', Level: 'LV2' },
      { EnrollmentID: 'EmissingStudent', StudentID: 'missing', Course: 'JuniorDeveloper', Level: 'LV2' },
      { EnrollmentID: 'EblankName', StudentID: 'Sblank', Course: 'JuniorDeveloper', Level: 'LV2' },
      { EnrollmentID: 'EmissingCourse', StudentID: 'S1', Course: 'AbsentCourse', Level: 'LV2' }
    ];
    state.schedule = ['E1', 'EmissingStudent', 'EblankName', 'EmissingCourse', 'EmissingEnrollment'].map((EnrollmentID, i) => ({
      ScheduleID: 'SCH' + i, EnrollmentID, Date: '2026-10-03', StartTime: '10:00', EndTime: '12:00', SessionNo: 'Session 4'
    }));
    state.holidays = [{ Date: '2026-10-03', Reason: 'วันหยุดทดสอบ', Active: true }];
  `);
  app.context.renderCalendar();
  const html = app.element('calendar-days').innerHTML;
  assert.equal((html.match(/class="calendar-event"/g) || []).length, 1);
  assert.match(html, /class="calendar-session">ครั้ง 4/);
  assert.match(html, /class="calendar-day[^\"]* holiday"[^>]*data-calendar-date="2026-10-03"/);
  assert.match(html, /วันหยุดทดสอบ/);
  assert.doesNotMatch(html, /ไม่พบชื่อนักเรียน|ไม่พบหลักสูตร|AbsentCourse/);
  app.run("selectedCalendarDate = '2026-10-03';");
  app.context.renderCalendarDay();
  const details = app.element('calendar-day-list').innerHTML;
  assert.equal((details.match(/data-calendar-edit=/g) || []).length, 1);
  assert.match(details, /JuniorDeveloper \/ LV2 · Session 4/);
  assert.match(details, /วันหยุด: วันหยุดทดสอบ/);
  assert.doesNotMatch(details, /ไม่พบชื่อนักเรียน|ไม่พบหลักสูตร|AbsentCourse/);
});

function fillStudentHistory(app) {
  app.run(`Object.keys(state).forEach(k => ready[k] = true);
    state.students = [
      { StudentID: 'S1', StudentName: 'ปุญญ์ ทดสอบ', Nickname: 'ปุญญ์' },
      { StudentID: 'S1copy', StudentName: ' ปุญญ์  ทดสอบ ', Nickname: 'ปุญญ์' },
      { StudentID: 'S2', StudentName: 'อีกคน ทดสอบ', Nickname: 'ปุญญ์' },
      { StudentID: 'S3', StudentName: 'นักเรียนใหม่' }
    ];
    state.courses = [
      { Course: 'JuniorDeveloper', Level: 'LV1', SessionCount: 4, TotalHours: 8 },
      { Course: 'JuniorDeveloper', Level: 'LV2', SessionCount: 4, TotalHours: 8 },
      { Course: 'JuniorBuilder', Level: 'LV1', SessionCount: 4, TotalHours: 8 }
    ];
    state.enrollments = [
      { EnrollmentID: 'E2', StudentID: 'S1', Course: 'JuniorDeveloper', Level: 'LV2', EnrollmentStatus: 'กำลังเรียน', PaymentStatus: 'ยังไม่ชำระ', EnrollDate: '2001-01-01' },
      { EnrollmentID: 'E1', StudentID: 'S1copy', Course: 'JuniorDeveloper', Level: 'LV1', EnrollmentStatus: 'จบหลักสูตร', PaymentStatus: 'ชำระแล้ว', EnrollDate: '2000-01-01' },
      { EnrollmentID: 'Etrial', StudentID: 'S2', Course: 'JuniorBuilder', Level: 'LV1', EnrollmentStatus: 'ทดลองเรียน', PaymentStatus: 'ยังไม่ชำระ', EnrollDate: '2000-01-01' },
      { EnrollmentID: 'Enew', StudentID: 'S3', Course: 'JuniorBuilder', Level: 'LV1', EnrollmentStatus: 'กำลังเรียน', PaymentStatus: 'ยังไม่ชำระ', EnrollDate: '2000-01-01' }
    ];
    state.schedule = Array.from({ length: 4 }, (_, i) => ({ ScheduleID: 'OLD' + i, EnrollmentID: 'E1', Date: '2000-01-0' + (i + 1), StartTime: '10:00', EndTime: '12:00', Duration: 2, SessionNo: 'Session ' + (i + 1) }));
    state.schedule.push(
      { ScheduleID: 'NEW1', EnrollmentID: 'E2', Date: '2001-01-01', StartTime: '10:00', EndTime: '12:00', Duration: 2, SessionNo: 'Session 1' },
      { ScheduleID: 'NEW2', EnrollmentID: 'E2', Date: '2100-01-01', StartTime: '10:00', EndTime: '12:00', Duration: 2, SessionNo: 'Session 2' },
      { ScheduleID: 'TRIAL', EnrollmentID: 'Etrial', Date: '2001-01-01', StartTime: '13:00', EndTime: '15:00', Duration: 2, SessionNo: 'Session 1' }
    );
  `);
}

test('personal appointment selector deduplicates the same full name and searches names only', () => {
  const app = createApp(responseFor);
  fillStudentHistory(app);
  app.context.updateScheduleEnrollmentDropdown();
  const select = app.element('sch-select-student');
  assert.equal(select.children.length, 4); // prompt plus three unique people
  assert.equal(select.children.filter(option => option.text.includes('ปุญญ์ ทดสอบ')).length, 1);
  assert.ok(select.children.some(option => option.value === 'S2')); // same nickname, different full name
  app.element('search-schedule').value = 'JuniorDeveloper';
  app.context.updateScheduleEnrollmentDropdown();
  assert.equal(select.children.length, 1);
  app.element('search-schedule').value = 'ปุญญ์ ทดสอบ';
  app.context.updateScheduleEnrollmentDropdown();
  assert.equal(select.children.length, 2);
  assert.equal(select.children[1].value, 'S1');
});

test('personal history shows completed level before current level, its sessions, and remaining sessions', () => {
  const app = createApp(responseFor);
  fillStudentHistory(app);
  app.element('sch-select-student').value = 'S1';
  app.context.renderScheduleView();
  const html = app.element('sch-enrollment-groups').innerHTML;
  assert.equal(app.element('sch-management-container').style.display, 'block');
  assert.equal((html.match(/class="student-enrollment-group"/g) || []).length, 2);
  assert.ok(html.indexOf('JuniorDeveloper / LV1') < html.indexOf('JuniorDeveloper / LV2'));
  const firstLevel = html.slice(0, html.indexOf('JuniorDeveloper / LV2'));
  for (let n = 1; n <= 4; n++) assert.match(firstLevel, new RegExp('Session ' + n));
  assert.match(firstLevel, /เรียนแล้ว 4 \/ 4 Session.*จบหลักสูตรแล้ว/s);
  assert.match(html, /เรียนแล้ว 1 \/ 4 Session.*เหลือ 3 Session/s);
  assert.match(html, /นัดแล้ว 2 ครั้ง · ยังไม่นัด 2 ครั้ง/);
  assert.match(html, /data-add-schedule="E2"/);
  assert.doesNotMatch(html, /data-add-schedule="E1"/);
});

test('dashboard counts unique attended students and unpaid active students with a course breakdown', () => {
  const app = createApp(responseFor);
  fillStudentHistory(app);
  app.context.renderDashboard();
  assert.equal(app.element('dash-total-students').textContent, '2 คน');
  assert.equal(app.element('dash-active-students').textContent, '2 คน');
  assert.equal(app.element('dash-trial-students').textContent, '1 คน');
  assert.match(app.element('dash-active-courses').innerHTML, /JuniorBuilder<\/strong><span>1 คน/);
  assert.match(app.element('dash-active-courses').innerHTML, /JuniorDeveloper<\/strong><span>1 คน/);
  app.run("state.enrollments.find(e => e.EnrollmentID === 'E2').SessionCount = 1;");
  app.context.renderDashboard();
  assert.equal(app.element('dash-active-students').textContent, '1 คน');
  assert.doesNotMatch(app.element('dash-active-courses').innerHTML, /JuniorDeveloper/);
});

test('the initial HTML selects only schedule and contains no login controls', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /id="schedule" class="page-section active"/);
  assert.equal((html.match(/class="page-section active"/g) || []).length, 1);
  assert.doesNotMatch(html, /id="login-|id="logout-|type="password"/);
});

test('PNG export uses only the selected person and requested level, including merged student IDs', async () => {
  const app = createApp(responseFor);
  fillStudentHistory(app);
  const downloads = [];
  app.context.BostonScheduleExport = { download: async options => { downloads.push(options); } };
  app.element('sch-select-student').value = 'S1';
  await app.context.downloadStudentSchedule('E1');
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].student.StudentID, 'S1copy');
  assert.equal(downloads[0].enrollment.Level, 'LV1');
  assert.equal(downloads[0].course.TotalHours, 8);
  assert.equal(downloads[0].progress.sessions.length, 4);
  assert.ok(downloads[0].progress.sessions.every(s => s.EnrollmentID === 'E1'));
  assert.match(app.element('schedule-export-status').textContent, /ดาวน์โหลด PNG JuniorDeveloper \/ LV1 แล้ว/);
  await app.context.downloadStudentSchedule('Etrial');
  assert.equal(downloads.length, 1);
});

test('PNG download failure unlocks retry and incomplete data cannot create an export', async () => {
  const app = createApp(responseFor);
  fillStudentHistory(app);
  app.element('sch-select-student').value = 'S1';
  let downloads = 0;
  app.context.BostonScheduleExport = { download: async () => { downloads++; throw Error('โหลดโลโก้ไม่สำเร็จ'); } };
  await app.context.downloadStudentSchedule('E2');
  assert.equal(app.run('exportingSchedule'), false);
  assert.match(app.element('schedule-export-status').textContent, /สร้างภาพไม่สำเร็จ.*โหลดโลโก้/);
  app.run("ready.schedule = false;");
  await app.context.downloadStudentSchedule('E2');
  assert.equal(downloads, 1);
});
