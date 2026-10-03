// Synthetic data for visual checks only. Never used by the production page.
module.exports = function seedShowcase(backend) {
  const { data } = backend;
  data.Students.splice(1, data.Students.length - 1,
    ['STU001', 'ปุญญ์ นักเรียนตัวอย่าง', 'ปุญญ์', '', '', true, ''],
    ['STU002', 'ปันปัน นักเรียนตัวอย่าง', 'ปันปัน', '', '', true, ''],
    ['STU003', 'ปาล์ม นักเรียนตัวอย่าง', 'ปาล์ม', '', '', true, '']);
  data.Courses[2][3] = 30; data.Courses[2][4] = 15;
  data.Enrollments.splice(1, data.Enrollments.length - 1,
    ['ENR001', 'STU001', 'JuniorBuilder', 'Lv1', 'จบหลักสูตร', 'ชำระแล้ว', '2026-09-01', ''],
    ['ENR002', 'STU001', 'JuniorBuilder', 'Lv2', 'กำลังเรียน', 'ชำระแล้ว', '2026-10-01', ''],
    ['ENR003', 'STU002', 'JuniorBuilder', 'Lv2', 'กำลังเรียน', 'ชำระแล้ว', '2026-10-01', ''],
    ['ENR004', 'STU003', 'JuniorBuilder', 'Lv2', 'กำลังเรียน', 'ยังไม่ชำระ', '2026-10-01', '']);
  data.Schedule.splice(1);
  for (let i = 0; i < 4; i++) data.Schedule.push(['OLD' + i, 'ENR001', `2026-09-${String(5 + i * 7).padStart(2, '0')}`, '10:00', '12:00', 2, `Session ${i + 1}`, '']);
  for (let i = 0; i < 15; i++) {
    const date = new Date(Date.UTC(2026, 9, 3 + i * 7)).toISOString().slice(0, 10);
    for (let j = 2; j <= 4; j++) data.Schedule.push([`SCH${j}-${i}`, `ENR00${j}`, date, '10:00', '12:00', 2, `Session ${i + 1}`, '']);
  }
  data.Holidays.push(['2026-10-25', 'วันหยุดสถาบัน (ตัวอย่าง)', 'งดสอนพิเศษ', true]);
};
