# 빛반사(GlareSim) 웹 연결 (2026-10-15)

웹에 "빛반사 보기" 스위치를 만들었어요. 1784에서는 Unity GlareSim을 켜고 끄고, 결과를 웹에 보여 줘요.
지난번에 GlareSim을 꺼 달라고 한 건 웹에서 안 돼서가 아니라 아래 두 가지 때문이었어요. 이 파일로 둘 다 해결돼요.

- 시작하자마자 반사 계산을 해서 첫 화면이 느려짐 → **처음엔 꺼진 상태로 시작**해요.
- GlareSim 설정 패널이 Unity 화면 위에 떠서 웹 버튼과 겹침 → **웹 빌드에서는 패널을 숨기고** 웹 스위치로만 켜고 꺼요.

## 넣는 방법 (파일 2개 바꾸기 + 체크 1개)

1. **`Scripts/LouverBridge.cs`** — 프로젝트의 `LouverBridge.cs` 를 이것으로 **바꿔요.**
   10/15 웹연결 수정본에 반사광 함수만 더했어요 (`SetGlare`, `SetGlareCase`).
   GlareSim을 이름으로 찾아서 메시지만 넘기기 때문에 GlareSim 폴더가 없어도 컴파일돼요.
2. **`Plugins/WebGL/LouverBridge.jslib`** — `Assets/Plugins/WebGL/` 의 같은 파일을 이것으로 **바꿔요.**
   (`LouverGlareAvailable`, `LouverSendGlareResult` 두 함수가 더해졌어요.)
3. **1784 씬의 `GlareSim` 오브젝트를 다시 켜요(체크).** Inspector 값은 그대로 둬도 돼요.
   웹 빌드에서는 `LouverBridge` 가 시작할 때 자동으로 Mode = Off, 패널 숨김으로 바꿔요.
4. 지난번처럼 WebGL로 빌드해요 (파일 이름 `louver`, Compression Disabled).

## 웹이 부르는 것

| 웹 → Unity | 하는 일 |
|---|---|
| `LouverBridge.SetGlare("instant")` | 지금 시각 반사광 계산 · 표시 (스위치 켬) |
| `LouverBridge.SetGlare("off")` | 끄기 (스위치 끔) |
| `LouverBridge.SetGlareCase("inner" \| "outer" \| "open" \| "none")` | 계산 경우 (지금 웹은 안 써요, 나중에 비교 버튼용) |

| Unity → 웹 | 내용 |
|---|---|
| `LouverGlareAvailable(1)` | 씬에 GlareSim 이 있음 (시작할 때 한 번) |
| `LouverSendGlareResult(json)` | GlareSim `onResultJson` 결과 그대로 (received, receivers 등) |

## 확인 방법 (빌드 후)

1. 웹에서 1784 화면이 처음 뜰 때 GlareSim 패널이 안 보이고, 뜨는 시간이 전과 비슷해야 해요.
2. 왼쪽 "설정" 칸의 **빛반사 보기** 를 켜면 Unity 화면에 히트맵 · 광선이 나오고,
   스위치 아래에 "주변에 닿는 반사 ○○ kW · 가장 많이: (건물 이름)" 이 떠야 해요.
3. 끄면 히트맵 · 광선이 사라지고 루버가 원래대로 보여야 해요.
4. 콘솔에 `[LouverBridge] GlareSim 이 씬에 없어요` 가 뜨면 3번(GlareSim 켜기)이 빠진 거예요.

## 참고

- 시작할 때 GlareSim 이 주변 건물 콜라이더를 만드는 시간은 그대로 있어요. 첫 화면이 많이 느려지면 알려 주세요.
- 반사 계산 중에 화면이 버벅이면 GlareSim 의 Blade Stride 를 3~4 로 올려 주세요 (README 「빌드 주의」).
- 다른 건물(1784가 아닌 곳)은 웹 3D 에서 따로 간단히 계산해요. Unity 작업은 필요 없어요.
- 이 파일은 Unity 6000.6.4f1 에서 컴파일 오류가 없는 것을 확인했어요.
