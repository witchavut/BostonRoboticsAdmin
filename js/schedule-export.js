(function (root) {
    'use strict';
    const D = root.BostonDomain || (typeof module !== 'undefined' && module.exports ? require('./domain.js') : null);
    const WIDTH = 390, SCALE = 3, PAD = 22, INNER = WIDTH - PAD * 2;
    const FONT = '"Kanit", "Tahoma", sans-serif';
    const FONT_REDUCTION = 4 * 96 / 72; // Four typographic points in logical canvas pixels.
    const COLORS = { ink: '#16314e', muted: '#50647a', blue: '#1976b9', border: '#dbe5ed', green: '#147854', greenBg: '#e3f4ec', pending: '#936000', pendingBg: '#fff1ce' };
    const clean = value => String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
    const numberText = value => new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(value);

    function thaiDate(value) {
        const date = D.date(value);
        if (!date) return { weekday: 'ยังไม่ระบุวันเรียน', date: '', full: 'ยังไม่ระบุวันเรียน' };
        const day = new Date(date + 'T12:00:00+07:00');
        const weekday = new Intl.DateTimeFormat('th-TH', { weekday: 'long', timeZone: 'Asia/Bangkok' }).format(day);
        const dateText = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(day);
        return { weekday, date: dateText, full: weekday + ' ' + dateText };
    }
    function buildModel({ student = {}, enrollment = {}, course = {}, progress = {}, now = new Date() } = {}) {
        if (!D) throw new Error('ไม่พบข้อมูลสำหรับสร้างภาพตารางเรียน');
        const instant = now instanceof Date ? now : new Date(now);
        if (!Number.isFinite(instant.getTime())) throw new Error('วันที่อ้างอิงไม่ถูกต้อง');
        const target = positive(progress.target) || D.sessionTarget(enrollment, [course]);
        const sessions = (Array.isArray(progress.sessions) ? progress.sessions : [])
            .filter(s => s && (!s.EnrollmentID || !enrollment.EnrollmentID || s.EnrollmentID === enrollment.EnrollmentID))
            .slice().sort((a, b) => (D.sessionNumber(a) ?? Infinity) - (D.sessionNumber(b) ?? Infinity)
                || D.date(a.Date).localeCompare(D.date(b.Date)) || D.time(a.StartTime).localeCompare(D.time(b.StartTime)))
            .map(s => {
                const date = thaiDate(s.Date), start = D.time(s.StartTime), end = D.time(s.EndTime);
                const booked = !!D.date(s.Date) && !!start && !!end && D.duration(start, end) > 0;
                const done = booked && D.completed(s, instant), sequence = D.sessionNumber(s);
                return { sessionLabel: sequence ? 'Session ' + sequence : 'ไม่ระบุครั้ง', sequence, date: date.full, weekday: date.weekday,
                    calendarDate: date.date, time: booked ? `${start}–${end} น.` : 'ยังไม่ระบุเวลาเรียน', booked, completed: done,
                    status: done ? 'เรียนแล้ว' : booked ? 'รอเรียน' : 'รอนัดเวลา' };
            });
        const completed = sessions.filter(s => s.completed).length, scheduled = sessions.filter(s => s.booked).length;
        const fullName = clean(student.StudentName), nickname = clean(student.Nickname);
        const studentName = nickname || fullName || 'ไม่ระบุชื่อนักเรียน';
        const courseName = clean(enrollment.Course || course.Course) || 'ไม่ระบุหลักสูตร', level = clean(enrollment.Level || course.Level) || 'ไม่ระบุ Level';
        const totalHours = Number(course.TotalHours), unbooked = Math.max(0, target - scheduled);
        return { studentName, fullName: fullName && fullName !== studentName ? fullName : '', courseName, level,
            hoursLabel: Number.isFinite(totalHours) && totalHours > 0 ? numberText(totalHours) + ' ชั่วโมง' : 'ยังไม่ระบุชั่วโมงรวม',
            target, completed, scheduled, unbooked, remaining: Math.max(0, target - completed),
            percent: target ? Math.min(100, Math.round(completed / target * 100)) : 0,
            progressLabel: target ? `เรียนแล้ว ${completed} / ${target} Session` : `เรียนแล้ว ${completed} Session`,
            emptyMessage: target ? 'ยังไม่ได้กำหนดวันและเวลาเรียน' : 'ยังไม่มีข้อมูล Session ของหลักสูตรนี้',
            sessions, updated: thaiDate(D.today(instant)).date,
            filename: filename(studentName, courseName, level) };
    }
    function filename(student, course, level) {
        const safe = ['ตารางเรียน', student, course, level].map(clean).join('_').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
            .replace(/\s+/g, '_').replace(/_+/g, '_').replace(/[. _]+$/g, '');
        // Keep the suffix and avoid filesystem component limits, including multibyte Thai names.
        const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
        let result = safe;
        while (result && (encoder ? encoder.encode(result + '.png').length > 230 : result.length > 90)) result = Array.from(result).slice(0, -1).join('');
        return (result || 'ตารางเรียน') + '.png';
    }
    function graphemes(value) {
        if (typeof Intl.Segmenter === 'function') return [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(value)].map(s => s.segment);
        const parts = [];
        for (const character of Array.from(value)) {
            if (parts.length && /[\p{Mark}\u200d\ufe0e\ufe0f]/u.test(character)) parts[parts.length - 1] += character;
            else parts.push(character);
        }
        return parts;
    }
    function wrapText(value, maxWidth, measure) {
        if (!(maxWidth > 0) || typeof measure !== 'function') throw new Error('ความกว้างสำหรับจัดข้อความไม่ถูกต้อง');
        const result = [], segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
        String(value == null ? '' : value).replace(/\r\n?/g, '\n').split('\n').forEach(paragraph => {
            const tokens = segmenter ? [...segmenter.segment(paragraph)].map(s => s.segment) : paragraph.split(/(\s+)/);
            let line = '';
            tokens.forEach(token => {
                if (!line) token = token.trimStart();
                if (!token) return;
                if (measure(line + token) <= maxWidth) { line += token; return; }
                if (line.trim()) { result.push(line.trimEnd()); line = ''; }
                token = token.trimStart();
                if (measure(token) <= maxWidth) { line = token; return; }
                graphemes(token).forEach(character => {
                    if (line && measure(line + character) > maxWidth) { result.push(line.trimEnd()); line = ''; }
                    line += character;
                });
            });
            if (line.trim() || !paragraph) result.push(line.trimEnd());
        });
        return result.length ? result : [''];
    }
    function font(ctx, size, weight = 400) { ctx.font = `${weight} ${size - FONT_REDUCTION}px ${FONT}`; }
    function textLines(ctx, value, width, size, weight = 400) {
        font(ctx, size, weight); return wrapText(value, width, text => ctx.measureText(text).width);
    }
    function rounded(ctx, x, y, width, height, radius, fill, stroke) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    }
    function drawText(ctx, lines, x, y, size, weight = 400, color = COLORS.ink, lineHeight = size * 1.45, align = 'center') {
        font(ctx, size, weight); ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.textAlign = align;
        lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
        return y + lines.length * lineHeight;
    }
    async function loadLogo(url) {
        return new Promise((resolve, reject) => {
            const logo = new Image(); logo.crossOrigin = 'anonymous';
            logo.onload = () => logo.naturalWidth && logo.naturalHeight ? resolve(logo) : reject(new Error('ไฟล์โลโก้ไม่มีภาพ'));
            logo.onerror = () => reject(new Error('โหลดโลโก้ไม่สำเร็จ กรุณาลองใหม่'));
            logo.src = url;
        });
    }
    async function render(options = {}) {
        if (typeof document === 'undefined') throw new Error('สร้างภาพตารางเรียนได้ในเบราว์เซอร์เท่านั้น');
        const model = buildModel(options);
        if (document.fonts) {
            try {
                await Promise.all([400, 500, 600].map(weight => document.fonts.load(`${weight} 18px "Kanit"`, 'ตารางเรียนนักเรียน Session')));
                await document.fonts.ready;
            } catch (_) { /* Native Thai font fallback remains readable if the web font is offline. */ }
        }
        const logo = await loadLogo(options.logoUrl || 'assets/boston-logo.png');
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการสร้างภาพตารางเรียน');
        const nameLines = textLines(ctx, model.studentName, INNER - 36, 26, 600);
        const identityColumnWidth = (INNER - 48) / 2;
        const courseLines = textLines(ctx, model.courseName, identityColumnWidth, 20, 500);
        const levelLines = textLines(ctx, model.level + ' · ' + (model.hoursLabel.startsWith('ยัง') ? model.hoursLabel : 'รวม ' + model.hoursLabel), identityColumnWidth, 16);
        const identityRowHeight = Math.max(courseLines.length * 24, levelLines.length * 20);
        const identityHeight = 14 + nameLines.length * 34 + 14 + identityRowHeight + 14;
        const rowLeft = PAD + 14, dateWidth = 134, timeWidth = 104, timeCenter = rowLeft + dateWidth + 8 + timeWidth / 2;
        const statusCenter = WIDTH - PAD - 14 - 32;
        const cards = model.sessions.map(session => ({ session,
            dateLines: textLines(ctx, session.date, dateWidth, 17, 500),
            timeLines: textLines(ctx, session.time, timeWidth, session.booked ? 20 : 17, 500)
        }));
        cards.forEach(card => { card.height = Math.max(64, 28 + Math.max(card.dateLines.length * 17, card.timeLines.length * 20) + 12); });
        const remainingLines = textLines(ctx, model.target ? `คงเหลือ ${model.remaining} Session` : 'ยังไม่ระบุจำนวน Session ทั้งหมด', 116, 16);
        const progressLines = textLines(ctx, model.progressLabel, INNER - 36 - 116 - 12, 20, 500);
        const noteLines = model.unbooked ? textLines(ctx, `ยังไม่ได้นัดวันและเวลาอีก ${model.unbooked} Session`, INNER - 36, 17, 500) : [];
        const emptyLines = !cards.length ? textLines(ctx, model.emptyMessage, INNER - 36, 18, 500) : [];
        const noteHeight = noteLines.length ? 20 + noteLines.length * 24 : 0;
        const emptyHeight = emptyLines.length ? 28 + emptyLines.length * 25 : 0;
        const progressRowHeight = Math.max(remainingLines.length, progressLines.length) * 20;
        const headerHeight = 110, progressHeight = Math.max(90, 25 + progressRowHeight + 12 + 7 + 22), titleHeight = 38, footerHeight = 60;
        const height = headerHeight + identityHeight + 10 + progressHeight + titleHeight + cards.reduce((sum, c) => sum + c.height + 7, 0)
            + emptyHeight + (noteHeight ? noteHeight + 7 : 0) + footerHeight;
        canvas.width = WIDTH * SCALE; canvas.height = Math.ceil(height) * SCALE;
        canvas.style.width = WIDTH + 'px'; canvas.style.maxWidth = '100%'; canvas.style.height = 'auto';
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `ตารางเรียน ${model.studentName} ${model.courseName} ${model.level}`);
        ctx.scale(SCALE, SCALE); ctx.fillStyle = '#f1f6fa'; ctx.fillRect(0, 0, WIDTH, height);
        ctx.fillStyle = COLORS.blue; ctx.fillRect(0, 0, WIDTH, 7);
        const logoScale = Math.min(300 / logo.naturalWidth, 66 / logo.naturalHeight);
        ctx.drawImage(logo, (WIDTH - logo.naturalWidth * logoScale) / 2, 12 + (66 - logo.naturalHeight * logoScale) / 2, logo.naturalWidth * logoScale, logo.naturalHeight * logoScale);
        drawText(ctx, ['ตารางเรียนรายบุคคล'], WIDTH / 2, 83, 16, 400, COLORS.muted);
        let y = headerHeight;
        rounded(ctx, PAD, y, INNER, identityHeight, 20, '#ffffff', COLORS.border);
        let cursor = y + 14;
        cursor = drawText(ctx, nameLines, WIDTH / 2, cursor, 26, 600, COLORS.ink, 34);
        cursor += 6; ctx.strokeStyle = COLORS.border; ctx.beginPath(); ctx.moveTo(PAD + 18, cursor); ctx.lineTo(WIDTH - PAD - 18, cursor); ctx.stroke();
        drawText(ctx, courseLines, PAD + 18 + identityColumnWidth / 2, cursor + 8, 20, 500, COLORS.blue, 24);
        drawText(ctx, levelLines, WIDTH - PAD - 18 - identityColumnWidth / 2, cursor + 10, 16, 400, COLORS.muted, 20);
        y += identityHeight + 10;
        rounded(ctx, PAD, y, INNER, progressHeight, 20, COLORS.ink);
        drawText(ctx, remainingLines, PAD + 18, y + 27, 16, 400, '#edf7ff', 20, 'left');
        drawText(ctx, progressLines, WIDTH - PAD - 18, y + 25, 20, 500, '#ffffff', 20, 'right');
        rounded(ctx, PAD + 18, y + 25 + progressRowHeight + 7, INNER - 36, 7, 4, '#46617a');
        if (model.percent) rounded(ctx, PAD + 18, y + 25 + progressRowHeight + 7, (INNER - 36) * model.percent / 100, 7, 4, '#6dd1bd');
        y += progressHeight;
        drawText(ctx, ['วันและเวลาเรียน'], WIDTH / 2, y + 10, 19, 500); y += titleHeight;
        cards.forEach(({ session, dateLines, timeLines, height: cardHeight }) => {
            rounded(ctx, PAD, y, INNER, cardHeight, 18, '#ffffff', COLORS.border);
            drawText(ctx, [session.sessionLabel], rowLeft, y + 9, 16, 500, COLORS.blue, 18, 'left');
            drawText(ctx, dateLines, rowLeft, y + 28, 17, 500, COLORS.ink, 17, 'left');
            drawText(ctx, timeLines, timeCenter, y + 28, session.booked ? 20 : 17, 500, session.completed ? COLORS.muted : COLORS.ink, 20);
            font(ctx, 16, 500); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
            const metrics = ctx.measureText(session.status), badgeWidth = Math.max(60, metrics.width + 18);
            const badgeTop = y + 9, badgeHeight = 20;
            rounded(ctx, statusCenter - badgeWidth / 2, badgeTop, badgeWidth, badgeHeight, 10, session.completed ? COLORS.greenBg : COLORS.pendingBg);
            const ascent = metrics.actualBoundingBoxAscent ?? (16 - FONT_REDUCTION) * 0.8;
            const descent = metrics.actualBoundingBoxDescent ?? (16 - FONT_REDUCTION) * 0.2;
            ctx.fillStyle = session.completed ? COLORS.green : COLORS.pending;
            ctx.fillText(session.status, statusCenter, badgeTop + badgeHeight / 2 + (ascent - descent) / 2);
            y += cardHeight + 7;
        });
        if (emptyLines.length) {
            rounded(ctx, PAD, y, INNER, emptyHeight, 18, '#ffffff', COLORS.border);
            drawText(ctx, emptyLines, WIDTH / 2, y + 14, 18, 500, COLORS.muted, 25); y += emptyHeight;
        }
        if (noteLines.length) {
            rounded(ctx, PAD, y + 7, INNER, noteHeight, 16, '#fff1ce');
            drawText(ctx, noteLines, WIDTH / 2, y + 17, 17, 500, COLORS.pending, 24); y += noteHeight + 7;
        }
        drawText(ctx, ['ข้อมูล ณ ' + model.updated], WIDTH / 2, y + 12, 15, 400, COLORS.muted);
        drawText(ctx, ['สถานะเรียนแล้วอ้างอิงเวลาสิ้นสุดนัด'], WIDTH / 2, y + 34, 15, 400, COLORS.muted);
        canvas.exportFilename = model.filename;
        return canvas;
    }
    async function download(options = {}) {
        const canvas = await render(options);
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('สร้างไฟล์ภาพไม่สำเร็จ')), 'image/png'));
        const url = URL.createObjectURL(blob), anchor = document.createElement('a');
        anchor.href = url; anchor.download = canvas.exportFilename; anchor.style.display = 'none';
        document.body.appendChild(anchor);
        try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
        return { canvas, filename: canvas.exportFilename, width: canvas.width, height: canvas.height };
    }
    const api = { render, download, buildModel, wrapText, thaiDate, filename, WIDTH, SCALE };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BostonScheduleExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
