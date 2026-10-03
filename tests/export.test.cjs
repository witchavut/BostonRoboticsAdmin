const { test } = require('node:test'), assert = require('node:assert/strict');
const E = require('../js/schedule-export.js');

function options(overrides={}) {
    return { student:{StudentName:'ปุญญ์ ทดสอบ',Nickname:'ปุญญ์',Phone:'private-phone',ParentName:'private-parent'},
        enrollment:{EnrollmentID:'E1',Course:'JuniorDeveloper',Level:'LV2',SessionCount:4,PaymentStatus:'private-payment'},
        course:{Course:'JuniorDeveloper',Level:'LV2',SessionCount:4,TotalHours:8}, now:new Date('2026-10-04T04:59:59Z'),
        progress:{target:4,completed:999,sessions:[
            {EnrollmentID:'E1',SessionNo:'Session 2',Date:'2026-10-04',StartTime:'10:00',EndTime:'12:00'},
            {EnrollmentID:'E1',SessionNo:'Session 1',Date:'2026-10-03',StartTime:'10:00',EndTime:'12:00'},
            {EnrollmentID:'E1',SessionNo:'Session 4',Date:'2026-10-11',StartTime:'13:00',EndTime:'15:00'}]}, ...overrides };
}
test('export model uses sheet session numbers, correct Bangkok completion boundary and course hours',()=>{
    const input=options(),m=E.buildModel(input);
    assert.equal(m.studentName,'ปุญญ์');assert.equal(m.fullName,'ปุญญ์ ทดสอบ');assert.equal(m.hoursLabel,'8 ชั่วโมง');
    assert.deepEqual(m.sessions.map(s=>s.sequence),[1,2,4]);assert.equal(m.completed,1);assert.equal(m.remaining,3);assert.equal(m.percent,25);assert.equal(m.unbooked,1);
    assert.equal(m.sessions[1].time,'10:00–12:00 น.');assert.equal(m.sessions[1].status,'รอเรียน');
    assert.equal(E.buildModel({...input,now:new Date('2026-10-04T05:00:00Z')}).completed,2);
    assert.equal(input.progress.sessions[0].SessionNo,'Session 2');
});
test('full Thai weekday and Buddhist date are exported without Gregorian or timezone drift',()=>{
    const date=E.thaiDate('04/10/2569');assert.equal(date.weekday,'วันอาทิตย์');assert.match(date.date,/4 ตุลาคม 2569/);assert.match(date.full,/วันอาทิตย์/);
    assert.equal(E.thaiDate('2026-10-03').weekday,'วันเสาร์');assert.equal(E.thaiDate('31/02/2026').full,'ยังไม่ระบุวันเรียน');
});
test('missing session numbers remain unspecified and unrelated enrollment data is excluded',()=>{
    const m=E.buildModel(options({progress:{sessions:[
        {EnrollmentID:'E1',SessionNo:'',Date:'2026-10-05',StartTime:'13:00',EndTime:'15:00'},
        {EnrollmentID:'E2',SessionNo:'Session 9',Date:'2026-10-05',StartTime:'13:00',EndTime:'15:00'}]}}));
    assert.equal(m.sessions.length,1);assert.equal(m.sessions[0].sessionLabel,'ไม่ระบุครั้ง');assert.equal(m.sessions[0].sequence,null);
    const output=JSON.stringify(m);for(const secret of ['private-phone','private-parent','private-payment'])assert.ok(!output.includes(secret));
});
test('empty bookings, unknown course sessions and invalid time placeholders are distinct',()=>{
    const empty=E.buildModel(options({progress:{sessions:[]}}));assert.equal(empty.target,4);assert.equal(empty.unbooked,4);assert.match(empty.emptyMessage,/ยังไม่ได้กำหนดวันและเวลา/);
    const unknown=E.buildModel(options({enrollment:{},course:{},progress:{sessions:[]}}));assert.equal(unknown.target,0);assert.equal(unknown.unbooked,0);assert.match(unknown.emptyMessage,/ยังไม่มีข้อมูล Session/);assert.equal(unknown.hoursLabel,'ยังไม่ระบุชั่วโมงรวม');
    const placeholder=E.buildModel(options({progress:{sessions:[{SessionNo:1,Date:'2026-10-03',StartTime:'15:00',EndTime:'13:00'}]}}));assert.equal(placeholder.scheduled,0);assert.equal(placeholder.completed,0);assert.equal(placeholder.sessions[0].status,'รอนัดเวลา');
});
test('line wrapping preserves long Thai text, words, explicit newlines and combining clusters',()=>{
    const measure=s=>[...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(s)].length;
    const thai='วันอาทิตย์ที่สิบสี่เดือนตุลาคมโรงเรียนหุ่นยนต์สำหรับนักเรียน';
    const lines=E.wrapText(thai,12,measure);assert.equal(lines.join(''),thai);assert.ok(lines.every(line=>measure(line)<=12));
    const english=E.wrapText('JuniorDeveloperAdvancedCourse',8,measure);assert.equal(english.join(''),'JuniorDeveloperAdvancedCourse');assert.ok(english.every(line=>measure(line)<=8));
    assert.deepEqual(E.wrapText('Session 1\nวันเสาร์',20,measure),['Session 1','วันเสาร์']);
    assert.deepEqual(E.wrapText('ก้ก้ก้',1,measure),['ก้','ก้','ก้']);
    assert.deepEqual(E.wrapText('one two three',7,measure),['one two','three']);
});
test('download filenames are safe, stay within byte limits and retain png extension',()=>{
    const name=E.filename('น้อง/ทดสอบ:*?','Junior<Developer>','LV1|test');assert.match(name,/\.png$/);assert.ok(!/[<>:"/\\|?*]/.test(name));
    const long=E.filename('นักเรียน'.repeat(80),'หลักสูตร'.repeat(80),'LV15');assert.ok(Buffer.byteLength(long,'utf8')<=230);assert.ok(long.endsWith('.png'));
    assert.equal(E.WIDTH,390);assert.equal(E.SCALE,3);
});

test('compact render retains every session with readable text within phone-size height targets',async()=>{
    const previousDocument=global.document,previousImage=global.Image;
    const rendered=[];
    global.document={fonts:{load:async()=>[],ready:Promise.resolve()},createElement:()=>{
        const calls=[],ctx={font:'',measureText(text){return {width:[...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(text)].length*Number(this.font.match(/([\d.]+)px/)?.[1]||18)*0.48};},
            fillText(text,x,y){calls.push({text,x,y,align:this.textAlign,width:this.measureText(text).width,size:Number(this.font.match(/([\d.]+)px/)[1])});},
            beginPath(){},moveTo(){},arcTo(){},closePath(){},fill(){},stroke(){},lineTo(){},scale(){},fillRect(){},drawImage(){}};
        const canvas={style:{},getContext:()=>ctx,setAttribute(){},calls};rendered.push(canvas);return canvas;
    }};
    global.Image=class{constructor(){this.naturalWidth=3994;this.naturalHeight=990;}set src(_){queueMicrotask(()=>this.onload());}};
    try {
        for(const count of [4,15]) {
            const input=options({progress:{target:count,sessions:Array.from({length:count},(_,i)=>({EnrollmentID:'E1',SessionNo:`Session ${i+1}`,Date:`2026-10-${String(i+4).padStart(2,'0')}`,StartTime:'13:00',EndTime:'15:00'}))}});
            const canvas=await E.render(input),height=canvas.height/E.SCALE;
            assert.equal(canvas.width,1170);assert.equal(canvas.calls.find(call=>call.text==='ปุญญ์').x,195);assert.ok(!canvas.calls.some(call=>call.text==='ปุญญ์ ทดสอบ'));assert.ok(canvas.calls.filter(call=>/^Session \d+$/.test(call.text)).every(call=>call.align==='left'&&call.x===36));assert.ok(!canvas.calls.some(call=>call.text==='BostonRobotics'));assert.ok(count===4?height>=600&&height<=850:height>=1200&&height<=1700,`Unexpected ${count}-session height ${height}`);
            for(let i=1;i<=count;i++)assert.ok(canvas.calls.some(call=>call.text===`Session ${i}`));
            assert.ok(canvas.calls.every(call=>call.y>=0&&call.y+call.size<=height));
            assert.ok(canvas.calls.every(call=>{const left=call.x-(call.align==='right'?call.width:call.align==='center'?call.width/2:0);return left>=22&&left+call.width<=368;}));
            assert.ok(canvas.calls.filter(call=>call.text.startsWith('วัน')&&call.text.includes('2569')).every(call=>call.size>=17-4*96/72));
            assert.ok(canvas.calls.filter(call=>call.text==='13:00–15:00 น.').every(call=>call.size>=20-4*96/72));
        }
    } finally {global.document=previousDocument;global.Image=previousImage;}
});
