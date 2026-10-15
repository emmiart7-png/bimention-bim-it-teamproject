# 반응형외피 프로젝트: 이어서 작업하기 (Claude 용 안내)

은미(팀 BIMension, 총괄 · 웹 · 보고서)의 작업 저장소. 다른 컴퓨터에서도 이 파일을 읽고 이어서 작업한다.
마지막 정리: 2026-10-15 (학원 컴퓨터 세션)

## 작업 규칙 (꼭 지킬 것)

- GitHub 은 항상 **emmiart7-png** 로 올린다. 어느 계정으로 올릴지 묻지 않는다.
  커밋: `git -c user.name=emmiart7-png -c user.email=emmiart7-png@users.noreply.github.com commit ...`
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **브이월드 인증키는 work/ 에 넣지 않는다.** work/web/index.html 에는 `'YOUR_VWORLD_KEY'` 자리만 있다.
  사이트(docs/index.html)에는 키가 들어 있어야 지도가 된다 (publish.js 가 넣음).
- 디자인을 바꿀 때는 원본을 그대로 두고 시안(별도 파일)으로 먼저 보여 준다. 사용자가 "이상하게 바꿨어, 되돌려" 한 적이 여러 번 있다.
- 비밀번호는 입력하지 않는다 (로그인은 사용자가 직접). 릴리스 공개 등 밖으로 나가는 일은 사용자 확인 후.
- 팀 저장소 https://github.com/BIMension-BIM-IT/reactive-facade (공개) 규칙 (CONTRIBUTING.md)
  - 인증키 · 비밀번호 · 토큰, 이메일 · 전화번호, 카톡으로 받은 파일, 50MB 넘는 파일 금지 (큰 파일은 Releases)
  - 처음 받으면 `git config core.hooksPath .githooks` 한 번. 작업 전 Pull 먼저. 자기 폴더(web/, docs/)만 수정
  - 웹 코드는 팀 저장소에 올리지 않는다 (키 때문에). 엑셀 · 보고서 원본(팀원 이름 포함)은 docs/ 에 올려도 된다고 허락받음
  - 카톡으로 받은 PDF 는 올리지 않는다

## 폴더

| 위치 | 내용 |
|---|---|
| `docs/` | **사이트** (GitHub Pages): https://emmiart7-png.github.io/bimention-bim-it-teamproject/ . 직접 고치지 말고 publish.js 로 만든다 |
| `docs/unity/` | Unity WebGL 빌드 (Build/ · StreamingAssets/). 지금: 팀 10/15 webfix 빌드 |
| `work/web/` | **웹 원본**. 여기서 고친다 |
| `work/files/` | 엑셀 공유본 · 보고서 docx · 요구사항분석서 · 기획 메모 (plan.txt, guide.txt) |
| `work/unity-link/` | Unity 담당자에게 보낸 연결 파일 (웹연결 수정 10/15, 빛반사 연결 10/15) |
| `unity-bridge/` | 예전 Unity 연결 스크립트 |

## 웹 고치고 올리는 방법

1. `work/web/` 의 파일을 고친다. 화면 구조는 `index.html`(기본) + `v2.css` + `v3.css` + `v3.js` (v3 = 지금 사이트 디자인).
   v3.js 는 index.html 의 요소를 id 그대로 옮겨 왼쪽 사이드바(건물 · 설정) + 오른쪽 큰 시뮬레이션 화면으로 배치한다 (앱 스크립트보다 먼저, `</main>` 바로 뒤에 실행).
2. 파일을 고쳤으면 index.html 의 `?v=숫자` (캐시 번호)를 올린다. v3.css · v3.js 번호는 `make_v2.js` 안에 있다.
3. `node work/web/publish.js` → docs/ 에 index.html(키 넣음) 과 js · css 를 넣는다.
4. 미리 보기: `cd docs && node serve.js` → http://localhost:8080 (Unity · 키 다 들어 있음)
5. `git add docs work && git commit && git push` → 1~2분 뒤 사이트 반영. curl 로 새 `?v=` 번호가 보이는지 확인.
6. 사용자에게는 "Shift+F5 로 새로고침" 안내.

## 화면 · 기능 메모 (지금 상태)

- 처음 화면 = 네이버 1784 (Unity). 주소 검색 → 건물 선택 → "입면 만들기" → 웹 3D (three.js, model3d.js)
- 주소로 1784 를 고르면 Unity 로 보여 준다 (v3.js 의 1784 감지: 이름 또는 35 m 이내)
- 재생: ▶ = 0.5배속(기본), ▶▶ = 빠르게. 날 회전은 화면에서만 45°/s 로 천천히 (features.js ease)
- 버튼 모양 통일: 외관 · 실내 · 나란히와 같은 회색 칸 + 고른 것만 흰 바탕 파란 글씨, 높이 28px · 글씨 13px
- 웹 3D 색 · 카메라를 Unity 와 맞춤 (청록 하늘, 흰 주변 건물, 연두 땅, 35° 위에서 내려다보기, 덜 가리는 방향 고르기)
- 웹 3D 를 보는 동안 숨겨진 Unity 는 멈춘다 (`window.syncUnityLoop`, 안 멈추면 7 fps)
- Unity 가 페이지 전체의 Backspace · Tab 을 막아서, 글자 칸 입력 중에는 그 막기를 무시하게 했다 (index.html 맨 아래 스크립트)
- 정보 수정 칸(층수 · 층고 · 창면적비 · 짧은 변 제외)은 글자 칸. 쉼표 → 점, 창면적비 60 → 0.6
- **빛반사 보기 (끄기 | 켜기, 기본 끄기)**
  - 다른 건물: 웹 3D 에서 유리 정반사 계산 → 반사광이 닿는 주변 건물 벽 · 지붕에 면으로 칠함 (약하면 노랑 #FFE45C, 셀수록 주황 #FF7A1A)
  - 1784: Unity GlareSim 을 `LouverBridge.SetGlare("instant"|"off")` 로 켜고 끔, 결과는 `receiveGlareResult` 로 받음
- 보고서용 캡처: Unity 를 찍는 동안만 3배 해상도, 입면 가운데 42% 확대 (웹 3D 60%) → 열림 · 닫힘 차이가 보이게 (capture.js ZOOM)
- 인쇄 = 3쪽 요약 (10/14 양식과 같은 구성, 인쇄 버튼으로 해야 Unity 캡처가 들어감), 상세 인쇄 = 종합보고서 양식 약 16~17쪽 (report.js)

## 남은 일 · 기다리는 것

- Unity 빌드: 지금 사이트 = 팀 `unity_webgl_1015_glare_v3` (10/15 16:40). 건물 정상, 빛반사 연결 · 해 고도(하지 정오 74°) 확인함. `UNITY_FILE_SUFFIX="?b=1015glare3"`
  새 빌드가 오면: Releases 에서 받아 docs/unity/Build · StreamingAssets 교체 → work/web/index.html 의 `UNITY_FILE_SUFFIX` 를 새 값으로 → 건물 보이는지 · 빛반사 켜기 확인 → publish.js → 배포
- Unity 나침반 85px 고정 (LouverViewSetup.cs), 날 색 #E8ECEF: 다음 빌드에 넣어 달라고 요청함
- 팀 저장소 web/README · 엑셀 15_웹도구 시트의 화면 설명을 v3 화면에 맞게 고치기 (아직 안 함)

## 다른 자료

- 발표 슬라이드 (Claude 아티팩트): https://claude.ai/artifact/VdDmsVQH2uCJqeo7JoL78X (팀원이 약 33장으로 재구성함)
- Unity 빌드 · 프로젝트 원본: 팀 저장소 Releases
