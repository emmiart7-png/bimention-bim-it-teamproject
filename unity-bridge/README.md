# Unity 팀용: 웹 검토 도구와 연결하기

웹([검토 도구](https://emmiart7-png.github.io/bimention-bim-it-teamproject/))과 Unity가 서로 값을 주고받게 하는 코드다.
데이터 형식은 팀 문서 「반응형외피 데이터 형식」과 같다.

## 주고받는 것

| 방향 | 언제 | 내용 | Unity 쪽 |
| --- | --- | --- | --- |
| 웹 → Unity | Unity가 뜬 직후, 웹에서 건물 · 입면 · 루버 사양이 바뀔 때 | `site_input` JSON (위치, 입면 목록, 루버 사양, 겨울 모드) | `onSiteInput` 이벤트 |
| 웹 → Unity | 웹의 "하루 재생" 날짜 · 시각을 바꿀 때 | `2026-06-21T12:30:00+09:00` (한국 시간) | `onDateTime` 이벤트 |
| Unity → 웹 | 연간 일사량 계산이 끝났을 때 | `solar_result` JSON | `bridge.SendSolarResult(result)` |

웹은 Unity 결과를 받으면 자동으로 "Unity 일사량" 기준으로 에너지 · 탄소 · 비용을 다시 계산한다.

## 넣는 방법 (10분)

1. 이 폴더의 파일을 Unity 프로젝트에 같은 경로로 복사한다
   - `Assets/Scripts/LouverBridge.cs`
   - `Assets/Scripts/LouverBridgeExample.cs` (예시, 선택)
   - `Assets/Plugins/WebGL/LouverBridge.jslib` (**폴더 경로가 꼭 이대로**여야 한다)
2. 씬에 빈 오브젝트를 만들고 `LouverBridge`를 붙인다. 오브젝트 이름은 실행 시 자동으로 `LouverBridge`가 된다 (웹이 이 이름으로 부름).
3. 기존 코드와 연결한다. 둘 중 하나:
   - Inspector의 `On Site Input`, `On Date Time` 이벤트에 기존 스크립트의 함수를 끌어다 놓는다
   - 또는 `LouverBridgeExample.cs`를 붙이고 "여기에"라고 적힌 곳에 기존 함수 호출을 넣는다
4. 에디터에서 시험: `LouverBridge` 컴포넌트의 ⋮ 메뉴 → **"시험: 1784 하지 정오"**. Console에 입면 4개와 12:00이 찍히면 연결 성공.
5. 연간 계산이 끝나면 `bridge.SendSolarResult(result)`. 에디터에서는 Console에 JSON이 찍힌다.

## 결과(`solar_result`) 채우는 법

입면마다 기간 합계 일사량(kWh/㎡)을 넣는다. 유리 바깥면에 닿는 직달 + 산란, 그림자 반영값.

| 칸 | 뜻 |
| --- | --- |
| `cooling_season.bare_kwh_m2_yr` | 6~9월, 통유리일 때 유리에 닿는 양 |
| `cooling_season.external_reactive_kwh_m2_yr` | 6~9월, 외부 반응형 루버를 지나 유리에 닿는 양 |
| `cooling_season.external_fixed_kwh_m2_yr` | 6~9월, 외부 고정 루버(날 0°)를 지난 양 |
| `cooling_season.internal_reactive_kwh_m2_yr` | 6~9월, 내부 루버일 때 실내에 남는 양 (모르면 bare와 같게) |
| `heating_season.*` | 12~2월, 같은 방식 (외부 반응형은 겨울 모드 기준) |
| `closed_hours_yr`, `blade_rotation_deg_yr` | 외부 반응형 루버 닫힘 시간, 날 하나 회전량 (°) |
| `meta.weather_source`, `meta.shading_included` | 기상 데이터 이름, 그림자 반영 여부 |

`id`는 받은 `site_input.facades[].id`와 같게 쓴다. 루버 없는 입면(`louver: false`)은 빼도 된다.

## WebGL 빌드 설정

- File → Build Settings → **WebGL**
- Player Settings → Publishing Settings → Compression Format: **Disabled** (또는 Decompression Fallback 켜기)
- Build 폴더 안 파일이 `이름.loader.js`, `이름.data`, `이름.framework.js`, `이름.wasm`으로 나온다. 이 **이름**을 은미에게 알려 준다.
- `.data` 파일이 100MB를 넘으면 깃허브에 안 올라간다 (텍스처 압축 · 해상도 줄이기)

## 빌드를 웹에 넣는 법 (은미 · Claude가 함)

1. 빌드 결과의 `Build/` 폴더(와 있으면 `StreamingAssets/`)를 저장소 `docs/unity/` 아래에 복사
2. `docs/unity.js`의 `NAME`을 빌드 이름으로 바꿈
3. 깃허브에 올리면 웹 화면의 "루버 시뮬레이션 (Unity)" 자리에 뜬다
