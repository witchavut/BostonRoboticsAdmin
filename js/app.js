'use strict';
const API_URL = 'https://script.google.com/macros/s/AKfycbyE4ZEXNnTrqec6xnBRgabR3B28DZ3hbnxIrrzngv-547-eCRPthMg1Gy2BHhOHtaQ1ng/exec';
const D = BostonDomain, state = { students: [], courses: [], enrollments: [], schedule: [], holidays: [], timeSlots: [] };
const labels = { students: 'นักเรียน', courses: 'หลักสูตร', enrollments: 'ลงทะเบียนเรียน', schedule: 'ตารางเรียน', holidays: 'วันหยุด', timeSlots: 'ช่วงเวลาเรียน' };
let ready = {}, errors = {}, modernAPI = false, busy = false, loading = false;
let supportsBootstrap = false;
let calendarMonth = D.today().slice(0, 7), selectedCalendarDate = '';
let enrollmentRequestId = '';
let scheduleSearch = null, exportingSchedule = false;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = value => Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const student = id => state.students.find(s => s.StudentID === id);
const course = e => state.courses.find(c => c.Course === e.Course && c.Level === e.Level);
const nameOf = e => D.studentName(student(e?.StudentID));
const dateText = d => d ? d.split('-').reverse().join('/') : 'ตรวจสอบวันที่';
const hasData = (...keys) => keys.every(k => ready[k] && !errors[k]);
const canWrite = () => modernAPI && !busy && !loading && hasData(...Object.keys(labels));
function badge(text) {
    const color = ['ใช้งาน', 'ชำระแล้ว', 'กำลังเรียน', 'ครบเวลานัดแล้ว'].includes(text) ? 'success' : ['ระงับ', 'ยกเลิก'].includes(text) ? 'danger' : 'secondary';
    return `<span class="badge badge-${color}">${esc(text)}</span>`;
}
function editButton(kind, id) { return `<button class="btn btn-primary btn-sm" data-edit="${kind}" data-id="${esc(id)}">แก้ไข</button>`; }
function table(id, cols, rows, keys, empty = 'ยังไม่มีข้อมูล') {
    const failed = keys.filter(k => errors[k]);
    const message = failed.length ? `โหลด${failed.map(k => labels[k]).join(' / ')}ไม่สำเร็จ กรุณาโหลดข้อมูลใหม่` : keys.some(k => !ready[k]) ? loading ? 'กำลังโหลดข้อมูล…' : 'รอการเชื่อมต่อข้อมูล' : '';
    $(id).innerHTML = message || !rows ? `<tr><td colspan="${cols}" class="empty-state">${esc(message || empty)}</td></tr>` : rows;
}
function statusMessage(text, kind = 'info') { $('connection-status').textContent = text; $('connection-status').className = `connection-status ${kind}`; }
function updateButtons() {
    document.querySelectorAll('[data-write], [data-edit]').forEach(b => b.disabled = !canWrite());
    document.querySelectorAll('[data-export-schedule]').forEach(b => b.disabled = exportingSchedule || busy || loading || !hasData('students', 'courses', 'enrollments', 'schedule'));
    $('refresh-data').disabled = busy || loading;
    document.querySelectorAll('#enrollment-modal .input-form, #schedule-modal .input-form').forEach(input => {
        input.disabled = busy || ['enr-id', 'sch-duration'].includes(input.id) || (input.id === 'enr-session-count' && $('enr-mode').value === 'edit');
    });
}
async function request(action, payload, post = false) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
    try {
        const options = { signal: controller.signal, cache: 'no-store', redirect: 'follow' };
        if (post) Object.assign(options, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, payload }) });
        const response = await fetch(post ? API_URL : `${API_URL}?action=${encodeURIComponent(action)}&_=${Date.now()}`, options);
        if (!response.ok) throw new Error(`ติดต่อระบบไม่สำเร็จ (${response.status})`);
        const raw = await response.text(); let result;
        try { result = JSON.parse(raw); } catch { throw new Error('ไม่ได้รับข้อมูล JSON จาก Apps Script กรุณาตรวจสอบ URL และสิทธิ์เข้าถึง deployment'); }
        if (!result || typeof result !== 'object') throw new Error('รูปแบบข้อมูลจาก Apps Script ไม่ถูกต้อง');
        if (result.code === 'UNAUTHORIZED') {
            modernAPI = false;
            throw new Error('กรุณาแทน Code.gs ด้วยรุ่น 2.2 และ Deploy > New version');
        }
        if (!result.success && !['CONFLICT', 'HOLIDAY'].includes(result.code)) throw new Error(result.message || 'ระบบไม่สามารถทำรายการได้');
        return result;
    } catch (error) {
        if (action.startsWith('save') && (error.name === 'AbortError' || error instanceof TypeError)) throw new Error('ยังยืนยันผลบันทึกไม่ได้ กรุณาโหลดข้อมูลใหม่ก่อนบันทึกซ้ำ');
        if (error.name === 'AbortError') throw new Error('การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่');
        throw error;
    } finally { clearTimeout(timer); }
}
async function initApp() {
    if (loading || busy) return;
    loading = true; renderAll(); statusMessage('กำลังตรวจสอบการเชื่อมต่อ…');
    modernAPI = false; supportsBootstrap = false;
    try {
        const health = await request('getHealth'); modernAPI = health.version === '2.2' && health.authMode === 'none';
        supportsBootstrap = Array.isArray(health.capabilities) && health.capabilities.includes('bootstrap');
        if (!modernAPI) throw new Error(health.version ? `Apps Script รุ่น ${health.version} ยังไม่รองรับหน้าเว็บนี้ กรุณาใช้ Code.gs รุ่น 2.2 และ Deploy > New version` : 'ตรวจสอบรุ่น Apps Script ไม่สำเร็จ กรุณาตรวจสอบ URL และ deployment');
    } catch (error) {
        modernAPI = false; statusMessage(`ตรวจสอบการเชื่อมต่อไม่สำเร็จ: ${error.message} • กดโหลดข้อมูลใหม่เพื่อลองอีกครั้ง`, 'error');
    } finally { loading = false; renderAll(); }
    if (modernAPI) await loadData();
}
async function loadData() {
    if (loading || busy || !modernAPI) return;
    loading = true; errors = {}; ready = {}; renderAll(); statusMessage('กำลังโหลดข้อมูล…');
    const started = Date.now();
    let batch;
    if (supportsBootstrap) {
        try { batch = await request('getBootstrap', {}, true); }
        catch (error) { batch = { errors: Object.fromEntries(Object.keys(state).map(key => [key, error.message])) }; }
    }
    // Older deployments still work until the Apps Script update is published.
    for (const key of Object.keys(state)) {
        try {
            if (batch?.errors?.[key]) throw new Error(batch.errors[key]);
            const result = supportsBootstrap ? { data: batch?.data?.[key] } : await request('get' + key[0].toUpperCase() + key.slice(1), {}, true);
            if (!Array.isArray(result.data)) throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');
            state[key] = key === 'timeSlots' ? [...new Set(result.data.map(D.time).filter(Boolean))].sort() : D.normalize(key, result.data); ready[key] = true;
            if (key === 'timeSlots' && state[key].length < 2) throw new Error('ไม่พบช่วงเวลาในคอลัมน์ TimeSlots ของชีต Lists');
        } catch (error) {
            errors[key] = error.message; state[key] = [];
            if (!modernAPI) break;
        }
    }
    loading = false; const failed = Object.keys(errors);
    const detail = failed.map(k => `${labels[k]}: ${errors[k]}`).join(' • ');
    statusMessage(detail || `เชื่อมต่อแล้ว • โหลดข้อมูล ${((Date.now() - started) / 1000).toFixed(1)} วินาที • ${supportsBootstrap ? 'แบบรวม' : 'แบบเดิม'} • คำนวณชั่วโมงตามเวลาไทย`, failed.length ? 'error' : 'success');
    renderAll();
}
function scheduleStatus(s) { return !s.Date || !s.EndTime ? 'ตรวจสอบวันเวลา' : D.completed(s) ? 'ครบเวลานัดแล้ว' : 'ยังไม่ครบเวลานัด'; }
function renderDashboard() {
    const available = hasData('students', 'courses', 'enrollments', 'schedule'), stats = D.studentStats(state);
    $('dash-total-students').textContent = available ? `${stats.total} คน` : '—';
    $('dash-active-students').textContent = available ? `${stats.active} คน` : '—';
    $('dash-trial-students').textContent = available ? `${stats.trials} คน` : '—';
    $('dash-active-courses').innerHTML = available ? stats.activeByCourse.map(item => `<div class="course-count"><strong>${esc(item.course)}</strong><span>${item.count} คน</span></div>`).join('') || '<p class="subtext">ไม่มีนักเรียนที่กำลังเรียน</p>' : '<p class="subtext">รอข้อมูลนักเรียนและตารางเรียน</p>';
    $('dash-unpaid').textContent = hasData('enrollments') ? `${state.enrollments.filter(e => ['ยังไม่ชำระ', 'ชำระบางส่วน'].includes(e.PaymentStatus)).length} รายการ` : '—';
    const sessions = state.schedule.filter(s => s.Date === D.today() && D.validSchedule(s, state)).sort((a, b) => a.StartTime.localeCompare(b.StartTime));
    $('dash-today-classes').textContent = hasData('schedule') ? `${sessions.length} นัด` : '—';
    table('today-schedule-tbody', 4, sessions.map(s => { const e = state.enrollments.find(e => e.EnrollmentID === s.EnrollmentID); return `<tr><td>${esc(s.StartTime)}–${esc(s.EndTime)}</td><td>${esc(nameOf(e))}</td><td>${esc(e ? `${e.Course} / ${e.Level}` : 'ไม่พบหลักสูตร')}</td><td>${badge(scheduleStatus(s))}</td></tr>`; }).join(''), ['students', 'enrollments', 'schedule'], 'วันนี้ไม่มีนัดเรียน');
}
function renderStudents() {
    const q = $('search-student').value.toLowerCase().trim();
    table('students-tbody', 6, state.students.filter(s => [s.StudentName, s.Nickname, s.ParentName, s.Phone].some(v => String(v).toLowerCase().includes(q))).map(s => `<tr><td>${esc(s.StudentName)}</td><td>${esc(s.Nickname)}</td><td>${esc(s.ParentName)}</td><td>${esc(s.Phone)}</td><td>${badge(s.Active ? 'ใช้งาน' : 'ระงับ')}</td><td>${editButton('student', s.StudentID)}</td></tr>`).join(''), ['students']); updateButtons();
}
function renderEnrollments() {
    table('enrollments-tbody', 8, state.enrollments.map(e => {
        const p = D.enrollmentProgress(e, state);
        const progress = hasData('schedule') ? `${p.completed} / ${p.target} Session<br><small>เหลือ ${p.remaining} Session · เรียนแล้ว ${num(p.usedHours)} ชม.</small>` : 'รอข้อมูลตารางเรียน';
        return `<tr><td>${esc(nameOf(e))}<small class="subtext">${esc(dateText(e.EnrollDate))}</small></td><td>${esc(e.Course)}</td><td>${esc(e.Level)}</td><td>${badge(e.EnrollmentStatus)}</td><td>${badge(e.PaymentStatus)}</td><td>${progress}</td><td>${editButton('enrollment', e.EnrollmentID)}</td><td>${['ชำระแล้ว','ชำระเงินแล้ว'].includes(String(e.PaymentStatus).trim()) ? `<button type="button" class="btn btn-secondary btn-sm" data-enrollment-receipt="${esc(e.EnrollmentID)}">${globalThis.BostonReceipts?.hasReceipt(e.EnrollmentID) ? 'ดูใบเสร็จ' : 'ออกใบเสร็จ'}</button>` : '—'}</td></tr>`;
    }).join(''), ['students', 'courses', 'enrollments']);
}
function renderCourses() { table('courses-tbody', 5, state.courses.map(c => `<tr><td>${esc(c.Course)}</td><td>${esc(c.Level)}</td><td>${num(c.TotalHours)} ชม.</td><td>${num(c.SessionCount)} ครั้ง</td><td>${badge(c.Active ? 'ใช้งาน' : 'ระงับ')}</td></tr>`).join(''), ['courses']); }
function renderHolidays() { table('holidays-tbody', 5, [...state.holidays].sort((a, b) => a.Date.localeCompare(b.Date)).map(h => `<tr><td>${esc(dateText(h.Date))}</td><td>${esc(h.Reason)}</td><td>${esc(h.Type)}</td><td>${badge(h.Active ? 'ใช้งาน' : 'ระงับ')}</td><td>${editButton('holiday', h.Date)}</td></tr>`).join(''), ['holidays']); }
function updateScheduleEnrollmentDropdown() {
    const select = $('sch-select-student'), previous = select.value, q = $('search-schedule').value.trim().toLowerCase();
    select.replaceChildren(new Option('-- เลือกนักเรียน --', ''));
    D.studentGroups(state).filter(group => group.enrollments.length && D.studentName(group.student).toLowerCase().includes(q)).forEach(group => select.add(new Option(D.studentName(group.student), group.student.StudentID)));
    select.value = previous; if (select.selectedIndex < 0) select.value = '';
    scheduleSearch?.refresh();
}
function renderScheduleView() {
    const selected = student($('sch-select-student').value);
    $('sch-management-container').style.display = selected ? 'block' : 'none'; if (!selected) return;
    const enrollments = D.studentEnrollments(selected.StudentID, state);
    $('sch-student-summary').innerHTML = `<strong>${esc(D.studentName(selected))}</strong><span>${enrollments.length} รายการลงทะเบียน</span>`;
    if (!hasData('students', 'courses', 'enrollments', 'schedule')) { $('sch-enrollment-groups').innerHTML = '<p class="empty-state">รอข้อมูลตารางเรียน กรุณาโหลดข้อมูลให้ครบ</p>'; return; }
    $('sch-enrollment-groups').innerHTML = enrollments.map(e => {
        const p = D.enrollmentProgress(e, state);
        const rows = p.sessions.map(s => `<tr><td>${sessionText(s)}</td><td>${esc(dateText(s.Date))}</td><td>${esc(s.StartTime)}–${esc(s.EndTime)}</td><td>${num(s.Duration)} ชม.</td><td>${badge(scheduleStatus(s))}</td><td>${esc(s.Note)}</td><td>${editButton('schedule', s.ScheduleID)}</td></tr>`).join('');
        const finished = e.EnrollmentStatus === 'จบหลักสูตร';
        return `<section class="student-enrollment-group"><div class="page-header"><div><h3>${esc(e.Course)} / ${esc(e.Level)}</h3><span class="subtext">ลงทะเบียน ${esc(dateText(e.EnrollDate))} · ${esc(e.PaymentStatus)}</span></div>${badge(e.EnrollmentStatus)}</div><div class="level-progress"><span>เรียนแล้ว ${p.completed} / ${p.target} Session</span><strong>${finished ? 'จบหลักสูตรแล้ว' : `เหลือ ${p.remaining} Session`}</strong><span>นัดแล้ว ${p.scheduled} ครั้ง · ยังไม่นัด ${p.unbooked} ครั้ง</span></div><div class="enrollment-actions"><button type="button" class="btn btn-primary" data-export-schedule="${esc(e.EnrollmentID)}" aria-label="ดาวน์โหลด PNG ${esc(e.Course)} ${esc(e.Level)}"><i class="fas fa-download" aria-hidden="true"></i> ดาวน์โหลดตารางเรียน PNG</button></div><div class="table-container"><table class="data-table"><thead><tr><th>Session</th><th>วันที่</th><th>เวลา</th><th>ระยะเวลา</th><th>สถานะ</th><th>หมายเหตุ</th><th>จัดการ</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty-state">ยังไม่มีนัดเรียน</td></tr>'}</tbody></table></div>${!finished && e.EnrollmentStatus !== 'ยกเลิก' && p.unbooked > 0 ? `<button type="button" class="btn btn-primary" data-write data-add-schedule="${esc(e.EnrollmentID)}">เพิ่มนัดเรียน ${esc(e.Level)}</button>` : ''}</section>`;
    }).join(''); updateButtons();
}
async function downloadStudentSchedule(enrollmentId) {
    if (exportingSchedule || busy || loading || !hasData('students', 'courses', 'enrollments', 'schedule')) return;
    const selected = student($('sch-select-student').value);
    const enrollment = selected && D.studentEnrollments(selected.StudentID, state).find(e => e.EnrollmentID === enrollmentId);
    if (!enrollment) return;
    const status = $('schedule-export-status'), now = new Date();
    exportingSchedule = true; updateButtons(); status.textContent = 'กำลังสร้างภาพตารางเรียน…';
    try {
        const progress = D.enrollmentProgress(enrollment, state, now);
        await BostonScheduleExport.download({
            student: { ...student(enrollment.StudentID) }, enrollment: { ...enrollment }, course: { ...course(enrollment) },
            progress: { ...progress, sessions: progress.sessions.map(s => ({ ...s })) }, now, logoUrl: 'assets/boston-logo.png'
        });
        status.textContent = `ดาวน์โหลด PNG ${enrollment.Course} / ${enrollment.Level} แล้ว`;
    } catch (error) {
        status.textContent = `สร้างภาพไม่สำเร็จ: ${error.message} กรุณาลองอีกครั้ง`;
    } finally { exportingSchedule = false; updateButtons(); }
}
function sessionText(s) { const n = D.sessionNumber(s); return n ? `Session ${n}` : 'ยังไม่ระบุ Session'; }
function changeCalendarMonth(delta) {
    const [year, month] = calendarMonth.split('-').map(Number);
    calendarMonth = new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
    renderCalendar();
}
function calendarDateLabel(date) {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date(`${date}T12:00:00+07:00`));
}
function calendarEvent(s) {
    const enrollment = state.enrollments.find(e => e.EnrollmentID === s.EnrollmentID);
    const learner = student(enrollment?.StudentID);
    const color = course(enrollment || {})?.ColorHex;
    return {
        name: nameOf(enrollment), shortName: learner?.Nickname || nameOf(enrollment),
        course: enrollment ? `${enrollment.Course} / ${enrollment.Level}` : 'ไม่พบหลักสูตร',
        courseName: enrollment?.Course || '', level: enrollment?.Level || '',
        color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#2563eb'
    };
}
function calendarTimeGroups(sessions) {
    const groups = new Map();
    [...sessions].sort((a, b) => `${a.Date}|${a.StartTime}|${a.EndTime}|${a.ScheduleID}`.localeCompare(`${b.Date}|${b.StartTime}|${b.EndTime}|${b.ScheduleID}`)).forEach(session => {
        const key = `${session.Date}|${session.StartTime}|${session.EndTime}`;
        if (!groups.has(key)) groups.set(key, { date: session.Date, start: session.StartTime, end: session.EndTime, sessions: [] });
        groups.get(key).sessions.push(session);
    });
    return [...groups.values()];
}
function renderCalendar() {
    const [year, month] = calendarMonth.split('-').map(Number);
    $('calendar-month').textContent = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
    const keys = ['students', 'courses', 'enrollments', 'schedule', 'holidays'];
    const available = hasData(...keys), today = D.today();
    const groups = available ? calendarTimeGroups(state.schedule.filter(s => D.validSchedule(s, state))) : [];
    $('calendar-message').textContent = loading ? 'กำลังโหลดตารางเรียน…' : !available ? 'ยังโหลดตารางเรียนไม่ครบ กรุณากดโหลดข้อมูลใหม่' : 'เลือกวันที่เพื่อดูรายการนัดเรียนทั้งหมด';
    $('calendar-days').innerHTML = D.calendarDays(calendarMonth).map(date => {
        const own = groups.filter(group => group.date === date), appointmentCount = own.reduce((sum, group) => sum + group.sessions.length, 0);
        const holidays = available ? state.holidays.filter(h => h.Active && h.Date === date) : [];
        const limit = holidays.length ? 2 : 3;
        const events = own.slice(0, limit).map(group => {
            const entries = group.sessions.map(s => ({ session: s, info: calendarEvent(s) }));
            const sharedCourse = entries.every(entry => entry.info.courseName === entries[0].info.courseName) ? entries[0].info.courseName : '';
            const learners = entries.map(({ session: s, info }) => {
                const shortSession = D.sessionNumber(s) ? `ครั้ง ${D.sessionNumber(s)}` : 'ไม่ระบุครั้ง';
                return `<span class="calendar-event" style="--event-color:${info.color};--event-bg:${info.color}12" title="${esc(`${info.name} · ${info.course} · ${sessionText(s)}`)}"><b>${esc(info.shortName)}</b>${sharedCourse ? `<span class="calendar-level">${esc(info.level)}</span>` : `<span class="calendar-course">${esc(info.course)}</span>`}<span class="calendar-session">${shortSession}</span></span>`;
            }).join('');
            return `<span class="calendar-time-group"><span class="calendar-time-label">${esc(group.start)}–${esc(group.end)}</span>${sharedCourse ? `<span class="calendar-group-course">${esc(sharedCourse)}</span>` : ''}<span class="calendar-time-students" style="--calendar-group-columns:${Math.min(3, group.sessions.length)}">${learners}</span></span>`;
        }).join('');
        return `<button type="button" class="calendar-day${date.slice(0, 7) !== calendarMonth ? ' outside' : ''}${date === today ? ' today' : ''}${holidays.length ? ' holiday' : ''}" data-calendar-date="${date}" ${date === today ? 'aria-current="date"' : ''} aria-label="${esc(calendarDateLabel(date))}${available ? `, ${appointmentCount} นัดเรียน` : ', รอข้อมูล'}${holidays.length ? ', วันหยุด' : ''}"><span class="calendar-day-number">${Number(date.slice(-2))}</span>${holidays.map(h => `<span class="calendar-holiday">${esc(h.Reason)}</span>`).join('')}${events}${own.length > limit ? `<span class="calendar-more">+${own.length - limit} ช่วงเวลา</span>` : ''}</button>`;
    }).join('');
    if (selectedCalendarDate && $('calendar-day-modal').classList.contains('show')) renderCalendarDay();
}
function renderCalendarDay() {
    $('calendar-day-title').textContent = calendarDateLabel(selectedCalendarDate);
    if (!hasData('students', 'courses', 'enrollments', 'schedule', 'holidays')) {
        $('calendar-day-list').innerHTML = '<p class="empty-state">ยังโหลดข้อมูลไม่ครบ กรุณาโหลดข้อมูลใหม่</p>'; return;
    }
    const holidays = state.holidays.filter(h => h.Active && h.Date === selectedCalendarDate);
    const groups = calendarTimeGroups(state.schedule.filter(s => s.Date === selectedCalendarDate && D.validSchedule(s, state)));
    $('calendar-day-list').innerHTML = holidays.map(h => `<p class="calendar-holiday-detail">วันหยุด: ${esc(h.Reason)}</p>`).join('') + (groups.length ? groups.map(group => {
        const learners = group.sessions.map(s => {
            const info = calendarEvent(s);
            return `<article class="calendar-detail" style="--event-color:${info.color}"><strong>${esc(info.name)}</strong><p>${esc(info.course)} · ${sessionText(s)}</p>${s.Note ? `<p class="subtext">${esc(s.Note)}</p>` : ''}<button type="button" data-write data-calendar-edit="${esc(s.ScheduleID)}" class="btn btn-primary btn-sm" ${canWrite() ? '' : 'disabled'}>แก้ไขเวลาเรียน</button></article>`;
        }).join('');
        return `<section class="calendar-day-time-group"><h3 class="calendar-day-time-label">${esc(group.start)}–${esc(group.end)}</h3><div class="calendar-day-students" style="--calendar-group-columns:${Math.min(3, group.sessions.length)}">${learners}</div></section>`;
    }).join('') : '<p class="empty-state">ไม่มีนัดเรียนในวันนี้</p>');
}
function openCalendarDay(date) { selectedCalendarDate = date; renderCalendarDay(); openModal('calendar-day-modal'); }
function editCalendarSchedule(id) {
    if (!canWrite()) return;
    const session = state.schedule.find(s => s.ScheduleID === id); if (!session) return;
    $('search-schedule').value = ''; updateScheduleEnrollmentDropdown();
    const enrollment = state.enrollments.find(e => e.EnrollmentID === session.EnrollmentID);
    const group = D.studentGroups(state).find(g => g.studentIds.includes(enrollment?.StudentID));
    $('sch-select-student').value = group?.student.StudentID || ''; renderScheduleView();
    closeModal('calendar-day-modal'); openScheduleModal('edit', id);
}
function renderAll() { renderStudents(); renderCourses(); renderEnrollments(); renderHolidays(); updateScheduleEnrollmentDropdown(); renderScheduleView(); renderDashboard(); renderCalendar(); updateButtons(); }
function openModal(id) { $(id).classList.add('show'); $(id).querySelector('input:not([disabled]):not([type="hidden"]),select,button')?.focus(); }
function closeModal(id) { if (!busy) $(id).classList.remove('show'); }
function openStudentModal(mode, id) {
    if (!canWrite()) return; const s = mode === 'edit' ? student(id) : {}; if (!s) return;
    $('stu-mode').value = mode; $('stu-id').value = s.StudentID || '';
    for (const [id, key] of [['stu-name', 'StudentName'], ['stu-nickname', 'Nickname'], ['stu-parent', 'ParentName'], ['stu-phone', 'Phone'], ['stu-note', 'Note']]) $(id).value = s[key] || '';
    $('stu-active').value = String(s.Active ?? true); openModal('student-modal');
}
function openEnrollmentModal(mode, id) {
    if (!canWrite()) return; const e = mode === 'edit' ? state.enrollments.find(e => e.EnrollmentID === id) : {}; if (!e) return;
    $('enr-mode').value = mode; $('enr-id').value = e.EnrollmentID || 'สร้างอัตโนมัติ';
    enrollmentRequestId = mode === 'add' ? crypto.randomUUID() : '';
    $('enr-sessions').replaceChildren(); $('enr-sessions-section').hidden = mode === 'edit';
    $('enr-session-count').disabled = mode === 'edit';
    $('enr-student').replaceChildren(...state.students.filter(s => s.Active || s.StudentID === e.StudentID).map(s => new Option(D.studentName(s), s.StudentID)));
    $('enr-course').replaceChildren(...[...new Set(state.courses.filter(c => c.Active || c.Course === e.Course).map(c => c.Course))].map(c => new Option(c, c)));
    if (e.StudentID) $('enr-student').value = e.StudentID; if (e.Course) $('enr-course').value = e.Course; updateLevelDropdown(e.Level);
    if (mode === 'edit') $('enr-session-count').value = String(Math.min(15, D.sessionTarget(e, state.courses)) || 1);
    $('enr-status').value = e.EnrollmentStatus || 'กำลังเรียน'; $('enr-payment').value = e.PaymentStatus || 'ยังไม่ชำระ';
    configureNote('enr-note', e, state.enrollments, mode); openModal('enrollment-modal');
}
function configureNote(id, item, rows, mode) {
    const readOnly = mode === 'edit' ? item.readOnlyFields?.includes('Note') : rows.some(row => row.readOnlyFields?.includes('Note'));
    $(id).value = item.Note || ''; $(id).readOnly = !!readOnly;
    $(id).placeholder = readOnly ? 'อัปเดตอัตโนมัติจากชีต' : '';
    $(id).title = readOnly ? 'ช่องนี้อัปเดตอัตโนมัติจากข้อมูลนักเรียนในชีต' : '';
}
function updateLevelDropdown(selected) {
    $('enr-level').replaceChildren(...state.courses.filter(c => c.Course === $('enr-course').value && (c.Active || c.Level === selected)).map(c => new Option(c.Level, c.Level)));
    if (selected) $('enr-level').value = selected;
    updateEnrollmentSessionDefaults();
}
function updateEnrollmentSessionDefaults() {
    if ($('enr-mode').value === 'edit') return;
    const selected = course({ Course: $('enr-course').value, Level: $('enr-level').value });
    $('enr-session-count').value = String(Math.max(1, Math.min(15, Number(selected?.SessionCount) || 1)));
    renderEnrollmentSessions();
}
function readEnrollmentSessions() {
    return [...$('enr-sessions').querySelectorAll('.enrollment-session-row')].map(row => ({
        Date: row.querySelector('[data-session-date]').value,
        StartTime: row.querySelector('[data-session-start]').value,
        EndTime: row.querySelector('[data-session-end]').value
    }));
}
function timeOptions(selected = '') {
    return '<option value="">เลือกเวลา</option>' + state.timeSlots.map(time => `<option value="${time}"${time === selected ? ' selected' : ''}>${time}</option>`).join('');
}
function renderEnrollmentSessions() {
    const previous = readEnrollmentSessions(), count = Number($('enr-session-count').value);
    $('enr-sessions-hint').textContent = 'เลือกวันและเวลาให้ครบทุก Session · ช่วงเวลาอ้างอิงจากชีต · กลุ่มเดียวกันไม่เกิน 3 คน';
    $('enr-sessions').innerHTML = Array.from({ length: Math.max(1, Math.min(15, count || 1)) }, (_, index) => {
        const old = previous[index] || {}, n = index + 1;
        return `<div class="enrollment-session-row"><strong class="session-label">Session ${n}</strong><div class="form-group"><label for="enr-date-${n}">วันที่</label><input id="enr-date-${n}" class="input-form" type="date" data-session-date value="${esc(old.Date || '')}" required></div><div class="form-group"><label for="enr-start-${n}">เวลาเริ่ม</label><select id="enr-start-${n}" class="input-form" data-session-start required>${timeOptions(old.StartTime)}</select></div><div class="form-group"><label for="enr-end-${n}">เวลาจบ</label><select id="enr-end-${n}" class="input-form" data-session-end required>${timeOptions(old.EndTime)}</select></div></div>`;
    }).join('');
}
function openHolidayModal(mode, date) {
    if (!canWrite()) return; const h = mode === 'edit' ? state.holidays.find(h => h.Date === date) : {}; if (!h) return;
    $('hol-mode').value = mode; $('hol-date').value = h.Date || ''; $('hol-date').disabled = mode === 'edit'; $('hol-reason').value = h.Reason || ''; $('hol-type').value = h.Type || 'งดสอนพิเศษ'; $('hol-active').value = String(h.Active ?? true); openModal('holiday-modal');
}
function openScheduleModal(mode, id, enrollmentId) {
    if (!canWrite()) return; const s = mode === 'edit' ? state.schedule.find(s => s.ScheduleID === id) : {}; if (!s) return;
    const e = state.enrollments.find(e => e.EnrollmentID === (s.EnrollmentID || enrollmentId)); if (!e) return;
    $('sch-enrollment-id').value = e.EnrollmentID;
    $('sch-modal-title').textContent = `${nameOf(e)} · ${e.Course} / ${e.Level}${mode === 'edit' ? ` · ${sessionText(s)}` : ''}`;
    $('sch-start').innerHTML = timeOptions(s.StartTime); $('sch-end').innerHTML = timeOptions(s.EndTime);
    $('sch-mode').value = mode; $('sch-id').value = s.ScheduleID || ''; $('sch-date').value = s.Date || ''; configureNote('sch-note', s, state.schedule, mode); calcDuration(); openModal('schedule-modal');
}
function calcDuration() { const d = D.duration($('sch-start').value, $('sch-end').value); $('sch-duration').value = Number.isFinite(d) ? num(d) : ''; }
async function save(action, payload, key, modal, loadingId) {
    if (!canWrite()) return; busy = true; updateButtons(); $(loadingId).style.display = 'inline-block';
    try {
        const result = await request(action, payload, true); if (!Array.isArray(result.data)) throw new Error('ยังยืนยันผลบันทึกไม่ได้ กรุณาโหลดข้อมูลใหม่ก่อนบันทึกซ้ำ');
        state[key] = D.normalize(key, result.data); ready[key] = true; delete errors[key]; busy = false; closeModal(modal); renderAll(); statusMessage('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
    } catch (error) { alert(error.message); } finally { busy = false; $(loadingId).style.display = 'none'; updateButtons(); }
}
function submitStudent() {
    const p = { StudentID: $('stu-id').value || null, StudentName: $('stu-name').value.trim(), Nickname: $('stu-nickname').value.trim(), ParentName: $('stu-parent').value.trim(), Phone: $('stu-phone').value.trim(), Active: $('stu-active').value === 'true', Note: $('stu-note').value.trim() };
    if (!p.StudentName) return alert('กรุณากรอกชื่อ-นามสกุล'); return save('saveStudent', p, 'students', 'student-modal', 'stu-loading');
}
async function submitEnrollment() {
    if (!canWrite()) return;
    const p = { EnrollmentID: $('enr-mode').value === 'edit' ? $('enr-id').value : null, StudentID: $('enr-student').value, Course: $('enr-course').value, Level: $('enr-level').value, EnrollmentStatus: $('enr-status').value, PaymentStatus: $('enr-payment').value, Note: $('enr-note').value.trim() };
    if (!p.StudentID || !p.Course || !p.Level) return alert('กรุณาเลือกนักเรียน หลักสูตร และระดับให้ครบ');
    if (p.EnrollmentID) return save('saveEnrollment', p, 'enrollments', 'enrollment-modal', 'enr-loading');
    p.SessionCount = Number($('enr-session-count').value); p.Sessions = readEnrollmentSessions(); p.requestId = enrollmentRequestId;
    if (p.SessionCount < 1 || p.SessionCount > 15 || p.Sessions.length !== p.SessionCount) return alert('กรุณาเลือกจำนวน Session ตั้งแต่ 1–15');
    const invalid = p.Sessions.findIndex(s => !D.date(s.Date) || !s.StartTime || !s.EndTime || D.duration(s.StartTime, s.EndTime) <= 0);
    if (invalid >= 0) return alert(`กรุณาตรวจวันและเวลาของ Session ${invalid + 1} ให้ครบ เวลาจบต้องมากกว่าเวลาเริ่ม`);
    busy = true; updateButtons(); $('enr-loading').style.display = 'inline-block';
    try {
        for (let attempt = 0; attempt < 5; attempt++) {
            const r = await request('saveEnrollment', p, true);
            if (r.code === 'CONFLICT') { if (!await confirmRoom(r.conflicts)) return; p.conflictVersion = r.conflictVersion; continue; }
            if (r.code === 'HOLIDAY') { if (!confirm(`มี Session ตรงกับวันหยุด: ${r.reason}\nยืนยันนัดเรียนในวันหยุดนี้หรือไม่?`)) return; p.holidayVersion = r.holidayVersion; continue; }
            if (!Array.isArray(r.data) || !Array.isArray(r.schedule)) throw new Error('ยังยืนยันผลบันทึกไม่ได้ กรุณาโหลดข้อมูลใหม่ก่อนบันทึกซ้ำ');
            state.enrollments = D.normalize('enrollments', r.data); state.schedule = D.normalize('schedule', r.schedule);
            ready.enrollments = ready.schedule = true; delete errors.enrollments; delete errors.schedule;
            busy = false; closeModal('enrollment-modal'); renderAll(); statusMessage(`ลงทะเบียนและบันทึก ${p.SessionCount} Session เรียบร้อยแล้ว`, 'success'); return;
        }
        throw new Error('ตารางมีการเปลี่ยนแปลงหลายครั้ง กรุณาโหลดข้อมูลใหม่');
    } catch (error) { alert(error.message); } finally { busy = false; $('enr-loading').style.display = 'none'; updateButtons(); }
}
function submitHoliday() {
    const p = { Date: $('hol-date').value, Reason: $('hol-reason').value.trim(), Type: $('hol-type').value, Active: $('hol-active').value === 'true' };
    if (!p.Date || !p.Reason) return alert('กรุณาระบุวันที่และเหตุผลการหยุด'); return save('saveHoliday', p, 'holidays', 'holiday-modal', 'hol-loading');
}
let resolveConflict = null;
function confirmRoom(conflicts) {
    $('conflict-list').replaceChildren(...conflicts.map(c => { const li = document.createElement('li'); li.textContent = `${c.Date ? `${dateText(c.Date)} · ` : ''}${c.StudentName} — ${c.Course} / ${c.Level} — ${c.StartTime}–${c.EndTime}`; return li; }));
    openModal('conflict-modal'); return new Promise(resolve => { resolveConflict = resolve; });
}
function finishConflict(confirmed) { $('conflict-modal').classList.remove('show'); if (resolveConflict) resolveConflict(confirmed); resolveConflict = null; }
async function submitSchedule() {
    if (!canWrite()) return;
    const p = { ScheduleID: $('sch-id').value || null, EnrollmentID: $('sch-enrollment-id').value, Date: $('sch-date').value, StartTime: $('sch-start').value, EndTime: $('sch-end').value, Note: $('sch-note').value.trim() };
    if (!p.EnrollmentID || !p.Date || !p.StartTime || !p.EndTime) return alert('กรุณาเลือกนักเรียน วันและเวลาให้ครบ'); if (D.duration(p.StartTime, p.EndTime) <= 0) return alert('เวลาจบต้องมากกว่าเวลาเริ่ม');
    busy = true; updateButtons(); $('sch-loading').style.display = 'inline-block';
    try {
        // Recheck the current server snapshot under a lock before every write.
        for (let attempt = 0; attempt < 5; attempt++) {
            const r = await request('saveSchedule', p, true);
            if (r.code === 'CONFLICT') { if (!await confirmRoom(r.conflicts)) return; p.conflictVersion = r.conflictVersion; continue; }
            if (r.code === 'HOLIDAY') { if (!confirm(`วันที่เลือกเป็นวันหยุด: ${r.reason}\nยืนยันจัดนัดเรียนในวันหยุดนี้หรือไม่?`)) return; p.holidayVersion = r.holidayVersion; continue; }
            if (!Array.isArray(r.data)) throw new Error('ยังยืนยันผลบันทึกไม่ได้ กรุณาโหลดข้อมูลใหม่ก่อนบันทึกซ้ำ');
            state.schedule = D.normalize('schedule', r.data); busy = false; closeModal('schedule-modal'); renderAll(); statusMessage('บันทึกนัดเรียนเรียบร้อยแล้ว', 'success'); return;
        }
        throw new Error('ตารางมีการเปลี่ยนแปลงหลายครั้ง กรุณาโหลดข้อมูลใหม่');
    } catch (error) { alert(error.message); } finally { busy = false; $('sch-loading').style.display = 'none'; updateButtons(); }
}
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', e => { e.preventDefault(); document.querySelectorAll('.nav-links a, .page-section').forEach(el => el.classList.remove('active')); link.classList.add('active'); $(link.dataset.target).classList.add('active'); $('sidebar').classList.remove('open'); }));
    $('menu-toggle').addEventListener('click', () => $('sidebar').classList.toggle('open')); $('search-student').addEventListener('input', renderStudents);
    scheduleSearch = BostonStudentSearch.create({
        input: $('search-schedule'), list: $('schedule-student-options'), status: $('schedule-search-status'),
        getItems: () => D.studentGroups(state).filter(group => group.enrollments.length).map(group => ({ id: group.student.StudentID, label: D.studentName(group.student) })),
        onQueryChange: () => { $('sch-select-student').value = ''; $('schedule-export-status').textContent = ''; updateScheduleEnrollmentDropdown(); renderScheduleView(); },
        onSelect: item => { updateScheduleEnrollmentDropdown(); $('sch-select-student').value = item.id; renderScheduleView(); }
    });
    $('refresh-data').addEventListener('click', () => modernAPI ? loadData() : initApp());
    $('calendar-prev').addEventListener('click', () => changeCalendarMonth(-1));
    $('calendar-next').addEventListener('click', () => changeCalendarMonth(1));
    $('calendar-today').addEventListener('click', () => { calendarMonth = D.today().slice(0, 7); renderCalendar(); });
    $('calendar-days').addEventListener('click', event => { const day = event.target.closest('[data-calendar-date]'); if (day) openCalendarDay(day.dataset.calendarDate); });
    $('calendar-day-list').addEventListener('click', event => { const button = event.target.closest('[data-calendar-edit]'); if (button) editCalendarSchedule(button.dataset.calendarEdit); });
    $('sch-enrollment-groups').addEventListener('click', event => {
        const exportButton = event.target.closest('[data-export-schedule]');
        if (exportButton) { downloadStudentSchedule(exportButton.dataset.exportSchedule); return; }
        const button = event.target.closest('[data-add-schedule]'); if (button) openScheduleModal('add', null, button.dataset.addSchedule);
    });
    $('confirm-room').addEventListener('click', () => finishConflict(true)); $('cancel-room').addEventListener('click', () => finishConflict(false));
    document.addEventListener('click', event => { const b = event.target.closest('[data-edit]'); if (b) ({ student: openStudentModal, enrollment: openEnrollmentModal, schedule: openScheduleModal, holiday: openHolidayModal })[b.dataset.edit]('edit', b.dataset.id); if (event.target.classList.contains('modal') && event.target.id !== 'conflict-modal') closeModal(event.target.id); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { if (resolveConflict) finishConflict(false); else document.querySelectorAll('.modal.show').forEach(m => closeModal(m.id)); }
        if (event.key === 'Tab') {
            const modal = resolveConflict ? $('conflict-modal') : document.querySelector('.modal.show');
            if (!modal) return;
            const controls = [...modal.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled])')];
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    });
    setInterval(() => { if (!loading && Object.keys(ready).length) { renderDashboard(); renderEnrollments(); renderScheduleView(); renderCalendar(); updateButtons(); } }, 30000);
    initApp();
});
