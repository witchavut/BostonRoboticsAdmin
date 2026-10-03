(function (root, factory) {
  const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.BostonFinance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const categories = {income_course:'ค่าเรียน',income_other:'รายรับอื่น',exp_rent:'ค่าเช่าและสถานที่',exp_equip:'อุปกรณ์การเรียน',exp_salary:'เงินเดือนและค่าจ้าง',exp_utilities:'น้ำ ไฟ อินเทอร์เน็ต',exp_marketing:'โฆษณาและการตลาด',exp_other:'รายจ่ายอื่น'};
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s; }
  function cents(value) { const n=Number(value); if(value==='' || value==null || !Number.isFinite(n) || n<0 || n>1e10) throw Error('จำนวนเงินไม่ถูกต้อง'); return Math.round((n+Number.EPSILON)*100); }
  function receiptTotal(p) { const total=cents(p.CoursePrice)+cents(p.AddOnPrice)-cents(p.Discount); if(total<=0) throw Error('ยอดรับเงินสุทธิต้องมากกว่า 0'); return total/100; }
  function summarize(rows, month, today) {
    const invalid=[], seen=new Set(), accepted=[];
    rows.forEach(r=>{
      if(String(r.status).toLowerCase()!=='active') return;
      let amount; try {amount=cents(r.amount);} catch {invalid.push(r);return;}
      if(!validDate(r.date)||!['income','expense'].includes(r.type)||!r.id||seen.has(r.id)){invalid.push(r);return;}
      seen.add(r.id); if(r.date<=today) accepted.push({...r,cents:amount});
    });
    accepted.sort((a,b)=>a.date.localeCompare(b.date));
    const selected=accepted.filter(r=>!month||r.date.slice(0,7)===month);
    const sum=list=>{const t={income:0,expense:0};list.forEach(r=>t[r.type]+=r.cents);return {income:t.income/100,expense:t.expense/100,net:(t.income-t.expense)/100};};
    const groups=type=>{const map={};selected.filter(r=>r.type===type).forEach(r=>map[r.category]=(map[r.category]||0)+r.cents);return Object.entries(map).map(([key,n])=>({key,label:categories[key]||key||'ไม่ระบุหมวด',amount:n/100})).sort((a,b)=>b.amount-a.amount);};
    const monthly={};accepted.forEach(r=>{const k=r.date.slice(0,7);monthly[k]||=[];monthly[k].push(r);});
    const totals=sum(selected), expense=groups('expense'), income=groups('income');
    const advice=[];
    if(!selected.length) advice.push('ไม่มีรายการในช่วงนี้ จึงยังวิเคราะห์ไม่ได้');
    else if(totals.net<0){advice.push(`รายจ่ายมากกว่ารายรับ ${(-totals.net).toLocaleString('th-TH')} บาท ต้องเพิ่มรายรับหรือลดรายจ่ายรวมเท่านี้เพื่อให้ส่วนต่างเป็นศูนย์ โดยสมมติว่ารายการอื่นคงเดิม`); if(expense.length)advice.push(`ตรวจสอบหมวด ${expense[0].label} ซึ่งเป็นรายจ่ายสูงสุด แยกรายการจำเป็นกับรายการที่เลื่อนได้ก่อนตัดสินใจลดค่าใช้จ่าย`);}
    else advice.push('รายรับครอบคลุมรายจ่ายในช่วงนี้ ควรตรวจภาระที่ยังไม่ชำระและสำรองค่าใช้จ่ายเดือนถัดไปก่อนนำส่วนต่างไปใช้');
    if(income.length&&totals.income&&income[0].amount/totals.income>=.8) advice.push(`รายรับอย่างน้อย 80% มาจาก ${income[0].label} ควรติดตามการต่อคอร์สและจำนวนผู้เรียน เพื่อวางแผนรายรับเดือนถัดไป`);
    return {...totals,all:sum(accepted),selected: selected.slice().reverse(),incomeGroups:income,expenseGroups:expense,monthly:Object.keys(monthly).sort().map(month=>({month,...sum(monthly[month])})),firstDate:accepted[0]?.date||'',lastDate:accepted.at(-1)?.date||'',invalidCount:invalid.length,advice};
  }
  return {categories,validDate,cents,receiptTotal,summarize};
});
