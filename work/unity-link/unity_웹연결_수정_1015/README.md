# 웹 연결 수정 (2026-10-15)

10/15 WebGL 빌드를 웹에 넣어 보니 아래 오류가 나서, 웹 쪽에서 쓰던 스크립트를 모았어요.
씬은 고치지 않아도 돼요. 파일만 넣고(바꾸고) 다시 빌드하면 돼요.

| 빌드에서 나온 오류 | 웹에서 생기는 문제 | 고치는 파일 |
|---|---|---|
| `MissingMethodException: Method 'LouverBridgeGlue.OnSiteInput' not found` | 건물 입력 일부 실패 | `Scripts/LouverBridgeGlue.cs` |
| `SendMessage: object LouverBridge does not have receiver for function SetView!` | 외관 · 실내 · 나란히 버튼 안 먹음 | `Scripts/LouverBridge.cs` |
| (OnContext 없음) | 주변 건물 정보가 Unity로 안 감 | `Scripts/LouverBridge.cs` |
| `SendMessage: object LouverViewSetup not found!` | 북 · 동 · 남 · 서 · 전체 버튼, 나침반, 보고서 캡처 안 됨 | `Scripts/LouverViewSetup.cs` (새 파일) |

## 넣는 방법

1. **`LouverBridgeGlue.cs`** — 프로젝트에 있는 같은 이름 파일을 이것으로 **바꿔요.**
   팀 최신본에서 함수 이름 두 개만 바꿨어요: `OnSiteInput` → `HandleSiteInput`, `OnDateTime` → `HandleDateTime`.
   (이름이 `LouverBridge.OnSiteInput(string)` 과 같으면 웹의 SendMessage 가 이 함수도 불러서 오류가 나요.)
2. **`LouverBridge.cs`** — 프로젝트에 있는 `LouverBridge.cs` 를 이것으로 **바꿔요** (보통 `Assets/unity-bridge/Assets/Scripts/`).
   `SetView`, `OnContext`, `onView` 이벤트가 추가된 버전이에요. 같은 이름 파일이 두 개 있으면 컴파일 에러가 나니 하나만 두세요.
3. **`LouverViewSetup.cs`** — 새 파일이에요. `LouverBridge.cs` 와 같은 폴더에 넣어요.
   씬이 열리면 스스로 생겨서(`RuntimeInitializeOnLoadMethod`) 외관 · 실내 카메라, 입면 보기(`LookAtFacade`), 나침반을 붙여요. 씬에 따로 붙일 필요 없어요.
   팀 `LouverPerformance.cs` 를 그대로 써요 (지금 팀 파일과 같아요).
   나침반은 화면 크기와 상관없이 지름 85 px 로 고정했어요 (이전보다 조금 작게).
4. **`Plugins/WebGL/LouverBridge.jslib`** — `Assets/Plugins/WebGL/` 에 이미 있으면 바꾸고, 없으면 넣어요. (`LouverNotifyReady` 가 들어 있어요.)
5. **반사광(GlareSim)은 웹 빌드에서 꺼 주세요.** 1784 씬의 `GlareSim` 오브젝트를 끄고(체크 해제) 빌드하면 돼요.
   켜져 있으면 시작할 때 반사 계산을 하고 설정 패널이 화면 위에 보여요. Unity 안에서 쓸 때는 다시 켜면 돼요.

## 빌드 설정 (그대로)

- 파일 이름 `louver` (Build 폴더에 louver.loader.js · framework.js · data · wasm)
- Compression Format: Disabled
- StreamingAssets 4개 (sun_louver, louver_angle_by_floor, horizontal_angle_by_floor, winter_calendar)

## 확인 방법 (빌드 후)

브라우저 콘솔에 아래 오류가 없으면 돼요.
- `MissingMethodException`, `does not have receiver for function SetView`, `LouverViewSetup not found`

그리고 웹에서 하지 15:30 · "서" 버튼을 누르면 카메라가 서면을 보고 날이 닫혀 있어야 해요 (180° 수정 확인).
