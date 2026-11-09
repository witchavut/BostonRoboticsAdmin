# BostonRoboticsAdmin — ไม่ต้องใช้รหัสผ่าน (ระบบการเงิน + ใบเสร็จ)

เตือนเรื่องความปลอดภัย: หาก Deploy แบบ Execute as me + Anyone ผู้ใดที่ทราบ Web app URL จะอ่านรายรับ/รายจ่าย ชื่อผู้เรียน และสร้างรายการหรือใบเสร็จได้ โดยไม่มีรหัสผ่าน ไม่เหมาะกับข้อมูลจริงที่เป็นความลับ ข้อมูล API URL ไม่ใช่ความลับ เพราะดูได้จากไฟล์ JavaScript สาธารณะ

ชุดนี้ใช้ฐานข้อมูลเดิม (ห้ามลบหรือสร้างชีตใหม่):
- RoboDB, แท็บ Transactions: 1OSrFdehq7o1IrASmkTcbtSylCo49erUyzn_xCAJnn9Q
- Receipt System Database, แท็บ Data1: 1t4tLaAS4sYRtVZ4podFh1OdSaqnqzAtJBVR7whetJ-Q

## ส่วนที่ 1: Google Apps Script (จำเป็น)

1. เข้า Google Apps Script โปรเจกต์ BostonFinance ที่ใช้งานอยู่ และสำรองไฟล์ Code.gs 1.1.0 ทั้งหมดไว้ก่อน (เก็บสำเนาหรือตั้งชื่อโปรเจกต์สำรอง)
2. เปิด Code.gs ในโปรเจกต์ BostonFinance แล้วแทนที่โค้ดทั้งหมดด้วยไฟล์ `apps-script/finance/Code.gs` ใน ZIP นี้ อย่าเพิ่มเป็นไฟล์ที่สอง เพราะจะมีชื่อฟังก์ชันซ้ำ
3. บันทึก ตรวจสอบจากเมนู Run ว่าโค้ดถูกบันทึกแล้ว โดยไม่ต้องกดทดสอบ saveReceipt กับข้อมูลจริง
4. กด Deploy > Manage deployments > เลือก Web app เดิม > Edit (รูปดินสอ) > Version: New version
5. เลือก Execute as: Me และ Who has access: Anyone (เปิดแบบไม่ต้องลงชื่อเข้าใช้) แล้วกด Deploy
6. URL /exec ควรยังเป็น: 
   https://script.google.com/macros/s/AKfycbxHbwHBTidtjtVIscPYz-OUDakw_YYWQtYCw3ptKaiYkk1MPZgVF9BiE5yfvXqFiTAC/exec
7. เปิด URL /exec ในแท็บส่วนตัว/ไม่ระบุตัวตน ต้องได้ JSON:
   {"success":true,"service":"boston-finance","version":"1.0","authMode":"none"}
   ถ้าขึ้นหน้า HTML/ไม่พบไฟล์/เข้าสู่ระบบ แสดงว่า deployment หรือสิทธิ์ยังไม่ตรง (ยังไม่ใช่ปัญหา GitHub)

* การแทนที่ Code.gs 1.1.0 จะเปลี่ยนหน้า BostonFinance เดิมที่มี login ให้เป็น JSON API สำหรับเมนู GitHub; จึงต้องสำรองโปรเจกต์เดิมก่อน
* ไม่ต้องรัน setupBostonFinance ของรุ่น 1.1 อีกครั้ง และไม่ต้องแก้ Google Sheets

## ส่วนที่ 2: GitHub (จำเป็น)

1. เข้า https://github.com/witchavut/BostonRoboticsAdmin
2. อัปโหลด `index.html` ใน ZIP นี้ทับไฟล์ root index.html เดิม
3. อัปโหลด `js/finance-config.js` ทับไฟล์ในโฟลเดอร์ js (อย่าอัปโหลดไว้ที่ root)
4. Commit changes แล้วเปิด https://witchavut.github.io/BostonRoboticsAdmin/?v=20261109-finance
5. เปิดเมนู รายงานการเงิน > โหลดข้อมูลล่าสุด แล้วเข้าเมนู ออกใบเสร็จ ตรวจรายการเก่าก่อน ไม่ควรบันทึกทดสอบโดยใช้ข้อมูลการเงินจริง
6. หากยังแสดง Failed to fetch ให้เปิด URL /exec ในข้อ 6 แล้วตรวจ Settings/Executions ใน Apps Script; อาจมีปัญหา Google Workspace หรือ CORS ซึ่งการเปลี่ยนไฟล์ GitHub อย่างเดียวแก้ไม่ได้

## ไฟล์ที่แก้
- `apps-script/finance/Code.gs`: API no-login ที่มี getFinance, saveTransaction, saveReceipt รองรับสองฐานเดิม
- `js/finance-config.js`: เปลี่ยน URL API เป็น Deployment ที่ผู้ใช้ให้มา
- `index.html`: บังคับโหลด finance-config รุ่นใหม่และล้าง URL การเงินเก่าเฉพาะเมื่อไม่ตรงค่าใหม่

ไม่ได้แก้ไฟล์ `js/app.js`, `js/finance.js`, `css/*` หรือฐานข้อมูลนักเรียน/ตารางเรียน
