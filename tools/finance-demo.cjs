module.exports=b=>{
 const headers=b.data.Transactions[0];
 for(let month=3;month<=10;month++)for(const [type,category,amount,note] of [['income','income_course',month===10?12500:18000+month*1100,'ค่าเรียนกลุ่มตัวอย่าง'],['expense','exp_rent',8000,'ค่าเช่าสถานที่'],['expense','exp_salary',7000,'ค่าครู'],['expense','exp_equip',month===10?4500:1800,'อุปกรณ์การเรียน']]){
  const date=`2026-${String(month).padStart(2,'0')}-01`,r={date,type,category,amount,note,id:`demo-${month}-${category}`,status:'active',payment_method:'โอนเงิน',revision:1,history_json:'[]'};b.data.Transactions.push(headers.map(k=>r[k]??''));
 }
};
