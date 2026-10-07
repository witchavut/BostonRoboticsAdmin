const fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
function createBackend() {
  const schemas = {
    Students: ['StudentID','StudentName','Nickname','ParentName','Phone','Active','Note'],
    Courses: ['CourseID','Course','Level','TotalHours','SessionCount','ColorHex','Active'],
    Enrollments: ['EnrollmentID','StudentID','Course','Level','EnrollmentStatus','PaymentStatus','EnrollDate','Note'],
    Schedule: ['ScheduleID','EnrollmentID','Date','StartTime','EndTime','Duration','SessionNo','Note'],
    Holidays: ['Date','Reason','Type','Active'],
    Lists: ['EnrollmentStatus','PaymentStatus','SessionStatus','Attendance','TimeSlots','Levels']
  };
  const data = Object.fromEntries(Object.entries(schemas).map(([k,v])=>[k,[v]]));
  data.Students.push(['STU001','นักเรียนทดสอบ เอ','เอ','ผู้ปกครองตัวอย่าง','0000000000',true,'keep note'], ['STU002','นักเรียนทดสอบ บี','บี','','',true,'']);
  data.Courses.push(['C1','JuniorBuilder','Lv1',8,4,'#2563eb',true], ['C2','JuniorBuilder','Lv2',8,4,'#2563eb',true]);
  data.Enrollments.push(['ENR001','STU001','JuniorBuilder','Lv1','กำลังเรียน','ชำระแล้ว','09/08/2026','keep note'], ['ENR002','STU002','JuniorBuilder','Lv2','กำลังเรียน','ยังไม่ชำระ','2026-10-01','']);
  data.Schedule.push(['SCH001','ENR001','03/10/2026','10:00','12:00',2,'Session 1','']);
  for(let minutes=9*60;minutes<=21*60+30;minutes+=30) if(minutes!==12*60+30) data.Lists.push(['','','','',`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,'']);
  const formulas=Object.fromEntries(Object.keys(schemas).map(name=>[name,new Map()]));
  const props = new Map([['ADMIN_PASSWORD','test-only-password-123']]), cache = new Map(); let writes=0, locked=false, failure=null;
  const formatErrors = new Map();
  const sheets=Object.fromEntries(Object.keys(data).map(name=>{
    const sheet={ getLastColumn:()=>data[name][0].length, getLastRow:()=>data[name].length, getMaxRows:()=>1000, insertRowsAfter:()=>{}, getMaxColumns:()=>26,insertColumnsAfter:()=>{},
      getRange:(r,c,n=1,m=1)=>{
        const range={getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[name][r+i-1]?.[c+j-1]??'')), getDisplayValues:()=>range.getValues().map(row=>row.map(v=>v===true?'TRUE':v===false?'FALSE':String(v))), setNumberFormat:()=>{const error=formatErrors.get(`${name}:${c}`);if(error)throw new Error(error);return range;},
          getFormulas:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>formulas[name].get(`${r+i},${c+j}`)||'')),
          setValues:values=>{if(failure&&failure({name,row:r,column:c,values,writes})){failure=null;throw new Error('Injected sheet write failure');}writes++; values.forEach((row,i)=>{ data[name][r+i-1] ||= []; row.forEach((v,j)=>{data[name][r+i-1][c+j-1]=v;formulas[name].delete(`${r+i},${c+j}`);}); }); return range;}, setValue:v=>range.setValues([[v]])}; return range;
      }, getDataRange:()=>sheet.getRange(1,1,data[name].length,data[name][0].length)};
    return [name,sheet];
  }));
  const context=vm.createContext({Date, console, ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,getProperties:()=>Object.fromEntries(props),setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
    LockService:{getScriptLock:()=>({tryLock:()=>{assertUnlocked();locked=true;return true;},releaseLock:()=>locked=false})},
    SpreadsheetApp:{openById:()=>({getSheetByName:k=>sheets[k]}),flush:()=>{}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>crypto.createHash('sha256').update(value).digest(),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),formatDate:(d,tz,fmt)=>{
      const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
      return fmt==='HH:mm'?`${p.hour}:${p.minute}`:`${p.year}-${p.month}-${p.day}`;
    }}});
  function assertUnlocked(){if(locked)throw Error('nested lock');}
  vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context);
  const post=(action,payload={},token)=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({action,payload,token})}}).text);
  const setFormula=(name,row,col,formula,value='')=>{formulas[name].set(`${row},${col}`,formula);data[name][row-1]||=[];data[name][row-1][col-1]=value;};
  return {data,props,post,context,formulas,setFormula,formatErrors,failNextWrite:predicate=>failure=predicate,writes:()=>writes};
}
module.exports={createBackend};
