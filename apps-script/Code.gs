// BostonRobotics AdminSystem API v2.2 — no application login.
// Anyone with access to this deployment can read and edit the data.
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
function health_() { return { success: true, version: '2.2', authMode: 'none', capabilities: ['bootstrap'] }; }
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'getHealth') return json_(health_());
  return json_({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'กรุณาเรียกข้อมูลด้วย POST' });
}
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    if (request.action === 'getBootstrap') return json_(bootstrap_());
    if (request.action === 'getTimeSlots') return json_({ success: true, data: timeSlots_() });
    const reads = { getStudents: 'Students', getCourses: 'Courses', getEnrollments: 'Enrollments', getSchedule: 'Schedule', getHolidays: 'Holidays' };
    if (Object.prototype.hasOwnProperty.call(reads, request.action)) return json_(result_(reads[request.action]));
    const writes = { saveStudent: saveStudent_, saveEnrollment: saveEnrollment_, saveSchedule: saveSchedule_, saveHoliday: saveHoliday_ };
    if (!Object.prototype.hasOwnProperty.call(writes, request.action)) return json_({ success: false, code: 'UNKNOWN_ACTION', message: 'ไม่พบคำสั่งที่ร้องขอ' });
    return json_(locked_(function () { return writes[request.action](request.payload || {}); }));
  } catch (error) {
    return json_({ success: false, code: error.code || 'ERROR', message: error.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
  }
}
function locked_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('ระบบกำลังบันทึกรายการอื่น กรุณาลองใหม่');
  try { return callback(); } finally { lock.releaseLock(); }
}
function hash_(value) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)); }
function sheet_(name, spreadsheet) {
  const sheet = (spreadsheet || SpreadsheetApp.openById(SPREADSHEET_ID)).getSheetByName(name);
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
function rows_(name, spreadsheet) {
  const sheet = sheet_(name, spreadsheet), range = sheet.getDataRange(), raw = range.getValues(), display = range.getDisplayValues(), formulas = range.getFormulas(), headers = display[0].map(h => String(h).trim()), key = SCHEMA[name][0], result = [], arrays = new Set();
  formulas.forEach(row => row.forEach((formula, column) => { if (/\bARRAYFORMULA\s*\(/i.test(formula)) arrays.add(column); }));
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
    if (String(display[i][headers.indexOf(key)] || '').trim()) {
      item.rowIdx = i + 1;
      item.readOnlyFields = headers.filter((h, j) => h && (arrays.has(j) || formulas[i][j]));
      result.push(item);
    }
  }
  return result;
}
function result_(name) { return { success: true, data: rows_(name) }; }
function ruleError_(code, message) { const error = new Error(message); error.code = code; throw error; }
function bootstrap_() {
  // Reuse one spreadsheet handle only within this request; always read fresh data.
  const started = Date.now(), spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const collections = { students: 'Students', courses: 'Courses', enrollments: 'Enrollments', schedule: 'Schedule', holidays: 'Holidays', timeSlots: 'Lists' };
  const data = {}, errors = {};
  Object.keys(collections).forEach(function (key) {
    try { data[key] = key === 'timeSlots' ? timeSlots_(spreadsheet) : rows_(collections[key], spreadsheet); }
    catch (error) { errors[key] = error.message || 'โหลดข้อมูลไม่สำเร็จ'; }
  });
  return { success: true, data: data, errors: errors, serverMs: Date.now() - started };
}
function timeSlots_(spreadsheet) {
  const sheet = (spreadsheet || SpreadsheetApp.openById(SPREADSHEET_ID)).getSheetByName('Lists');
  if (!sheet) throw new Error('ไม่พบชีต Lists สำหรับช่วงเวลาเรียน');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim());
  const column = headers.indexOf('TimeSlots');
  if (column < 0) throw new Error('ไม่พบคอลัมน์ TimeSlots ในชีต Lists');
  if (sheet.getLastRow() < 2) throw new Error('ยังไม่มีช่วงเวลาเรียนใน Lists.TimeSlots');
  const range = sheet.getRange(2, column + 1, sheet.getLastRow() - 1, 1), values = range.getValues(), display = range.getDisplayValues();
  const slots = Array.from(new Set(display.map((r, i) => time_(r[0]) || time_(values[i][0])).filter(Boolean))).sort();
  if (slots.length < 2) throw new Error('กรุณากำหนดเวลาเรียนอย่างน้อย 2 ช่วงใน Lists.TimeSlots');
  return slots;
}
function scheduleTime_(p, slots) {
  const date = date_(p.Date), start = time_(p.StartTime), end = time_(p.EndTime);
  if (!date || !start || !end || start >= end) throw new Error('ตรวจสอบวันที่ และเวลาจบต้องมากกว่าเวลาเริ่ม');
  const first = slots.indexOf(start), last = slots.indexOf(end);
  if (first < 0 || last < 0) ruleError_('INVALID_TIME_SLOT', 'กรุณาเลือกเวลาเริ่มและเวลาจบตามช่วงเวลาในชีต Lists');
  const step = Math.min.apply(null, slots.slice(1).map((slot, i) => minutes_(slot) - minutes_(slots[i])));
  for (let i = first; i < last; i++) {
    if (minutes_(slots[i + 1]) - minutes_(slots[i]) > step) ruleError_('INVALID_TIME_SLOT', 'ช่วงเวลาเรียนคร่อมเวลาพัก กรุณาเลือกช่วงเช้าหรือช่วงบ่ายแยกกัน');
  }
  return { Date: date, StartTime: start, EndTime: end, Duration: (minutes_(end) - minutes_(start)) / 60, Note: text_(p.Note) };
}
function ensureColumn_(name, columnName) {
  const sheet = sheet_(name), last = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, last).getDisplayValues()[0].map(h => String(h).trim());
  if (headers.includes(columnName)) return;
  if (last >= sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), last + 1 - sheet.getMaxColumns());
  sheet.getRange(1, last + 1).setValue(columnName);
}
function text_(value, required) {
  const s = String(value == null ? '' : value).trim();
  if (required && !s) throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบ');
  if (s.length > 2000) throw new Error('ข้อความยาวเกิน 2,000 ตัวอักษร');
  return s;
}
function safeCell_(value) { return typeof value === 'string' && /^[=+@-]/.test(value) ? "'" + value : value; }
function nextId_(name, prefix) {
  const key = SCHEMA[name][0];
  const reserved = [], properties = PropertiesService.getScriptProperties().getProperties();
  Object.keys(properties).filter(k => k.indexOf('enrollmentRequest:') === 0).forEach(function (k) {
    const request = JSON.parse(properties[k]);
    if (request.state !== 'pending') return;
    if (name === 'Enrollments') reserved.push({ EnrollmentID: request.EnrollmentID });
    if (name === 'Schedule') Array.prototype.push.apply(reserved, request.schedule || []);
  });
  const max = rows_(name).concat(reserved).reduce((max, row) => { const m = String(row[key]).match(new RegExp('^' + prefix + '(\\d+)$')); return m ? Math.max(max, +m[1]) : max; }, 0);
  return prefix + String(max + 1).padStart(3, '0');
}
function write_(name, fields, existing) {
  const sheet = sheet_(name), headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim());
  if (existing) {
    const arrayColumns = arrayFormulaColumns_(sheet), formulas = sheet.getRange(existing.rowIdx, 1, 1, headers.length).getFormulas()[0];
    Object.keys(fields).forEach(function (key) {
      const column = headers.indexOf(key); if (column < 0) throw new Error('ไม่พบคอลัมน์ ' + key);
      if (arrayColumns.has(column) || formulas[column]) return;
      const cell = sheet.getRange(existing.rowIdx, column + 1);
      if (['Date', 'EnrollDate', 'StartTime', 'EndTime', 'Phone'].includes(key)) cell.setNumberFormat('@');
      cell.setValue(safeCell_(fields[key]));
    });
  } else {
    writeNewRows_(name, [fields]); return;
  }
  SpreadsheetApp.flush();
}
function arrayFormulaColumns_(sheet) {
  const columns = new Set();
  sheet.getDataRange().getFormulas().forEach(row => row.forEach((formula, column) => {
    if (/\bARRAYFORMULA\s*\(/i.test(formula)) columns.add(column);
  }));
  return columns;
}
function writeNewRows_(name, records) {
  if (!records.length) return;
  const sheet = sheet_(name), headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim());
  const keyColumn = headers.indexOf(SCHEMA[name][0]), existing = sheet.getDataRange().getDisplayValues();
  let row = 2;
  existing.forEach((values, i) => { if (i > 0 && String(values[keyColumn] || '').trim()) row = i + 2; });
  const last = row + records.length - 1;
  if (last > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), last - sheet.getMaxRows());
  const arrays = arrayFormulaColumns_(sheet), formulas = sheet.getRange(row, 1, records.length, headers.length).getFormulas();
  // Write contiguous ranges while keeping existing formula cells and array-output columns intact.
  for (let i = 0; i < records.length;) {
    const writable = headers.map((h, j) => !!h && !arrays.has(j) && !formulas[i][j]);
    const signature = writable.join(','); let end = i + 1;
    while (end < records.length && headers.map((h, j) => !!h && !arrays.has(j) && !formulas[end][j]).join(',') === signature) end++;
    let column = 0;
    while (column < headers.length) {
      if (!writable[column]) { column++; continue; }
      const first = column; while (column < headers.length && writable[column]) column++;
      for (let j = first; j < column; j++) if (['Date', 'EnrollDate', 'StartTime', 'EndTime', 'Phone'].includes(headers[j])) sheet.getRange(row + i, j + 1, end - i, 1).setNumberFormat('@');
      sheet.getRange(row + i, first + 1, end - i, column - first).setValues(records.slice(i, end).map(record => headers.slice(first, column).map(h => safeCell_(record[h] == null ? '' : record[h]))));
    }
    i = end;
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
  const requestId = existing ? '' : text_(p.requestId), properties = PropertiesService.getScriptProperties();
  if (requestId.length > 128) throw new Error('รหัสคำขอบันทึกยาวเกินไป');
  const fingerprint = hash_(JSON.stringify([p.StudentID, p.Course, p.Level, p.EnrollmentStatus, p.PaymentStatus, text_(p.Note), Number(p.SessionCount), Array.isArray(p.Sessions) ? p.Sessions.map(s => [date_(s.Date), time_(s.StartTime), time_(s.EndTime), text_(s.Note)]) : null]));
  const requestKey = requestId ? 'enrollmentRequest:' + hash_(requestId) : '';
  const prior = requestKey && properties.getProperty(requestKey); let reservation = null;
  if (prior) {
    const saved = JSON.parse(prior);
    if (saved.fingerprint !== fingerprint) ruleError_('REQUEST_MISMATCH', 'คำขอนี้เคยบันทึกแล้วแต่ข้อมูลเปลี่ยนไป กรุณาเปิดรายการใหม่');
    if (saved.state === 'pending') reservation = saved;
    else {
      if (!rows_('Enrollments').some(e => e.EnrollmentID === saved.EnrollmentID)) throw new Error('ไม่พบรายการที่เคยบันทึก กรุณาโหลดข้อมูลใหม่');
      return enrollmentResult_(saved.EnrollmentID);
    }
  }
  const students = rows_('Students'), courses = rows_('Courses'), enrollments = rows_('Enrollments'), schedules = rows_('Schedule');
  if (!students.some(s => s.StudentID === p.StudentID)) throw new Error('ไม่พบนักเรียนที่เลือก');
  if (!courses.some(c => c.Course === p.Course && c.Level === p.Level)) throw new Error('ไม่พบหลักสูตรและระดับที่เลือก');
  if (!['กำลังเรียน', 'ทดลองเรียน', 'พักการเรียน', 'จบหลักสูตร', 'ยกเลิก'].includes(p.EnrollmentStatus)) throw new Error('สถานะการเรียนไม่ถูกต้อง');
  if (!['ชำระแล้ว', 'ยังไม่ชำระ', 'ชำระบางส่วน', 'ไม่คิดค่าเรียน'].includes(p.PaymentStatus)) throw new Error('สถานะชำระเงินไม่ถูกต้อง');
  const fields = { EnrollmentID: existing ? existing.EnrollmentID : reservation ? reservation.EnrollmentID : nextId_('Enrollments', 'ENR'), StudentID: p.StudentID, Course: p.Course, Level: p.Level, EnrollmentStatus: p.EnrollmentStatus, PaymentStatus: p.PaymentStatus, Note: text_(p.Note) };
  if (p.SessionCount != null && p.SessionCount !== '') {
    const count = Number(p.SessionCount);
    if (!Number.isInteger(count) || count < 1 || count > 15) ruleError_('INVALID_SESSION_COUNT', 'กรุณาเลือกจำนวน Session ตั้งแต่ 1 ถึง 15');
    fields.SessionCount = count;
  }
  let pending = [];
  if (!existing) {
    if (!fields.SessionCount) ruleError_('INVALID_SESSION_COUNT', 'กรุณาเลือกจำนวน Session ตั้งแต่ 1 ถึง 15');
    if (!Array.isArray(p.Sessions) || p.Sessions.length !== fields.SessionCount) ruleError_('INVALID_SESSION_COUNT', 'กรุณาระบุวันและเวลาให้ครบตามจำนวน Session ที่เลือก');
    const slots = timeSlots_(), firstId = reservation ? 0 : Number(nextId_('Schedule', 'SCH').slice(3));
    pending = p.Sessions.map(function (session, i) {
      return Object.assign({ ScheduleID: reservation ? reservation.schedule[i].ScheduleID : 'SCH' + String(firstId + i).padStart(3, '0'), EnrollmentID: fields.EnrollmentID, SessionNo: 'Session ' + (i + 1) }, scheduleTime_(session, slots));
    });
    // Reserved IDs belong only to this request. Never overwrite a row changed independently.
    const writtenEnrollment = enrollments.find(e => e.EnrollmentID === fields.EnrollmentID);
    if (writtenEnrollment && (!reservation || ['StudentID', 'Course', 'Level', 'EnrollmentStatus', 'PaymentStatus'].some(k => writtenEnrollment[k] && writtenEnrollment[k] !== fields[k]))) ruleError_('REQUEST_CONFLICT', 'รายการที่บันทึกค้างไว้มีการแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่');
    pending.forEach(function (session) {
      const written = schedules.find(s => s.ScheduleID === session.ScheduleID);
      if (written && (!reservation || ['EnrollmentID', 'Date', 'StartTime', 'EndTime'].some(k => written[k] && written[k] !== session[k]))) ruleError_('REQUEST_CONFLICT', 'นัดเรียนที่บันทึกค้างไว้มีการแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่');
    });
    const challenge = preflightSchedules_(pending, enrollments.filter(e => e.EnrollmentID !== fields.EnrollmentID).concat([fields]), students, courses, schedules, p);
    if (challenge) return challenge;
    fields.EnrollDate = reservation ? reservation.fields.EnrollDate : Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
  } else {
    if (p.Sessions != null) throw new Error('กรุณาแก้ไขเวลาเรียนผ่านรายการนัดเรียน');
    if (existing.StudentID !== fields.StudentID || existing.Course !== fields.Course || existing.Level !== fields.Level) {
      const own = schedules.filter(s => s.EnrollmentID === existing.EnrollmentID);
      preflightSchedules_(own, enrollments.map(e => e.EnrollmentID === existing.EnrollmentID ? Object.assign({}, e, fields) : e), students, courses, schedules, p, true);
    }
  }
  // All rows, time slots, capacity rules and confirmations are checked before the first sheet write.
  if (requestKey && !reservation) {
    // Store only identity/date metadata; long user notes must not exceed Script Properties' value limit.
    reservation = { state: 'pending', fingerprint: fingerprint, EnrollmentID: fields.EnrollmentID, fields: { EnrollDate: fields.EnrollDate }, schedule: pending.map(s => ({ ScheduleID: s.ScheduleID })) };
    properties.setProperty(requestKey, JSON.stringify(reservation));
  }
  ensureColumn_('Enrollments', 'SessionCount');
  write_('Enrollments', fields, existing || enrollments.find(e => e.EnrollmentID === fields.EnrollmentID));
  const missing = [];
  pending.forEach(function (session) {
    const written = schedules.find(s => s.ScheduleID === session.ScheduleID);
    if (written) write_('Schedule', session, written); else missing.push(session);
  });
  writeNewRows_('Schedule', missing);
  if (requestKey) properties.setProperty(requestKey, JSON.stringify({ state: 'complete', fingerprint: fingerprint, EnrollmentID: fields.EnrollmentID }));
  return enrollmentResult_(fields.EnrollmentID);
}
function enrollmentResult_(id) { return { success: true, data: rows_('Enrollments'), schedule: rows_('Schedule'), EnrollmentID: id }; }
function saveHoliday_(p) {
  const date = date_(p.Date); if (!date) throw new Error('วันที่ไม่ถูกต้อง');
  const existing = rows_('Holidays').find(h => h.Date === date);
  write_('Holidays', { Date: date, Reason: text_(p.Reason, true), Type: text_(p.Type, true), Active: bool_(p.Active) }, existing);
  return result_('Holidays');
}
function saveSchedule_(p) {
  const existing = existing_('Schedule', p.ScheduleID), enrollments = rows_('Enrollments'), students = rows_('Students'), courses = rows_('Courses');
  const enrollment = enrollments.find(e => e.EnrollmentID === p.EnrollmentID);
  if (!enrollment) throw new Error('ไม่พบการลงทะเบียนที่เลือก');
  const schedules = rows_('Schedule');
  if (!existing || existing.EnrollmentID !== p.EnrollmentID) {
    const course = courses.find(c => c.Course === enrollment.Course && c.Level === enrollment.Level);
    const custom = Number(enrollment.SessionCount), defaultCount = Number(course && course.SessionCount);
    const target = Number.isInteger(custom) && custom > 0 ? custom : Number.isInteger(defaultCount) && defaultCount > 0 ? defaultCount : 0;
    if (!target) ruleError_('INVALID_SESSION_COUNT', 'กรุณากำหนดจำนวน Session ของหลักสูตรก่อนเพิ่มนัดเรียน');
    if (schedules.filter(s => s.EnrollmentID === p.EnrollmentID && s.ScheduleID !== p.ScheduleID).length >= Math.min(target, 15)) ruleError_('SESSION_LIMIT', 'นัดเรียนครบจำนวน Session ของการลงทะเบียนนี้แล้ว กรุณาแก้ไขนัดเดิม');
  }
  const id = existing ? existing.ScheduleID : nextId_('Schedule', 'SCH');
  const nextSession = schedules.filter(s => s.EnrollmentID === p.EnrollmentID).reduce((max, s) => {
    const match = String(s.SessionNo || '').match(/\d+/); return Math.max(max, match ? Number(match[0]) : 0);
  }, 0) + 1;
  const fields = Object.assign({ ScheduleID: id, EnrollmentID: p.EnrollmentID, SessionNo: existing ? existing.SessionNo : 'Session ' + nextSession }, scheduleTime_(p, timeSlots_()));
  const challenge = preflightSchedules_([fields], enrollments, students, courses, schedules, p);
  if (challenge) return challenge;
  write_('Schedule', fields, existing);
  return result_('Schedule');
}
function personKey_(student) {
  return String(student.StudentName || student.Nickname || student.StudentID).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
function appointment_(schedule, enrollments, students, courses) {
  const enrollment = enrollments.find(e => e.EnrollmentID === schedule.EnrollmentID);
  const student = enrollment && students.find(s => s.StudentID === enrollment.StudentID);
  if (!enrollment || !student || !(student.StudentName || student.Nickname) || !courses.some(c => c.Course === enrollment.Course && c.Level === enrollment.Level)) return null;
  if (!schedule.Date || !schedule.StartTime || !schedule.EndTime || schedule.StartTime >= schedule.EndTime) return null;
  const name = student.Nickname && student.Nickname !== student.StudentName ? student.Nickname + ' (' + student.StudentName + ')' : student.StudentName || student.Nickname;
  return Object.assign({}, schedule, { StudentID: student.StudentID, StudentName: name, PersonKey: personKey_(student), Course: enrollment.Course, Level: enrollment.Level });
}
function preflightSchedules_(candidates, enrollments, students, courses, schedules, p, skipConfirmations) {
  const ids = new Set(candidates.map(s => s.ScheduleID));
  // Legacy rows without a real student or a known course do not reserve classroom places.
  const booked = schedules.filter(s => !ids.has(s.ScheduleID)).map(s => appointment_(s, enrollments, students, courses)).filter(Boolean);
  const proposed = candidates.map(function (s) {
    const appointment = appointment_(s, enrollments, students, courses);
    if (!appointment) throw new Error('ไม่พบชื่อนักเรียน หลักสูตร หรือวันเวลา สำหรับนัดเรียนนี้');
    return appointment;
  });
  const details = [], seen = new Set();
  proposed.forEach(function (candidate, candidateIndex) {
    const overlaps = booked.concat(proposed.filter((s, i) => i !== candidateIndex)).filter(s => s.Date === candidate.Date && s.StartTime < candidate.EndTime && s.EndTime > candidate.StartTime);
    const label = candidate.Date + ' ' + candidate.StartTime + '–' + candidate.EndTime;
    if (overlaps.some(s => s.PersonKey === candidate.PersonKey)) ruleError_('STUDENT_OVERLAP', label + ': นักเรียนคนเดียวกันมีนัดเรียนทับซ้อนอยู่แล้ว กรุณาแก้ไขนัดเดิมหรือเลือกเวลาอื่น');
    if (overlaps.some(s => s.Course !== candidate.Course)) ruleError_('COURSE_MISMATCH', label + ': ช่วงเวลาเดียวกันรับได้เฉพาะนักเรียนในหลักสูตรเดียวกัน กรุณาเลือกเวลาอื่น');
    // Count the peak simultaneous people, not every appointment that touches a long lesson.
    const moments = [candidate.StartTime].concat(overlaps.map(s => s.StartTime).filter(t => t > candidate.StartTime && t < candidate.EndTime));
    const peak = moments.reduce(function (max, moment) {
      const people = new Set([candidate.PersonKey]);
      overlaps.filter(s => s.StartTime <= moment && s.EndTime > moment).forEach(s => people.add(s.PersonKey));
      return Math.max(max, people.size);
    }, 1);
    if (peak > 3) ruleError_('CAPACITY', label + ': ช่วงเวลาเดียวกันรับได้สูงสุด 3 คนในหลักสูตรเดียวกัน กรุณาเลือกเวลาอื่น');
    overlaps.forEach(function (s) {
      if (seen.has(s.ScheduleID)) return; seen.add(s.ScheduleID);
      details.push({ ScheduleID: s.ScheduleID, StudentID: s.StudentID, StudentName: s.StudentName, Course: s.Course, Level: s.Level, Date: s.Date, StartTime: s.StartTime, EndTime: s.EndTime });
    });
  });
  if (skipConfirmations) return null;
  const versionInput = candidates.map(s => [s.ScheduleID, s.EnrollmentID, s.Date, s.StartTime, s.EndTime]);
  const conflictVersion = hash_(JSON.stringify([versionInput, details]));
  if (details.length && p.conflictVersion !== conflictVersion) return { success: false, code: 'CONFLICT', message: 'ช่วงเวลานี้มีนักเรียนหลักสูตรเดียวกันอยู่แล้ว และยังไม่เกิน 3 คน ยืนยันเรียนร่วมกันหรือไม่', conflicts: details, conflictVersion: conflictVersion };
  const dates = new Set(candidates.map(s => s.Date));
  const holidays = rows_('Holidays').filter(h => dates.has(h.Date) && h.Active).map(h => ({ Date: h.Date, Reason: h.Reason, Type: h.Type }));
  const holidayVersion = holidays.length ? hash_(JSON.stringify([versionInput, holidays])) : '';
  if (holidays.length && p.holidayVersion !== holidayVersion) return { success: false, code: 'HOLIDAY', reason: holidays.map(h => h.Date + ': ' + h.Reason).join(', '), holidays: holidays, holidayVersion: holidayVersion };
  return null;
}
