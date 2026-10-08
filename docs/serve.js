// 로컬 서버: node serve.js → http://localhost:8080 (Unity WebGL은 파일 더블클릭으로 안 열리므로 이걸로 연다)
// 브이월드 중계: /vworld/<address|data|search>?... → https://api.vworld.kr/req/...
//   키를 화면에 넣지 않으려면: (PowerShell) $env:VWORLD_KEY="발급키"; node serve.js
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path');
const root = __dirname, port = Number(process.env.PORT) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.md': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml' };

function proxyVworld(req, res) {
  const u = new URL(req.url, 'http://localhost');
  const kind = u.pathname.replace(/^\/vworld\//, '');
  if (!['address', 'data', 'search'].includes(kind)) { res.writeHead(400); return res.end('unknown'); }
  if (!u.searchParams.get('key') && process.env.VWORLD_KEY) u.searchParams.set('key', process.env.VWORLD_KEY);
  if (process.env.VWORLD_DOMAIN) u.searchParams.set('domain', process.env.VWORLD_DOMAIN);
  const target = 'https://api.vworld.kr/req/' + kind + '?' + u.searchParams.toString();
  https.get(target, { headers: { Referer: u.searchParams.get('domain') || 'http://localhost:' + port } }, r => {
    res.writeHead(r.statusCode, { 'Content-Type': r.headers['content-type'] || 'application/json' });
    r.pipe(res);
  }).on('error', e => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ response: { status: 'ERROR', error: { text: e.message } } })); });
}

http.createServer((req, res) => {
  if (req.url.startsWith('/vworld/')) return proxyVworld(req, res);
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    let ext = path.extname(file), headers = { 'Content-Type': types[ext] || 'application/octet-stream' };
    if (ext === '.gz' || ext === '.br') { headers['Content-Encoding'] = ext === '.gz' ? 'gzip' : 'br'; headers['Content-Type'] = types[path.extname(file.slice(0, -ext.length))] || 'application/octet-stream'; }
    res.writeHead(200, headers); res.end(buf);
  });
}).listen(port, () => console.log(`http://localhost:${port}`));
