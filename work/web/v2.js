/*
 * 디자인 시안 v2: 왼쪽 사이드바(건물 · 시뮬레이션) + 오른쪽 큰 시뮬레이션 화면(해 정보 · 평면도 겹침)
 * index.html 의 요소를 id 그대로 옮기기만 한다 → 계산 · Unity · 보고서 · 인쇄 코드는 그대로 동작
 * v2.html 에서만 쓰며, 앱 스크립트보다 먼저 실행된다 (</main> 바로 뒤)
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  document.body.classList.add('v2');
  const main = document.querySelector('main');
  const mapPanel = $('resetMap').closest('section');
  const simPanel = $('simWhere').closest('section');

  const shell = mk('div', 'v2shell'), side = mk('aside', 'v2side'), col = mk('div', 'v2maincol');
  shell.append(side, col); main.insertBefore(shell, main.firstChild);

  // ---------- 건물 ----------
  const bc = mk('section', 'panel v2card noprint');
  const h1 = mk('h2', 'v2h'); h1.append(document.createTextNode('건물'), $('resetMap')); bc.append(h1);
  const src = $('simSrc'); src.removeAttribute('style'); src.className = 'seg v2seg noprint'; bc.append(src);
  const srow = $('searchAddr').closest('.inline'); srow.classList.add('v2search'); $('searchAddr').placeholder = '주소 · 건물명 (예: 정자일로 95)'; bc.append(srow);
  const mapBox = mk('div', 'v2map'); mapBox.append($('map'));
  const ex = mk('button', 'v2expand', '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>');
  ex.type = 'button'; ex.title = '지도 크게 · 작게'; ex.setAttribute('aria-label', '지도 크게 보기');
  ex.onclick = () => { mapBox.classList.toggle('big'); window.dispatchEvent(new Event('resize')); };
  mapBox.append(ex); bc.append(mapBox);
  bc.append($('vwStatus'));
  // 정보 수정: 접는 칸 (층수 · 층고 · 창면적비 · 짧은 변, 인증키 변경)
  const infoRow = $('infoRow'); infoRow.hidden = false;
  const infoBox = mk('div', 'v2infobox closed'); infoBox.append(infoRow, $('vwKeyToggle').closest('label'), $('vwKeyRow'));
  $('infoToggle').closest('label').style.display = 'none';
  const tog = mk('button', 'v2infotog', '<span class="chev">›</span> 정보 수정 <span class="muted">층수 · 층고 · 창면적비</span>'); tog.type = 'button';
  tog.onclick = () => { infoBox.classList.toggle('closed'); tog.classList.toggle('open'); };
  const mf = $('makeFacades'); mf.textContent = '입면 만들기';
  const r = mk('div', 'v2inforow'); r.append(tog, mf); bc.append(r, infoBox);
  side.append(bc);

  // ---------- 시뮬레이션 ----------
  const sc = mk('section', 'panel v2card noprint');
  sc.append(mk('h2', 'v2h', '시뮬레이션'));
  const dr = mk('div', 'v2lab'); dr.append(mk('span', null, '날짜'), $('simDate')); sc.append(dr);
  const seasons = document.querySelector('[data-day]').parentElement; seasons.removeAttribute('style'); seasons.className = 'v2seasons'; sc.append(seasons);
  const tr = mk('div', 'v2lab'); tr.append(mk('span', null, '시각'), $('simTimeOut')); sc.append(tr);
  const pr = mk('div', 'v2play'); pr.append($('simPlay'), $('simTime')); sc.append(pr);
  sc.append(mk('div', 'v2lab', '<span>뷰</span>'));
  const vs = $('viewSeg'); vs.classList.add('v2seg'); sc.append(vs);
  const fb = $('faceBtns'); fb.classList.add('v2faces'); sc.append(fb);
  // 마지막으로 누른 입면 버튼을 선택 표시 (처음엔 전체)
  const setOn = b => fb.querySelectorAll('.facebtn').forEach(x => x.classList.toggle('on', x === b));
  setOn(fb.querySelector('[data-face=all]')); fb.addEventListener('click', e => { const b = e.target.closest('.facebtn'); if (b) setOn(b); });
  const lt = $('layerToggles'); lt.classList.add('v2layers'); lt.querySelectorAll('label').forEach(l => { l.childNodes.forEach(n => { if (n.nodeType === 3) n.textContent = n.textContent.replace(' 보이기', ''); }); }); sc.append(lt);
  const lg = simPanel.querySelector('.legend'), items = lg && lg.children[1];
  if (items) { const nl = mk('div', 'legend v2legend'); nl.append(items); sc.append(nl); }
  side.append(sc);
  // 재생 버튼: 글자(재생 · 멈춤) 대신 동그란 아이콘
  const play = $('simPlay');
  new MutationObserver(() => play.classList.toggle('playing', play.textContent.trim() === '멈춤')).observe(play, { childList: true, characterData: true, subtree: true });

  // ---------- 오른쪽: 큰 화면 ----------
  const mc = mk('section', 'panel v2stagecard noprint');
  const head = mk('div', 'v2stagehead'); head.append(mk('h2', null, '루버 시뮬레이션'), $('simWhere'));
  const cap = mk('button', 'v2capbtn', '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>보고서용 캡처</span>');
  cap.type = 'button';
  cap.onclick = async () => {
    if (!window.runCapture) return;
    const t = cap.querySelector('span'); cap.disabled = true; t.textContent = '캡처 중…';
    try { await window.runCapture(); } finally { cap.disabled = false; t.textContent = '보고서용 캡처'; }
    const p = $('capPanel'); if (p && p.classList.contains('has')) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  head.append(cap); mc.append(head);
  const stage = mk('div', 'v2stage'); stage.append($('unity'), $('modelBox'));
  const chip = mk('div', 'v2chip'); const when = mk('span', 'v2when'); chip.append($('sunInfo'), when); stage.append(chip);
  const pc = mk('div', 'v2plan'); pc.append($('plans'));
  const hint = [...simPanel.querySelectorAll('p.muted')].find(p => p.textContent.includes('입면 이름을 누르면'));
  if (hint) { hint.textContent = '입면 이름을 눌러 루버 달기 · 떼기 (실선 = 루버, 점선 = 없음)'; pc.append(hint); }
  stage.append(pc); mc.append(stage); col.append(mc);
  mapPanel.style.display = 'none'; simPanel.style.display = 'none';

  // 해 정보 옆: "6/21 하지 · 12:00"
  const DAY = { '03-21': '춘분', '06-21': '하지', '09-23': '추분', '12-21': '동지' };
  const upd = () => { const d = ($('simDate').value || '').slice(5); const [m, dd] = d.split('-').map(Number); when.textContent = m ? `${m}/${dd}${DAY[d] ? ' ' + DAY[d] : ''} · ${$('simTimeOut').textContent}` : ''; };
  new MutationObserver(upd).observe($('simTimeOut'), { childList: true, characterData: true, subtree: true });
  $('simDate').addEventListener('change', upd); document.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => setTimeout(upd, 0)));
  upd();
})();
