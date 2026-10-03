(function (root) {
    'use strict';
    const keys = { students: 'StudentID', courses: 'CourseID', enrollments: 'EnrollmentID', schedule: 'ScheduleID', holidays: 'Date' };
    function date(value) {
        const s = String(value || '').trim();
        let y, m, d, match;
        if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/))) [, y, m, d] = match;
        else if ((match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [, d, m, y] = match;
        else return '';
        y = Number(y); m = Number(m); d = Number(d);
        if (y >= 2400) y -= 543;
        const check = new Date(Date.UTC(y, m - 1, d));
        return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d
            ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
    }
    function time(value) {
        const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        return match && +match[1] < 24 && +match[2] < 60 ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
    }
    function minutes(value) { const t = time(value); return t ? +t.slice(0, 2) * 60 + +t.slice(3) : NaN; }
    function duration(start, end) { return Math.max(0, (minutes(end) - minutes(start)) / 60); }
    function bool(value) { return value === true || String(value).trim().toUpperCase() === 'TRUE'; }
    function normalize(key, rows) {
        return rows.filter(row => String(row[keys[key]] || '').trim()).map(row => {
            const item = { ...row };
            Object.keys(item).forEach(k => { if (typeof item[k] === 'string') item[k] = item[k].trim(); });
            if ('Active' in item) item.Active = bool(item.Active);
            if ('Date' in item) item.Date = date(item.Date);
            if ('EnrollDate' in item) item.EnrollDate = date(item.EnrollDate);
            if (key === 'schedule') {
                item.StartTime = time(item.StartTime); item.EndTime = time(item.EndTime);
                item.Duration = duration(item.StartTime, item.EndTime);
            }
            return item;
        });
    }
    function today(now = new Date()) {
        const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
        const get = type => p.find(x => x.type === type).value;
        return `${get('year')}-${get('month')}-${get('day')}`;
    }
    function completed(s, now = new Date()) {
        const d = date(s.Date), t = time(s.EndTime);
        return !!d && !!t && now.getTime() >= new Date(`${d}T${t}:00+07:00`).getTime();
    }
    function overlaps(rows, candidate) {
        return rows.filter(s => s.ScheduleID !== candidate.ScheduleID && date(s.Date) === date(candidate.Date)
            && minutes(candidate.StartTime) < minutes(s.EndTime) && minutes(candidate.EndTime) > minutes(s.StartTime));
    }
    function progress(rows, total, now = new Date()) {
        const used = rows.filter(s => completed(s, now)).reduce((n, s) => n + (duration(s.StartTime, s.EndTime) || 0), 0);
        return { used, remaining: Math.max(0, Number(total) - used), percent: total > 0 ? Math.round(used / total * 100) : 0 };
    }
    function studentName(s) {
        if (!s) return 'ไม่พบชื่อนักเรียน';
        const full = String(s.StudentName || '').trim(), nick = String(s.Nickname || '').trim();
        return full && nick && nick !== full ? `${nick} (${full})` : full || nick || 'ไม่พบชื่อนักเรียน';
    }
    function textKey(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('th'); }
    function studentKey(student) {
        const name = textKey(student?.StudentName) || textKey(student?.Nickname);
        return name && name !== 'ไม่พบชื่อนักเรียน' ? name : '';
    }
    function positiveInteger(value) {
        const number = Number(value);
        return Number.isSafeInteger(number) && number > 0 ? number : null;
    }
    // Use the sheet's SessionNo rather than inferring a number from display order.
    function sessionNumber(schedule) {
        const value = String(schedule?.SessionNo ?? '').trim();
        const match = value.match(/^(?:(?:session\s*|ครั้งที่\s*)#?\s*)?(\d+)\s*$/i);
        return match ? positiveInteger(match[1]) : null;
    }
    function enrollmentCourse(enrollment, courses) {
        return (courses || []).find(c => textKey(c.Course) === textKey(enrollment?.Course) && textKey(c.Level) === textKey(enrollment?.Level));
    }
    function sessionTarget(enrollment, courses) {
        return positiveInteger(enrollment?.SessionCount) || positiveInteger(enrollmentCourse(enrollment, courses)?.SessionCount) || 0;
    }
    function validEnrollment(enrollment, state) {
        if (!enrollment || !textKey(enrollment.Course) || textKey(enrollment.Course) === 'ไม่พบหลักสูตร') return false;
        return !!studentKey((state.students || []).find(s => s.StudentID === enrollment.StudentID)) && !!enrollmentCourse(enrollment, state.courses);
    }
    function validSchedule(schedule, state) {
        const enrollment = (state.enrollments || []).find(e => e.EnrollmentID === schedule?.EnrollmentID);
        return validEnrollment(enrollment, state) && !!date(schedule?.Date)
            && !!time(schedule?.StartTime) && !!time(schedule?.EndTime) && minutes(schedule.EndTime) > minutes(schedule.StartTime);
    }
    function scheduleOrder(a, b) {
        return (sessionNumber(a) ?? Infinity) - (sessionNumber(b) ?? Infinity)
            || date(a.Date).localeCompare(date(b.Date)) || time(a.StartTime).localeCompare(time(b.StartTime));
    }
    function enrollmentProgress(enrollment, state, now = new Date()) {
        const sessions = (state.schedule || []).filter(s => s.EnrollmentID === enrollment?.EnrollmentID && validSchedule(s, state)).sort(scheduleOrder);
        const target = sessionTarget(enrollment, state.courses), done = sessions.filter(s => completed(s, now));
        const usedHours = done.reduce((sum, s) => sum + duration(s.StartTime, s.EndTime), 0);
        const totalHours = Number(enrollmentCourse(enrollment, state.courses)?.TotalHours) || 0;
        return {
            target, completed: done.length, remaining: Math.max(0, target - done.length), scheduled: sessions.length,
            upcoming: sessions.length - done.length, unbooked: Math.max(0, target - sessions.length),
            usedHours, remainingHours: Math.max(0, totalHours - usedHours), percent: target ? Math.min(100, Math.round(done.length / target * 100)) : 0,
            sessions
        };
    }
    function studentEnrollments(studentId, state) {
        const key = studentKey((state.students || []).find(s => s.StudentID === studentId));
        if (!key) return [];
        const ids = new Set((state.students || []).filter(s => studentKey(s) === key).map(s => s.StudentID));
        const level = e => Number(String(e.Level || '').match(/\d+/)?.[0] || 0);
        return (state.enrollments || []).filter(e => ids.has(e.StudentID)).slice().sort((a, b) =>
            String(a.Course || '').localeCompare(String(b.Course || ''), 'en', { sensitivity: 'base' })
            || level(a) - level(b) || date(a.EnrollDate).localeCompare(date(b.EnrollDate))
            || String(a.EnrollmentID || '').localeCompare(String(b.EnrollmentID || '')));
    }
    function studentGroups(state) {
        const groups = new Map();
        (state.students || []).forEach(student => {
            const key = studentKey(student);
            if (!key) return;
            if (!groups.has(key)) groups.set(key, { key, student, studentIds: [], enrollments: [] });
            groups.get(key).studentIds.push(student.StudentID);
        });
        return [...groups.values()].map(group => ({ ...group, enrollments: studentEnrollments(group.student.StudentID, state) }))
            .sort((a, b) => studentName(a.student).localeCompare(studentName(b.student), 'th'));
    }
    function studentStats(state, now = new Date()) {
        const students = new Map((state.students || []).map(s => [s.StudentID, studentKey(s)]));
        const enrollments = new Map((state.enrollments || []).map(e => [e.EnrollmentID, e]));
        const attended = new Set(), active = new Set(), trials = new Set(), byCourse = new Map();
        (state.schedule || []).forEach(s => {
            const key = students.get(enrollments.get(s.EnrollmentID)?.StudentID);
            // Historical attendance still counts if its old course was removed from the catalogue.
            if (key && duration(s.StartTime, s.EndTime) > 0 && completed(s, now)) attended.add(key);
        });
        (state.enrollments || []).forEach(e => {
            if (!validEnrollment(e, state)) return;
            const key = students.get(e.StudentID);
            if (e.EnrollmentStatus === 'ทดลองเรียน') trials.add(key);
            if (e.EnrollmentStatus !== 'กำลังเรียน' || enrollmentProgress(e, state, now).remaining === 0) return;
            active.add(key);
            const courseKey = textKey(e.Course);
            if (!byCourse.has(courseKey)) byCourse.set(courseKey, { course: e.Course, students: new Set() });
            byCourse.get(courseKey).students.add(key);
        });
        return { total: attended.size, active: active.size, trials: trials.size,
            activeByCourse: [...byCourse.values()].map(({ course, students: group }) => ({ course, count: group.size })).sort((a, b) => a.course.localeCompare(b.course)) };
    }
    function calendarDays(month) {
        const [year, index] = month.split('-').map(Number);
        const first = new Date(Date.UTC(year, index - 1, 1));
        const offset = (first.getUTCDay() + 6) % 7;
        return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(year, index - 1, 1 - offset + i)).toISOString().slice(0, 10));
    }
    const api = { date, time, duration, bool, normalize, today, completed, overlaps, progress, studentName, studentKey,
        sessionNumber, sessionTarget, validSchedule, enrollmentProgress, studentEnrollments, studentGroups, studentStats, calendarDays };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BostonDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
