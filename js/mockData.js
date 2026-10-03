// จำลองข้อมูลจาก Google Sheets
const db = {
    students: [
        { StudentID: "STU001", StudentName: "ณัฐิวุฒิ กุศลาธรรม", Nickname: "บอส", ParentName: "คุณพ่อเอ", Phone: "0812345678", Active: true },
        { StudentID: "STU002", StudentName: "ศิริชัย แสนสุข", Nickname: "แพนเตอร์", ParentName: "คุณแม่บี", Phone: "0898765432", Active: true },
        { StudentID: "STU003", StudentName: "พงศกร ใจดี", Nickname: "กันต์", ParentName: "คุณพ่อซี", Phone: "0811112222", Active: false }
    ],
    courses: [
        { CourseID: "CRS001", Course: "JuniorBuilder", Level: "Lv1", TotalHours: 8, SessionCount: 4, ColorHex: "#F59E0B", Active: true },
        { CourseID: "CRS002", Course: "JuniorDeveloper", Level: "Lv1", TotalHours: 8, SessionCount: 4, ColorHex: "#3B82F6", Active: true },
        { CourseID: "CRS003", Course: "RobotCompetition", Level: "Competition", TotalHours: 20, SessionCount: 10, ColorHex: "#EF4444", Active: true }
    ],
    enrollments: [
        { EnrollmentID: "ENR001", StudentID: "STU001", Course: "JuniorDeveloper", Level: "Lv1", EnrollmentStatus: "กำลังเรียน", PaymentStatus: "ชำระแล้ว", EnrollDate: "2026-09-08" },
        { EnrollmentID: "ENR002", StudentID: "STU002", Course: "JuniorBuilder", Level: "Lv1", EnrollmentStatus: "ทดลองเรียน", PaymentStatus: "ยังไม่ชำระ", EnrollDate: "2026-10-01" },
        { EnrollmentID: "ENR003", StudentID: "STU001", Course: "JuniorBuilder", Level: "Lv1", EnrollmentStatus: "จบหลักสูตร", PaymentStatus: "ชำระแล้ว", EnrollDate: "2026-05-01" }
    ],
    schedule: [
        { ScheduleID: "SCH001", EnrollmentID: "ENR001", Date: "2026-10-03", StartTime: "10:00", EndTime: "12:00", Duration: 2, SessionNo: 1 },
        { ScheduleID: "SCH002", EnrollmentID: "ENR002", Date: "2026-10-03", StartTime: "13:00", EndTime: "15:00", Duration: 2, SessionNo: 1 },
        { ScheduleID: "SCH003", EnrollmentID: "ENR001", Date: "2026-10-10", StartTime: "10:00", EndTime: "12:00", Duration: 2, SessionNo: 2 }
    ],
    holidays: [
        { Date: "2026-10-23", Reason: "วันปิยมหาราช", Type: "วันหยุดราชการ", Active: true }
    ]
};