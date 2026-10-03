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
        return s.Nickname && s.Nickname !== s.StudentName ? `${s.Nickname} (${s.StudentName})` : s.StudentName || s.Nickname;
    }
    const api = { date, time, duration, bool, normalize, today, completed, overlaps, progress, studentName };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BostonDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
