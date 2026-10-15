// v2.html = index.html + v2.css + v2.js (디자인 시안). index.html 을 고친 뒤 다시 실행: node make_v2.js
const fs = require('fs');
let s = fs.readFileSync(__dirname + '/index.html', 'utf8');
if (!s.includes('</head>') || !s.includes('</main>')) throw new Error('index.html 구조가 다름');
s = s.replace('</head>', '<link rel="stylesheet" href="v2.css?v=3">\n</head>');
s = s.replace('</main>', '</main>\n<script src="v2.js?v=2"></script>');
s = s.replace(/<title>([^<]*)<\/title>/, '<title>$1 (디자인 시안 v2)</title>');
fs.writeFileSync(__dirname + '/v2.html', s);
console.log('v2.html ok');
// v3.html = v2.html 의 v2.js 대신 v3.js, v3.css 추가
{ let h = fs.readFileSync(__dirname + '/v2.html', 'utf8');
  h = h.replace(/<link rel="stylesheet" href="v2\.css\?v=\d+">/, m => m + '\n<link rel="stylesheet" href="v3.css?v=14">').replace(/<script src="v2\.js\?v=\d+"><\/script>/, '<script src="v3.js?v=11"></script>').replace('(디자인 시안 v2)', '(디자인 시안 v3)');
  fs.writeFileSync(__dirname + '/v3.html', h); console.log('v3.html ok'); }
