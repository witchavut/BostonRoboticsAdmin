const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const demo = process.argv.includes('--demo');
const backend = demo ? require('../tests/backend-harness.cjs').createBackend() : null;
const root = path.resolve(__dirname, '..');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (demo && url.pathname === '/api') {
    let result;
    if (req.method === 'GET') result = JSON.parse(backend.context.doGet({parameter:{action:url.searchParams.get('action')}}).text);
    else { let body=''; for await (const chunk of req) body+=chunk; const r=JSON.parse(body); result=backend.post(r.action,r.payload,r.token); }
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(result)); return;
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^(index\.html|js\/(app|domain)\.js|css\/style\.css)$/.test(file)) {res.writeHead(404);res.end();return;}
  let content=fs.readFileSync(path.join(root,file),'utf8');
  if (demo && file==='js/app.js') content=content.replace(/const API_URL = '[^']+';/,"const API_URL = '/api';");
  if (demo && file==='index.html') content=content.replace('BostonRobotics AdminSystem</strong>','BostonRobotics AdminSystem • ข้อมูลทดสอบ</strong>');
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(content);
}).listen(4173,'127.0.0.1',()=>console.log(`Preview http://127.0.0.1:4173 ${demo?'(synthetic data only)':''}`));
