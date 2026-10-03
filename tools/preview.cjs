const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const demo = process.argv.includes('--demo');
const backend = demo ? require('../tests/backend-harness.cjs').createBackend() : null;
if (demo && process.argv.includes('--showcase')) require('./demo-showcase.cjs')(backend);
const finance = demo ? require('../tests/finance-harness.cjs').createFinance() : null;
if(finance)require('./finance-demo.cjs')(finance);
const root = path.resolve(__dirname, '..');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (demo && url.pathname === '/api') {
    let result;
    if (req.method === 'GET') result = JSON.parse(backend.context.doGet({parameter:{action:url.searchParams.get('action')}}).text);
    else { let body=''; for await (const chunk of req) body+=chunk; const r=JSON.parse(body); result=backend.post(r.action,r.payload,r.token); }
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(result)); return;
  }
  if(demo && url.pathname==='/finance-api'){let body='';for await(const chunk of req)body+=chunk;const r=JSON.parse(body);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(finance.post(r.action,r.payload)));return;}
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^(index\.html|js\/(app|domain|student-search|schedule-export|finance|finance-domain|finance-config)\.js|css\/(style|calendar-groups|student-search|finance)\.css|assets\/boston-logo\.png)$/.test(file)) {res.writeHead(404);res.end();return;}
  if (file.endsWith('.png')) {res.writeHead(200, {'Content-Type':'image/png'});res.end(fs.readFileSync(path.join(root,file)));return;}
  let content=fs.readFileSync(path.join(root,file),'utf8');
  if (demo && file==='js/app.js') content=content.replace(/const API_URL = '[^']+';/,"const API_URL = '/api';");
  if (demo && file==='index.html') content=content.replace('BostonRobotics AdminSystem</strong>','BostonRobotics AdminSystem • ข้อมูลทดสอบ</strong>');
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(content);
}).listen(4173,'127.0.0.1',()=>console.log(`Preview http://127.0.0.1:4173 ${demo?'(synthetic data only)':''}`));
