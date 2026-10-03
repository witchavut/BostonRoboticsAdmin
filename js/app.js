'use strict';
const API_URL = 'https://script.google.com/macros/s/AKfycbyE4ZEXNnTrqec6xnBRgabR3B28DZ3hbnxIrrzngv-547-eCRPthMg1Gy2BHhOHtaQ1ng/exec';
const D = BostonDomain, state = { students: [], courses: [], enrollments: [], schedule: [], holidays: [] };
const labels = { students: 'นักเรียน', courses: 'หลักสูตร', enrollments: 'ลงทะเบียนเรียน', schedule: 'ตารางเรียน', holidays: 'วันหยุด' };
let ready = {}, errors = {}, token = '', modernAPI = false, busy = false, loading = false;
let sessionGeneration = 0;
const activeRequests = new Set();
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = value => Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const student = id => state.students.find(s => s.StudentID === id);
const course = e => state.courses.find(c => c.Course === e.Course && c.Level === e.Level);
const nameOf = e => D.studentName(student(e?.StudentID));
const dateText = d => d ? d.split('-').reverse().join('/') : 'ตรวจสอบวันที่';
const hasData = (...keys) => keys.every(k => ready[k] && !errors[k]);
const canWrite = () => modernAPI && !!token && !busy && !loading && hasData(...Object.keys(labels));
function badge(text) {
    const color = ['ใช้งาน', 'ชำระแล้ว', 'กำลังเรียน', 'ครบเวลานัดแล้ว'].includes(text) ? 'success' : ['ระงับ', 'ยกเลิก'].includes(text) ? 'danger' : 'secondary';
    return `<span class="badge badge-${color}">${esc(text)}</span>`;
}
function editButton(kind, id) { return `<button class="btn btn-primary btn-sm" data-edit="${kind}" data-id="${esc(id)}">แก้ไข</button>`; }
function table(id, cols, rows, keys, empty = 'ยังไม่มีข้อมูล') {
    const failed = keys.filter(k => errors[k]);
    const message = failed.length ? `โหลด${failed.map(k => labels[k]).join(' / ')}ไม่สำเร็จ กรุณาโหลดข้อมูลใหม่` : keys.some(k => !ready[k]) ? loading ? 'กำลังโหลดข้อมูล…' : 'เข้าสู่ระบบเพื่อดูข้อมูล' : '';
    $(id).innerHTML = message || !rows ? `<tr><td colspan="${cols}" class="empty-state">${esc(message || empty)}</td></tr>` : rows;
}
function statusMessage(text, kind = 'info') { $('connection-status').textContent = text; $('connection-status').className = `connection-status ${kind}`; }
function updateButtons() {
    document.querySelectorAll('[data-write], [data-edit]').forEach(b => b.disabled = !canWrite());
    $('refresh-data').disabled = busy || loading; $('logout-button').disabled = busy;
}
async function request(action, payload, post = false) {
    const requestToken = token, generation = sessionGeneration;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
    activeRequests.add(controller);
    try {
        const options = { signal: controller.signal, cache: 'no-store', redirect: 'follow' };
        if (post) Object.assign(options, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, payload, token: requestToken }) });
        const response = await fetch(post ? API_URL : `${API_URL}?action=${encodeURIComponent(action)}`, options);
        if (!response.ok) throw new Error(`ติดต่อระบบไม่สำเร็จ (${response.status})`);
        const raw = await response.text(); let result;
        try { result = JSON.parse(raw); } catch { throw new Error('ไม่ได้รับข้อมูล JSON จาก Apps Script กรุณาตรวจสอบ URL และสิทธิ์เข้าถึง deployment'); }
        if (!result || typeof result !== 'object') throw new Error('รูปแบบข้อมูลจาก Apps Script ไม่ถูกต้อง');
        if (result.code === 'UNAUTHORIZED') {
            if (requestToken && generation === sessionGeneration && token === requestToken) {
                logout(false); statusMessage('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', 'error');
            }
            throw new Error('กรุณาเข้าสู่ระบบอีกครั้ง');
        }
        if (!result.success && !['CONFLICT', 'HOLIDAY'].includes(result.code)) throw new Error(result.message || 'ระบบไม่สามารถทำรายการได้');
        return result;
    } catch (error) {
        if (action.startsWith('save') && (error.name === 'AbortError' || error instanceof TypeError)) throw new Error('ยังยืนยันผลบันทึกไม่ได้ กรุณาโหลดข้อมูลใหม่ก่อนบันทึกซ้ำ');
        if (error.name === 'AbortError') throw new Error('การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่');
        throw error;
    } finally { clearTimeout(timer); activeRequests.delete(controller); }
}
async function initApp() {
    if (loading || busy) return;
    loading = true; updateButtons(); statusMessage('กำลังตรวจสอบการเชื่อมต่อ…');
    modernAPI = false; $('login-panel').hidden = true;
    try {
        const health = await request('getHealth'); modernAPI = health.version === '2.0';
        if (!modernAPI) throw new Error(health.version ? `Apps Script รุ่น ${health.version} ยังไม่รองรับ กรุณาใช้ Code.gs รุ่น 2.0 และ Deploy > New version` : 'ตรวจสอบรุ่น Apps Script ไม่สำเร็จ กรุณาตรวจสอบ URL และ deployment');
        $('login-panel').hidden = false;
        statusMessage(health.configured ? 'กรุณาเข้าสู่ระบบผู้ดูแล' : 'ต้องตั้งค่า ADMIN_PASSWORD ใน Apps Script ก่อนเข้าสู่ระบบ', health.configured ? 'info' : 'error');
    } catch (error) {
        modernAPI = false; statusMessage(`ตรวจสอบการเชื่อมต่อไม่สำเร็จ: ${error.message} • กดโหลดข้อมูลใหม่เพื่อลองอีกครั้ง`, 'error');
    } finally { loading = false; renderAll(); }
}
async function login(event) {
    event.preventDefault(); if (loading || busy || !modernAPI) return;
    loading = true; updateButtons(); $('login-button').disabled = true; $('login-error').textContent = '';
    try {
        const result = await request('login', { password: $('admin-password').value }, true);
        if (typeof result.token !== 'string' || !result.token) throw new Error('ไม่ได้รับเซสชันเข้าสู่ระบบ กรุณาลองใหม่');
        token = result.token; sessionGeneration++; $('admin-password').value = ''; $('login-panel').hidden = true; $('logout-button').hidden = false;
        loading = false; await loadData();
    } catch (error) { $('login-error').textContent = error.message; }
    finally { loading = false; $('login-button').disabled = false; updateButtons(); }
}
function logout(send = true) {
    if (busy && send) return;
    sessionGeneration++; activeRequests.forEach(controller => controller.abort());
    if (send && token) request('logout', {}, true).catch(() => {});
    token = ''; loading = false; Object.keys(state).forEach(k => state[k] = []); ready = {}; errors = {};
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    $('login-panel').hidden = !modernAPI; $('logout-button').hidden = true; statusMessage('ออกจากระบบแล้ว'); renderAll();
}
async function loadData() {
    if (loading || busy || !modernAPI || !token) return;
    loading = true; errors = {}; ready = {}; renderAll(); statusMessage('กำลังโหลดข้อมูล…');
    const generation = sessionGeneration;
    // Avoid starting five Apps Script executions at once on a cold deployment.
    for (const key of Object.keys(state)) {
        try {
            const result = await request('get' + key[0].toUpperCase() + key.slice(1), {}, true);
            if (generation !== sessionGeneration) return;
            if (!Array.isArray(result.data)) throw new Error('รูปแบบข้อมูลไม่ถูกต้อง');
            state[key] = D.normalize(key, result.data); ready[key] = true;
        } catch (error) {
            if (generation !== sessionGeneration) return;
            errors[key] = error.message; state[key] = [];
        }
    }
    loading = false; const failed = Object.keys(errors);
    const detail = failed.map(k => `${labels[k]}: ${errors[k]}`).join(' • ');
    statusMessage(detail || 'เชื่อมต่อแล้ว • คำนวณชั่วโมงตามเวลาไทย', failed.length ? 'error' : 'success');
    renderAll();
}
function scheduleStatus(s) { return !s.Date || !s.EndTime ? 'ตรวจสอบวันเวลา' : D.completed(s) ? 'ครบเวลานัดแล้ว' : 'ยังไม่ครบเวลานัด'; }
function renderDashboard() {
    $('dash-total-students').textContent = hasData('students') ? `${state.students.length} คน` : '—';
    for (const [id, status] of [['dash-active-students', 'กำลังเรียน'], ['dash-trial-students', 'ทดลองเรียน']]) $(id).textContent = hasData('enrollments') ? `${new Set(state.enrollments.filter(e => e.EnrollmentStatus === status).map(e => e.StudentID)).size} คน` : '—';
    $('dash-unpaid').textContent = hasData('enrollments') ? `${state.enrollments.filter(e => ['ยังไม่ชำระ', 'ชำระบางส่วน'].includes(e.PaymentStatus)).length} รายการ` : '—';
    const sessions = state.schedule.filter(s => s.Date === D.today()).sort((a, b) => a.StartTime.localeCompare(b.StartTime));
    $('dash-today-classes').textContent = hasData('schedule') ? `${sessions.length} นัด` : '—';
    table('today-schedule-tbody', 4, sessions.map(s => { const e = state.enrollments.find(e => e.EnrollmentID === s.EnrollmentID); return `<tr><td>${esc(s.StartTime)}–${esc(s.EndTime)}</td><td>${esc(nameOf(e))}</td><td>${esc(e ? `${e.Course} / ${e.Level}` : 'ไม่พบหลักสูตร')}</td><td>${badge(scheduleStatus(s))}</td></tr>`; }).join(''), ['students', 'enrollments', 'schedule'], 'วันนี้ไม่มีนัดเรียน');
}
function renderStudents() {
    const q = $('search-student').value.toLowerCase().trim();
    table('students-tbody', 6, state.students.filter(s => [s.StudentName, s.Nickname, s.ParentName, s.Phone].some(v => String(v).toLowerCase().includes(q))).map(s => `<tr><td>${esc(s.StudentName)}</td><td>${esc(s.Nickname)}</td><td>${esc(s.ParentName)}</td><td>${esc(s.Phone)}</td><td>${badge(s.Active ? 'ใช้งาน' : 'ระงับ')}</td><td>${editButton('student', s.StudentID)}</td></tr>`).join(''), ['students']); updateButtons();
}
function renderEnrollments() {
    table('enrollments-tbody', 7, state.enrollments.map(e => {
        const c = course(e), total = Number(c?.TotalHours || 0), p = D.progress(state.schedule.filter(s => s.EnrollmentID === e.EnrollmentID), total);
        const progress = hasData('schedule') ? `${num(p.used)} / ${num(total)} ชม.<br><small>เหลือ ${num(p.remaining)} ชม. • ${p.percent}%</small>` : 'รอข้อมูลตารางเรียน';
        return `<tr><td>${esc(nameOf(e))}<small class="subtext">${esc(dateText(e.EnrollDate))}</small></td><td>${esc(e.Course)}</td><td>${esc(e.Level)}</td><td>${badge(e.EnrollmentStatus)}</td><td>${badge(e.PaymentStatus)}</td><td>${progress}</td><td>${editButton('enrollment', e.EnrollmentID)}</td></tr>`;
    }).join(''), ['students', 'courses', 'enrollments']);
}
function renderCourses() { table('courses-tbody', 5, state.courses.map(c => `<tr><td>${esc(c.Course)}</td><td>${esc(c.Level)}</td><td>${num(c.TotalHours)} ชม.</td><td>${num(c.SessionCount)} ครั้ง</td><td>${badge(c.Active ? 'ใช้งาน' : 'ระงับ')}</td></tr>`).join(''), ['courses']); }
function renderHolidays() { table('holidays-tbody', 5, [...state.holidays].sort((a, b) => a.Date.localeCompare(b.Date)).map(h => `<tr><td>${esc(dateText(h.Date))}</td><td>${esc(h.Reason)}</td><td>${esc(h.Type)}</td><td>${badge(h.Active ? 'ใช้งาน' : 'ระงับ')}</td><td>${editButton('holiday', h.Date)}</td></tr>`).join(''), ['holidays']); }
function updateScheduleEnrollmentDropdown() {
    const select = $('sch-select-enrollment'), previous = select.value, q = $('search-schedule').value.trim().toLowerCase();
    select.replaceChildren(new Option('-- เลือกนักเรียนและหลักสูตร --', ''));
    state.enrollments.filter(e => `${nameOf(e)} ${e.Course} ${e.Level}`.toLowerCase().includes(q)).forEach(e => select.add(new Option(`${nameOf(e)} — ${e.Course} / ${e.Level} (${e.EnrollmentStatus}, ลงทะเบียน ${dateText(e.EnrollDate)})`, e.EnrollmentID)));
    select.value = previous; if (select.selectedIndex < 0) select.value = '';
}
function renderScheduleView() {
    const e = state.enrollments.find(e => e.EnrollmentID === $('sch-select-enrollment').value); $('sch-management-container').style.display = e ? 'block' : 'none'; if (!e) return;
    const c = course(e), total = Number(c?.TotalHours || 0), sessions = state.schedule.filter(s => s.EnrollmentID === e.EnrollmentID).sort((a, b) => `${a.Date} ${a.StartTime}`.localeCompare(`${b.Date} ${b.StartTime}`)), p = D.progress(sessions, total);
    $('sch-info-total').textContent = `${num(total)} ชม.`; $('sch-info-completed').textContent = hasData('schedule') ? `${num(p.used)} / ${num(total)} ชม.` : '—'; $('sch-info-remaining').textContent = hasData('schedule') ? `${num(p.remaining)} ชม.` : '—'; $('sch-info-session').textContent = hasData('schedule') ? `${sessions.length} / ${num(c?.SessionCount)} ครั้ง` : '—';
    table('schedule-tbody', 7, sessions.map((s, i) => `<tr><td>ครั้งที่ ${i + 1}</td><td>${esc(dateText(s.Date))}</td><td>${esc(s.StartTime)}–${esc(s.EndTime)}</td><td>${num(s.Duration)} ชม.</td><td>${badge(scheduleStatus(s))}</td><td>${esc(s.Note)}</td><td>${editButton('schedule', s.ScheduleID)}</td></tr>`).join(''), ['schedule']); updateButtons();
}
function renderAll() { renderStudents(); renderCourses(); renderEnrollments(); renderHolidays(); updateScheduleEnrollmentDropdown(); renderScheduleView(); renderDashboard(); updateButtons(); }
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
    $('enr-student').replaceChildren(...state.students.filter(s => s.Active || s.StudentID === e.StudentID).map(s => new Option(D.studentName(s), s.StudentID)));
    $('enr-course').replaceChildren(...[...new Set(state.courses.filter(c => c.Active || c.Course === e.Course).map(c => c.Course))].map(c => new Option(c, c)));
    if (e.StudentID) $('enr-student').value = e.StudentID; if (e.Course) $('enr-course').value = e.Course; updateLevelDropdown(e.Level);
    $('enr-status').value = e.EnrollmentStatus || 'กำลังเรียน'; $('enr-payment').value = e.PaymentStatus || 'ยังไม่ชำระ'; $('enr-note').value = e.Note || ''; openModal('enrollment-modal');
}
function updateLevelDropdown(selected) { $('enr-level').replaceChildren(...state.courses.filter(c => c.Course === $('enr-course').value && (c.Active || c.Level === selected)).map(c => new Option(c.Level, c.Level))); if (selected) $('enr-level').value = selected; }
function openHolidayModal(mode, date) {
    if (!canWrite()) return; const h = mode === 'edit' ? state.holidays.find(h => h.Date === date) : {}; if (!h) return;
    $('hol-mode').value = mode; $('hol-date').value = h.Date || ''; $('hol-date').disabled = mode === 'edit'; $('hol-reason').value = h.Reason || ''; $('hol-type').value = h.Type || 'งดสอนพิเศษ'; $('hol-active').value = String(h.Active ?? true); openModal('holiday-modal');
}
function openScheduleModal(mode, id) {
    if (!canWrite() || !$('sch-select-enrollment').value) return; const s = mode === 'edit' ? state.schedule.find(s => s.ScheduleID === id) : {}; if (!s) return;
    $('sch-mode').value = mode; $('sch-id').value = s.ScheduleID || ''; $('sch-date').value = s.Date || ''; $('sch-start').value = s.StartTime || ''; $('sch-end').value = s.EndTime || ''; $('sch-note').value = s.Note || ''; calcDuration(); openModal('schedule-modal');
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
function submitEnrollment() {
    const p = { EnrollmentID: $('enr-mode').value === 'edit' ? $('enr-id').value : null, StudentID: $('enr-student').value, Course: $('enr-course').value, Level: $('enr-level').value, EnrollmentStatus: $('enr-status').value, PaymentStatus: $('enr-payment').value, Note: $('enr-note').value.trim() };
    if (!p.StudentID || !p.Course || !p.Level) return alert('กรุณาเลือกนักเรียน หลักสูตร และระดับให้ครบ'); return save('saveEnrollment', p, 'enrollments', 'enrollment-modal', 'enr-loading');
}
function submitHoliday() {
    const p = { Date: $('hol-date').value, Reason: $('hol-reason').value.trim(), Type: $('hol-type').value, Active: $('hol-active').value === 'true' };
    if (!p.Date || !p.Reason) return alert('กรุณาระบุวันที่และเหตุผลการหยุด'); return save('saveHoliday', p, 'holidays', 'holiday-modal', 'hol-loading');
}
let resolveConflict = null;
function confirmRoom(conflicts) {
    $('conflict-list').replaceChildren(...conflicts.map(c => { const li = document.createElement('li'); li.textContent = `${c.StudentName} — ${c.Course} / ${c.Level} — ${c.StartTime}–${c.EndTime}`; return li; }));
    openModal('conflict-modal'); return new Promise(resolve => { resolveConflict = resolve; });
}
function finishConflict(confirmed) { $('conflict-modal').classList.remove('show'); if (resolveConflict) resolveConflict(confirmed); resolveConflict = null; }
async function submitSchedule() {
    if (!canWrite()) return;
    const p = { ScheduleID: $('sch-id').value || null, EnrollmentID: $('sch-select-enrollment').value, Date: $('sch-date').value, StartTime: $('sch-start').value, EndTime: $('sch-end').value, Note: $('sch-note').value.trim() };
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
    $('search-schedule').addEventListener('input', () => { updateScheduleEnrollmentDropdown(); renderScheduleView(); });
    $('refresh-data').addEventListener('click', () => modernAPI ? loadData() : initApp()); $('login-form').addEventListener('submit', login); $('logout-button').addEventListener('click', () => logout());
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
    setInterval(() => { if (!loading && Object.keys(ready).length) { renderDashboard(); renderEnrollments(); renderScheduleView(); updateButtons(); } }, 30000);
    initApp();
});
