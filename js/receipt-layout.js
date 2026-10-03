// Receipt layout adapted from the owner's supplied HTML. Uses only local assets.
(function(root){
  'use strict';
  root.BostonReceiptLayout={async draw(canvas,r,loadImage){
    const ctx=canvas.getContext('2d'),warnings=[];
    const money=n=>Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
    function wrap(value,width,size){ctx.font=`${size}px Kanit,sans-serif`;let line='',out=[];const parts=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('th',{granularity:'grapheme'}).segment(String(value||'')),s=>s.segment):Array.from(String(value||''));for(const c of parts){if(ctx.measureText(line+c).width>width&&line){out.push(line);line=c;}else line+=c;}if(line)out.push(line);return out;}
    const name=wrap(r.StudentName,500,29),parent=wrap('ผู้ปกครอง (Parent): '+(r.ParentName||'-'),500,23);
    const receiverHeight=75+name.length*38+parent.length*32;
    const items=[{name:r.CourseLevel,detail:r.CourseDetail,level:r.Level||'-',price:r.CoursePrice}];
    if(r.AddOnItem||Number(r.AddOnPrice)>0)items.push({name:r.AddOnItem||'รายการเพิ่มเติม',detail:r.AddOnDetail,level:'-',price:r.AddOnPrice});
    const rows=items.map(i=>({...i,n:wrap(i.name,510,26),d:wrap(i.detail,510,21),l:wrap(i.level,140,24)}));
    rows.forEach(i=>i.height=Math.max(100,35+i.n.length*35+i.d.length*29,40+i.l.length*32));
    const tableY=420+receiverHeight+42, totalsY=tableY+80+rows.reduce((s,i)=>s+i.height,0)+42;
    const footerY=totalsY+(Number(r.Discount)>0?240:195)+170;
    canvas.width=1170;canvas.height=footerY+160;
    function text(t,x,y,size=24,color='#334155',align='left',bold=false){ctx.font=`${bold?'600':'400'} ${size}px Kanit,sans-serif`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(String(t),x,y);}
    function box(x,y,w,h,fill,stroke,radius=0){ctx.beginPath();ctx.roundRect(x,y,w,h,radius);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}}
    function line(x1,y1,x2,y2,color='#cbd5e1'){ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
    ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,1170,canvas.height);box(20,20,1130,canvas.height-40,'#fff',null,24);
    const gradient=ctx.createLinearGradient(20,0,1150,0);gradient.addColorStop(0,'#0f172a');gradient.addColorStop(1,'#06b6d4');ctx.fillStyle=gradient;ctx.fillRect(20,20,1130,10);
    const assets=await Promise.all(['boston-logo.png','receipt-stamp.svg','receipt-signature.png'].map(async file=>{try{return await loadImage(file);}catch{warnings.push(file);return null;}}));
    if(assets[0])ctx.drawImage(assets[0],85,72,420,420*assets[0].height/assets[0].width);
    text('BostonRobotics Learning Center',85,220,27,'#0f172a','left',true);
    ['940 Anangkanat Rd., Mueang Kalasin District,','Kalasin 46000','Tel. 095-663-0891','Tax ID: 1460900048314'].forEach((s,i)=>text(s,85,256+i*31,22));
    text('ใบเสร็จรับเงิน',1085,116,39,'#0f172a','right',true);text('RECEIPT',1085,157,26,'#475569','right',true);
    text('เลขที่ (No.): '+r.ReceiptNo,1085,208,23,'#64748b','right');
    const date=String(r.ReceiptDate||'').match(/^(\d{4})-(\d{2})-(\d{2})/);text('วันที่ (Date): '+(date?`${date[3]}/${date[2]}/${date[1]}`:r.ReceiptDate),1085,242,23,'#64748b','right');
    const paid=!/ยกเลิก|void|cancel/i.test(String(r.Status||''));box(835,269,250,40,paid?'#d1fae5':'#fee2e2',null,20);text(paid?'ชำระเงินแล้ว (PAID)':'ยกเลิก (CANCELLED)',960,296,18,paid?'#059669':'#b91c1c','center');line(85,384,1085,384);
    box(85,420,550,receiverHeight,'#f8fafc','#e2e8f0',12);text('ได้รับเงินจาก (RECEIVED FROM)',110,456,19,'#94a3b8','left',true);let y=500;name.forEach(s=>{text(s,110,y,29,'#0f172a','left',true);y+=38;});parent.forEach(s=>{text(s,110,y,23);y+=32;});
    box(85,tableY,1000,80,'#f1f5f9','#cbd5e1');text('รายการ',110,tableY+33,22);text('(DESCRIPTION)',110,tableY+60,15,'#94a3b8');text('ระดับชั้น',815,tableY+33,22,'#475569','center');text('(LEVEL)',815,tableY+60,15,'#94a3b8','center');text('จำนวนเงิน',1060,tableY+33,22,'#475569','right');text('(AMOUNT THB)',1060,tableY+60,15,'#94a3b8','right');
    y=tableY+80;rows.forEach(i=>{box(85,y,1000,i.height,'white','#cbd5e1');let yy=y+38;i.n.forEach(s=>{text(s,110,yy,26,'#0f172a','left',true);yy+=35;});i.d.forEach(s=>{text(s,110,yy,21,'#64748b');yy+=29;});i.l.forEach((s,n)=>text(s,815,y+42+n*32,24,'#475569','center'));text(money(i.price),1060,y+46,26,'#0f172a','right',true);y+=i.height;});line(725,tableY,725,y);line(905,tableY,905,y);
    y=totalsY;text('ยอดรวม (Subtotal)',710,y,23);text(money(Number(r.CoursePrice||0)+Number(r.AddOnPrice||0)),1065,y,24,'#334155','right');y+=35;
    if(Number(r.Discount)>0){text('ส่วนลด (Discount)',710,y,23);text('- '+money(r.Discount),1065,y,24,'#ef4444','right');y+=45;}
    box(680,y,405,104,'#0284c7',null,12);text('ยอดรวมสุทธิ',705,y+42,24,'white','left',true);text('(NET TOTAL)',705,y+75,16,'#e0f2fe');text(money(r.NetTotal),1060,y+62,32,'white','right',true);
    line(85,footerY,1085,footerY,'#e2e8f0');text('THANK YOU FOR BUILDING THE FUTURE WITH US.',85,footerY+61,17,'#94a3b8');text('https://bostonsrobotics.com',85,footerY+95,20,'#0891b2');
    if(assets[1]){ctx.save();ctx.globalAlpha=.5;ctx.translate(905,footerY-30);ctx.rotate(-Math.PI/15);ctx.drawImage(assets[1],-80,-80,160,160);ctx.restore();}
    line(730,footerY+32,1085,footerY+32,'#94a3b8');if(assets[2])ctx.drawImage(assets[2],805,footerY-105,200,150);
    text('ว่าที่ ร.ต.ดร.วิชชาวุธ อุ่นสิม',905,footerY+78,24,'#0f172a','center',true);text('ผู้รับเงิน / AUTHORIZED SIGNATURE',905,footerY+111,17,'#64748b','center');
    return warnings;
  }};
})(typeof globalThis!=='undefined'?globalThis:this);
