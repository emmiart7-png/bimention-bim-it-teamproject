// 배포: node publish.js → v3 화면(index.html + v2.css + v3.css + v3.js)을 만들어 사이트 폴더 docs/ 에 넣는다
// 이 폴더(work/web)의 index.html 에는 브이월드 키 대신 'YOUR_VWORLD_KEY' 가 들어 있다. 키는 아래 순서로 찾아 넣는다
//   1) 환경변수 VWORLD_KEY  2) work/vworld_key.txt (git 에 안 올라감)  3) 지금 사이트 docs/index.html 에 들어 있는 키 그대로
// 그 뒤: 저장소 맨 위에서 git add docs && git commit && git push → 1~2분 뒤 사이트 반영
const fs = require('fs'), path = require('path');
const here = __dirname, docs = path.resolve(process.argv[2] || path.join(here, '..', '..', 'docs'));
const FILES = ['README.md', 'capture.js', 'engine.js', 'features.js', 'geo.js', 'model3d.js', 'report.js', 'serve.js', 'shade.js', 'test_engine.js', 'unity.js', 'v2.css', 'v3.css', 'v3.js'];
const HOLD = "'YOUR_VWORLD_KEY'";

require('./make_v2.js');   // index.html → v2.html → v3.html

function findKey() {
  if (process.env.VWORLD_KEY) return process.env.VWORLD_KEY.trim();
  const f = path.join(here, '..', 'vworld_key.txt');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const d = path.join(docs, 'index.html');
  if (fs.existsSync(d)) { const m = fs.readFileSync(d, 'utf8').match(/const DEFAULT_VW_KEY='([^']+)'/); if (m && "'" + m[1] + "'" !== HOLD) return m[1]; }
  return '';
}
const key = findKey();
if (!key) throw new Error('브이월드 키를 못 찾았어요: work/vworld_key.txt 에 키 한 줄을 넣거나 VWORLD_KEY 환경변수를 쓰세요');

let h = fs.readFileSync(path.join(here, 'v3.html'), 'utf8').replace(' (디자인 시안 v3)', '');
if (!h.includes(HOLD)) throw new Error("index.html 에 'YOUR_VWORLD_KEY' 자리가 없어요 (키를 직접 넣었으면 다시 'YOUR_VWORLD_KEY' 로 바꿔 주세요)");
fs.writeFileSync(path.join(docs, 'index.html'), h.replace(HOLD, "'" + key + "'"));
for (const f of FILES) fs.copyFileSync(path.join(here, f), path.join(docs, f));
console.log('docs/ 에 넣었어요: index.html + ' + FILES.length + '개 파일 (Unity 빌드 docs/unity 는 그대로)');
