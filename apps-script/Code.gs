// BostonRobotics AdminSystem API v2.0
// Set ADMIN_PASSWORD (12+ characters) in Project Settings > Script properties.
// Never place the password or session tokens in GitHub or in the spreadsheet.
const SPREADSHEET_ID = '1oCEEfP_Yf4p6e1UmY1K1sPKs-vZe3xNpAYw9W3gQFSI';
const TIME_ZONE = 'Asia/Bangkok';
const SCHEMA = {
  Students: ['StudentID', 'StudentName', 'Nickname', 'ParentName', 'Phone', 'Active', 'Note'],
  Courses: ['CourseID', 'Course', 'Level', 'TotalHours', 'SessionCount', 'ColorHex', 'Active'],
  Enrollments: ['EnrollmentID', 'StudentID', 'Course', 'Level', 'EnrollmentStatus', 'PaymentStatus', 'EnrollDate', 'Note'],
  Schedule: ['ScheduleID', 'EnrollmentID', 'Date', 'StartTime', 'EndTime', 'Duration', 'SessionNo', 'Note'],
  Holidays: ['Date', 'Reason', 'Type', 'Active']
};
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function health_() { return { success: true, version: '2.0', configured: String(PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || '').length >= 12 }; }
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'getHealth') return json_(health_());
  return json_({ success: false, code: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบผู้ดูแล' });
}
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    if (request.action === 'login') return json_(login_(request.payload || {}));
    if (!authorized_(request.token)) return json_({ success: false, code: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบอีกครั้ง' });
    if (request.action === 'logout') {
      CacheService.getScriptCache().remove('session:' + hash_(request.token));
      return json_({ success: true });
    }
    const reads = { getStudents: 'Students', getCourses: 'Courses', getEnrollments: 'Enrollments', getSchedule: 'Schedule', getHolidays: 'Holidays' };
    if (Object.prototype.hasOwnProperty.call(reads, request.action)) return json_(result_(reads[request.action]));
    const writes = { saveStudent: saveStudent_, saveEnrollment: saveEnrollment_, saveSchedule: saveSchedule_, saveHoliday: saveHoliday_ };
    if (!Object.prototype.hasOwnProperty.call(writes, request.action)) return json_({ success: false, code: 'UNKNOWN_ACTION', message: 'ไม่พบคำสั่งที่ร้องขอ' });
    return json_(locked_(function () { return writes[request.action](request.payload || {}); }));
  } catch (error) {
    return json_({ success: false, code: 'ERROR', message: error.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
  }
}
function locked_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('ระบบกำลังบันทึกรายการอื่น กรุณาลองใหม่');
  try { return callback(); } finally { lock.releaseLock(); }
}
function hash_(value) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)); }
function equal_(a, b) {
  const x = hash_(a), y = hash_(b); let mismatch = 0;
  for (let i = 0; i < x.length; i++) mismatch |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return mismatch === 0;
}
function login_(payload) {
  return locked_(function () {
    const props = PropertiesService.getScriptProperties(), secret = props.getProperty('ADMIN_PASSWORD');
    if (!secret || secret.length < 12) throw new Error('กรุณาตั้งค่า ADMIN_PASSWORD อย่างน้อย 12 ตัวอักษรใน Apps Script');
    const now = Date.now(); let attempts = JSON.parse(props.getProperty('LOGIN_ATTEMPTS') || '{}');
    if (!attempts.until || attempts.until < now) attempts = { count: 0, until: now + 60000 };
    if (attempts.count >= 5) throw new Error('เข้าสู่ระบบผิดหลายครั้ง กรุณารอ 1 นาที');
    if (!equal_(String(payload.password || ''), secret)) {
      attempts.count++; props.setProperty('LOGIN_ATTEMPTS', JSON.stringify(attempts));
      throw new Error('รหัสผ่านไม่ถูกต้อง');
    }
    props.deleteProperty('LOGIN_ATTEMPTS');
    const token = Utilities.getUuid() + Utilities.getUuid();
    CacheService.getScriptCache().put('session:' + hash_(token), hash_(secret), 21600);
    return { success: true, token: token, expiresIn: 21600 };
  });
}
function authorized_(token) {
  if (typeof token !== 'string' || token.length > 200 || !token) return false;
  const secret = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  return !!secret && secret.length >= 12 && CacheService.getScriptCache().get('session:' + hash_(token)) === hash_(secret);
}
function sheet_(name) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sheet) throw new Error('ไม่พบชีต ' + name + ' กรุณาตรวจชื่อแท็บ');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(String).map(s => s.trim());
  const missing = SCHEMA[name].filter(h => !headers.includes(h));
  if (missing.length) throw new Error('หัวคอลัมน์ใน ' + name + ' ไม่ครบ: ' + missing.join(', '));
  return sheet;
}
function date_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TIME_ZONE, 'yyyy-MM-dd');
  const s = String(value || '').trim(); let y, m, d, match;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/))) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { d = +match[1]; m = +match[2]; y = +match[3]; }
  else return '';
  if (y >= 2400) y -= 543;
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') : '';
}
function time_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TIME_ZONE, 'HH:mm');
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m && +m[1] < 24 && +m[2] < 60 ? m[1].padStart(2, '0') + ':' + m[2] : '';
}
function minutes_(time) { return +time.slice(0, 2) * 60 + +time.slice(3); }
function bool_(value) { return value === true || String(value).trim().toUpperCase() === 'TRUE'; }
function rows_(name) {
  const sheet = sheet_(name), range = sheet.getDataRange(), raw = range.getValues(), display = range.getDisplayValues(), headers = display[0].map(h => String(h).trim()), key = SCHEMA[name][0], result = [];
  for (let i = 1; i < raw.length; i++) {
    const item = {};
    headers.forEach(function (h, j) {
      if (!h) return;
      let value = String(display[i][j] || '').trim();
      if (h === 'Date' || h === 'EnrollDate') value = date_(raw[i][j]);
      if (h === 'StartTime' || h === 'EndTime') value = time_(display[i][j]);
      if (h === 'Active') value = bool_(raw[i][j]);
      item[h] = value;
    });
    if (String(display[i][headers.indexOf(key)] || '').trim()) { item.rowIdx = i + 1; result.push(item); }
  }
  return result;
}
function result_(name) { return { success: true, data: rows_(name) }; }
function text_(value, required) {
  const s = String(value == null ? '' : value).trim();
  if (required && !s) throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบ');
  if (s.length > 2000) throw new Error('ข้อความยาวเกิน 2,000 ตัวอักษร');
  return s;
}
function safeCell_(value) { return typeof value === 'string' && /^[=+@-]/.test(value) ? "'" + value : value; }
function nextId_(name, prefix) {
  const key = SCHEMA[name][0];
  const max = rows_(name).reduce((max, row) => { const m = String(row[key]).match(new RegExp('^' + prefix + '(\\d+)$')); return m ? Math.max(max, +m[1]) : max; }, 0);
  return prefix + String(max + 1).padStart(3, '0');
}
function write_(name, fields, existing) {
  const sheet = sheet_(name), headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim());
  if (existing) {
    Object.keys(fields).forEach(function (key) {
      const column = headers.indexOf(key); if (column < 0) throw new Error('ไม่พบคอลัมน์ ' + key);
      const cell = sheet.getRange(existing.rowIdx, column + 1);
      if (['Date', 'EnrollDate', 'StartTime', 'EndTime', 'Phone'].includes(key)) cell.setNumberFormat('@');
      cell.setValue(safeCell_(fields[key]));
    });
  } else {
    const row = Math.max(2, sheet.getLastRow() + 1);
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
    headers.forEach((h, j) => { if (['Date', 'EnrollDate', 'StartTime', 'EndTime', 'Phone'].includes(h)) sheet.getRange(row, j + 1).setNumberFormat('@'); });
    sheet.getRange(row, 1, 1, headers.length).setValues([headers.map(h => safeCell_(fields[h] == null ? '' : fields[h]))]);
  }
  SpreadsheetApp.flush();
}
function existing_(name, id) {
  if (!id) return null;
  const row = rows_(name).find(r => r[SCHEMA[name][0]] === id);
  if (!row) throw new Error('ไม่พบรายการเดิม กรุณาโหลดข้อมูลใหม่');
  return row;
}
function saveStudent_(p) {
  const existing = existing_('Students', p.StudentID);
  const fields = { StudentID: existing ? existing.StudentID : nextId_('Students', 'STU'), StudentName: text_(p.StudentName, true), Nickname: text_(p.Nickname), ParentName: text_(p.ParentName), Phone: text_(p.Phone), Active: bool_(p.Active), Note: text_(p.Note) };
  write_('Students', fields, existing); return result_('Students');
}
function saveEnrollment_(p) {
  const existing = existing_('Enrollments', p.EnrollmentID);
  if (!rows_('Students').some(s => s.StudentID === p.StudentID)) throw new Error('ไม่พบนักเรียนที่เลือก');
  if (!rows_('Courses').some(c => c.Course === p.Course && c.Level === p.Level)) throw new Error('ไม่พบหลักสูตรและระดับที่เลือก');
  if (!['กำลังเรียน', 'ทดลองเรียน', 'จบหลักสูตร', 'ยกเลิก'].includes(p.EnrollmentStatus)) throw new Error('สถานะการเรียนไม่ถูกต้อง');
  if (!['ชำระแล้ว', 'ยังไม่ชำระ', 'ชำระบางส่วน', 'ไม่คิดค่าเรียน'].includes(p.PaymentStatus)) throw new Error('สถานะชำระเงินไม่ถูกต้อง');
  const fields = { EnrollmentID: existing ? existing.EnrollmentID : nextId_('Enrollments', 'ENR'), StudentID: p.StudentID, Course: p.Course, Level: p.Level, EnrollmentStatus: p.EnrollmentStatus, PaymentStatus: p.PaymentStatus, Note: text_(p.Note) };
  if (!existing) fields.EnrollDate = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
  write_('Enrollments', fields, existing); return result_('Enrollments');
}
function saveHoliday_(p) {
  const date = date_(p.Date); if (!date) throw new Error('วันที่ไม่ถูกต้อง');
  const existing = rows_('Holidays').find(h => h.Date === date);
  write_('Holidays', { Date: date, Reason: text_(p.Reason, true), Type: text_(p.Type, true), Active: bool_(p.Active) }, existing);
  return result_('Holidays');
}
function saveSchedule_(p) {
  const existing = existing_('Schedule', p.ScheduleID), enrollments = rows_('Enrollments'), students = rows_('Students');
  const enrollment = enrollments.find(e => e.EnrollmentID === p.EnrollmentID);
  if (!enrollment) throw new Error('ไม่พบการลงทะเบียนที่เลือก');
  const date = date_(p.Date), start = time_(p.StartTime), end = time_(p.EndTime);
  if (!date || !start || !end || start >= end) throw new Error('ตรวจสอบวันที่ และเวลาจบต้องมากกว่าเวลาเริ่ม');
  const schedules = rows_('Schedule');
  const conflicts = schedules.filter(s => s.ScheduleID !== p.ScheduleID && s.Date === date && start < s.EndTime && end > s.StartTime);
  if (conflicts.some(s => s.EnrollmentID === p.EnrollmentID && s.StartTime === start && s.EndTime === end)) throw new Error('มีนัดของนักเรียนในหลักสูตรนี้วันและเวลาเดียวกันแล้ว กรุณาแก้ไขรายการเดิม');
  const details = conflicts.map(function (s) {
    const e = enrollments.find(e => e.EnrollmentID === s.EnrollmentID), student = e && students.find(st => st.StudentID === e.StudentID);
    const name = student ? (student.Nickname && student.Nickname !== student.StudentName ? student.Nickname + ' (' + student.StudentName + ')' : student.StudentName) : 'ไม่พบชื่อนักเรียน';
    return { ScheduleID: s.ScheduleID, StudentName: name, Course: e ? e.Course : 'ไม่พบหลักสูตร', Level: e ? e.Level : '', StartTime: s.StartTime, EndTime: s.EndTime };
  });
  const conflictVersion = hash_(JSON.stringify([p.ScheduleID || '', p.EnrollmentID, date, start, end, details]));
  if (conflicts.length && p.conflictVersion !== conflictVersion) return { success: false, code: 'CONFLICT', conflicts: details, conflictVersion: conflictVersion };
  const holiday = rows_('Holidays').find(h => h.Date === date && h.Active);
  const holidayVersion = holiday ? hash_(JSON.stringify([date, holiday.Reason, holiday.Type])) : '';
  if (holiday && p.holidayVersion !== holidayVersion) return { success: false, code: 'HOLIDAY', reason: holiday.Reason, holidayVersion: holidayVersion };
  const id = existing ? existing.ScheduleID : nextId_('Schedule', 'SCH');
  write_('Schedule', { ScheduleID: id, EnrollmentID: p.EnrollmentID, Date: date, StartTime: start, EndTime: end, Duration: (minutes_(end) - minutes_(start)) / 60, SessionNo: 1, Note: text_(p.Note) }, existing);
  const own = rows_('Schedule').filter(s => s.EnrollmentID === p.EnrollmentID).sort((a, b) => (a.Date + a.StartTime).localeCompare(b.Date + b.StartTime));
  const scheduleSheet = sheet_('Schedule');
  const sessionColumn = scheduleSheet.getRange(1, 1, 1, scheduleSheet.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim()).indexOf('SessionNo') + 1;
  own.forEach(function (s, i) { if (String(s.SessionNo) !== String(i + 1)) scheduleSheet.getRange(s.rowIdx, sessionColumn).setValue(i + 1); });
  SpreadsheetApp.flush();
  return result_('Schedule');
}
