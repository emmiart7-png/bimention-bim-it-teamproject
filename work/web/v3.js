/*
 * 디자인 시안 v3: v2 에서 평면도를 왼쪽 시뮬레이션 칸으로, 뷰 · 입면 버튼을 큰 화면 위 한 줄로
 * index.html 의 요소를 id 그대로 옮기기만 한다 → 계산 · Unity · 보고서 · 인쇄 코드는 그대로 동작
 * v3.html 에서만 쓰며, 앱 스크립트보다 먼저 실행된다 (</main> 바로 뒤)
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  document.body.classList.add('v2', 'v3');
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
  sc.append(mk('h2', 'v2h', '설정'));
  const dr = mk('div', 'v2lab'); dr.append(mk('span', null, '날짜'), $('simDate')); sc.append(dr);
  const seasons = document.querySelector('[data-day]').parentElement; seasons.removeAttribute('style'); seasons.className = 'v2seasons'; sc.append(seasons);
  const tr = mk('div', 'v2lab v3timelab'); tr.append(mk('span', null, '시각'), $('simTimeOut')); sc.append(tr);
  const playEl = $('simPlay'), timeEl = $('simTime');   // 옮긴 뒤에는 문서에 붙기 전이라 id 로 못 찾으므로 미리 잡아 둔다
  const pr = mk('div', 'v2play'); pr.append(playEl, timeEl); sc.append(pr);
  playEl.style.display = 'none';
  // 재생 버튼 두 개: ▶ = 0.5배속 (기본), ▶▶ = 빠르게. 고른 속도 버튼은 검게, 아닌 버튼은 흰색
  // 고른 버튼을 누르면 재생 · 멈춤, 다른 버튼을 누르면 그 속도로 바꿔 재생
  const pb = mk('div', 'v3playbtns'); pb.setAttribute('role', 'group'); pb.setAttribute('aria-label', '재생');
  const playing = () => playEl.textContent.trim() === '멈춤';
  const mkPlay = (k, icon, label) => { const b = mk('button', 'v3pbtn', `<span class="ic">${icon}</span>`); b.type = 'button'; b.dataset.k = k; b.title = label; b.setAttribute('aria-label', label);
    b.onclick = () => { if (playing() && window.PlaySpeed === k) { playEl.click(); } else { window.PlaySpeed = k; if (!playing()) playEl.click(); } syncPlay(); }; return b; };
  pb.append(mkPlay(0.5, '▶', '재생 (0.5배속)'), mkPlay(1, '▶▶', '빠르게 재생'));
  const syncPlay = () => pb.querySelectorAll('.v3pbtn').forEach(b => { const sel = window.PlaySpeed === Number(b.dataset.k); b.classList.toggle('sel', sel); b.setAttribute('aria-pressed', sel); b.querySelector('.ic').textContent = sel && playing() ? '❚❚' : (b.dataset.k === '1' ? '▶▶' : '▶'); });
  window.PlaySpeed = 0.5; pr.insertBefore(pb, timeEl); syncPlay();
  new MutationObserver(syncPlay).observe(playEl, { childList: true, characterData: true, subtree: true });
  // 빛반사 보기 (기본 끄기): 1784(Unity) = GlareSim, 다른 건물(웹 3D) = 웹에서 계산 → 주변 건물 벽에 노랑 ~ 주황으로 칠함
  const gl = mk('div', 'v3glare', '<span>빛반사 보기</span><span class="seg v2seg v3glseg" role="radiogroup" aria-label="빛반사 보기"><label><input type="radio" name="glare" value="off" checked><span>끄기</span></label><label><input type="radio" name="glare" value="on"><span>켜기</span></label></span>');
  sc.append(gl);
  const gOn = () => gl.querySelector('input[value=on]').checked;
  let gMode = null;
  const applyGlare = () => {
    const on = gOn(), model = window.simMode === 'model';
    if (window.Model3D && window.Model3D.setGlare) window.Model3D.setGlare(on && model);
    const LB = window.LouverBridge; if (LB && LB.sendGlare) LB.sendGlare(on && !model ? 'instant' : 'off');
    gMode = window.simMode;
  };
  gl.querySelectorAll('input').forEach(r => r.onchange = applyGlare);
  setInterval(() => { if (gOn() && window.simMode !== gMode) applyGlare(); }, 800);   // 1784 ↔ 선택한 건물이 바뀌면 다시
  window.addEventListener('glare-available', applyGlare);
  const vs = $('viewSeg'); vs.classList.add('v2seg');
  const fb = $('faceBtns'); fb.classList.add('v2faces');
  // 마지막으로 누른 입면 버튼을 선택 표시 (처음엔 전체)
  const setOn = b => fb.querySelectorAll('.facebtn').forEach(x => x.classList.toggle('on', x === b));
  setOn(fb.querySelector('[data-face=all]')); fb.addEventListener('click', e => { const b = e.target.closest('.facebtn'); if (b) setOn(b); });
  const pc = mk('div', 'v3plan'); pc.append($('plans'));
  const hint = [...simPanel.querySelectorAll('p.muted')].find(p => p.textContent.includes('입면 이름을 누르면'));
  if (hint) { hint.textContent = '입면 이름을 눌러 루버 달기 · 떼기 (실선 = 루버, 점선 = 없음)'; pc.append(hint); }
  sc.append(pc);
  const lt = $('layerToggles'); lt.classList.add('v2layers'); lt.style.display = 'none'; lt.querySelectorAll('label').forEach(l => { l.childNodes.forEach(n => { if (n.nodeType === 3) n.textContent = n.textContent.replace(' 보이기', ''); }); }); sc.append(lt);
  const lg = simPanel.querySelector('.legend'), items = lg && lg.children[1];
  if (items) { const nl = mk('div', 'legend v3legend'); nl.append(items); pc.insertBefore(nl, hint || null); }
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
  const vrow = mk('div', 'v3viewrow'); vrow.append(vs, fb);
  mc.append(head, vrow);   // 보고서용 캡처 버튼은 시안에 없어서 뺌 (인쇄 · 상세 인쇄에서 자동으로 찍음)
  const stage = mk('div', 'v2stage'); stage.append($('unity'), $('modelBox'));
  const chip = mk('div', 'v2chip'); const when = mk('span', 'v2when'); chip.append($('sunInfo'), when); stage.append(chip);
  mc.append(stage); col.append(mc);
  mapPanel.style.display = 'none'; simPanel.style.display = 'none';

  // 해 정보 옆: "6/21 하지 · 12:00"
  const DAY = { '03-21': '춘분', '06-21': '하지', '09-23': '추분', '12-21': '동지' };
  const upd = () => { const d = ($('simDate').value || '').slice(5); const [m, dd] = d.split('-').map(Number); when.textContent = m ? `${m}/${dd}${DAY[d] ? ' ' + DAY[d] : ''} · ${$('simTimeOut').textContent}` : ''; };
  new MutationObserver(upd).observe($('simTimeOut'), { childList: true, characterData: true, subtree: true });
  $('simDate').addEventListener('change', upd); document.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => setTimeout(upd, 0)));
  upd();

  // ---------- v3 추가 ----------
  // 대표일 버튼: 지금 날짜와 같은 버튼을 검게 (처음엔 하지)
  const markDay = () => document.querySelectorAll('[data-day]').forEach(b => b.classList.toggle('on', b.dataset.day === $('simDate').value));
  $('simDate').addEventListener('change', markDay); document.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => setTimeout(markDay, 0))); markDay();

  // 짧은 변 제외 기본값 5 m (기본값 버튼도 5 로 되돌림)
  const me = $('minEdge'); me.defaultValue = '5'; me.value = '5';

  // 정보 수정 값을 바꾸면 고른 건물의 입면을 다시 만든다 (지상층수는 원래 그렇게 동작). 1784 는 팀 측정값을 쓰므로 안내만
  const note = mk('p', 'v3infonote'); infoBox.insertBefore(note, infoBox.firstChild);
  const setNote = () => { note.textContent = window.simMode === 'model' ? '값을 바꾸면 고른 건물의 입면을 다시 만듭니다.' : '네이버 1784 는 팀 측정값(창 면적 · 층별 일사)을 씁니다. 이 값은 지도에서 고른 건물에 적용됩니다.'; };
  ['floorH', 'bWwr', 'minEdge'].forEach(id => $(id).addEventListener('change', () => { if (window.simMode === 'model' && !$('makeFacades').disabled) $('makeFacades').click(); }));
  setNote(); new MutationObserver(setNote).observe($('simWhere'), { childList: true, characterData: true, subtree: true });

  // 주소 검색 · 지도에서 네이버 1784 를 고르면 Unity (1784 모델) 로: 기본값과 같은 상태로 되돌리고 안내만 바꾼다
  let busy1784 = false;
  new MutationObserver(() => {
    if (busy1784) return;
    const t = $('vwStatus').textContent || '';
    if (!t || /주소나|찾는 중|불러오는|못|Unity 모델로/.test(t)) return;
    const lat = Number($('lat').value), lon = Number($('lon').value);
    // 이름이 '1784' 이거나, 이름이 없으면 1784 위치 35 m 안 (옆 그린팩토리는 약 70 m 라 제외)
    const near = t.includes('1784') || Math.hypot((lat - 37.35888) * 110540, (lon - 127.10518) * 88200) < 35;
    if (!near) return;
    busy1784 = true; const q = $('searchAddr').value;
    $('resetMap').click(); $('searchAddr').value = q;
    $('vwStatus').textContent = '네이버 1784 · 경기도 성남시 분당구 정자일로 95 — Unity 모델로 보여 줍니다';
    setTimeout(() => { busy1784 = false; }, 0);
  }).observe($('vwStatus'), { childList: true, characterData: true, subtree: true });

  // 큰 화면: 왼쪽 칸 아래 끝까지 늘리기 (웹 3D 도 칸 높이를 채움)
  $('model3d').dataset.fill = '1';

  // 링크 복사 · 인쇄 · 상세 인쇄 버튼의 아래 선 = 사용법 글자 줄의 아래 선
  const hdr = document.querySelector('header'), hb = hdr && hdr.querySelector('.hdr-btns'), sm = hdr && hdr.querySelector('#howto summary');
  const placeBtns = () => { if (!hb || !sm) return; if (innerWidth <= 700) { hb.style.top = ''; return; } hb.style.top = Math.round(sm.getBoundingClientRect().bottom - hdr.getBoundingClientRect().top - hb.offsetHeight) + 'px'; };
  addEventListener('resize', placeBtns); addEventListener('load', placeBtns); document.fonts && document.fonts.ready.then(placeBtns); placeBtns();
})();
