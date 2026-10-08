# 반응형외피 검토 도구 (웹 시제품 v0.1)

사이트와 입면을 넣으면 루버를 자동으로 입혀 에너지 · 탄소 · 물량 · 공사비를 계산한다.
데이터 형식은 팀 문서 「반응형외피 데이터 형식」을 따른다.

## 파일

| 파일 | 내용 |
| --- | --- |
| `index.html` | 웹 화면 (입력, 결과 카드, 대안 비교, 입면별 표, JSON 내려받기) |
| `engine.js` | 계산 엔진. 엑셀 7·8·9·10·13번 시트와 같은 식 |
| `geo.js` | 브이월드 주소 검색 · 건물 외곽선 · 외곽선 → 입면 변환 |
| `unity.js` | Unity WebGL 빌드 불러오기 (`unity/Build/`) |
| `features.js` | 하루 재생 평면도, 누적 순이익 · 민감도, 연간 히트맵, 인쇄, 공유 링크 |

## 화면 기능

- **하루 재생**: 날짜 · 시각 슬라이더(또는 재생 버튼)로 입면별 루버 평면도가 바뀐다. 춘분 · 하지 · 추분 · 동지 버튼. Unity가 안 될 때 시연 백업.
- **누적 순이익 · 민감도**: 통유리 대비 연도별 누적 순이익 그래프. 단가 배율 · 전기요금 · 인상률 · 유지비율 슬라이더를 움직이면 손익분기가 바로 바뀐다.
- **연간 히트맵**: 입면별로 월 × 시각(각 달 15일, 30분 간격)의 닫힘 · 열림 · 겨울 모드를 색으로 표시.
- **인쇄 / PDF**: 오른쪽 결과만 A4로 인쇄. 브라우저 인쇄 창에서 "PDF로 저장"을 고른다.
- **링크 복사**: 지금 입력값을 주소 뒤(`#s=…`)에 담은 링크. 받는 사람이 열면 같은 결과가 나온다. 인증키는 링크에 들어가지 않는다.
| `test_engine.js` | 엑셀 임시값과 같은 숫자가 나오는지 확인 (`node test_engine.js`) |
| `serve.js` | 로컬 서버 (`node serve.js` → http://localhost:8080) |

## 실행

- 로컬: 이 폴더에서 `node serve.js` → 브라우저로 http://localhost:8080
  (Unity WebGL은 HTML 파일 더블클릭으로는 안 열린다)
- 깃허브 페이지: 이 폴더를 저장소에 올리고 Settings → Pages → 브랜치 선택. 서버 없이 그대로 동작한다.

## 일사량 출처 3가지

1. **간이식 (맑은 날)**: 엔진이 1년치 태양 위치를 10분 간격으로 계산. 직달 일사만, 맑은 날 비율 0.6, 기상 데이터 · 그림자 미반영.
2. **Unity 결과**: Unity가 보낸 `solar_result`로 계산. 기상 데이터 · 그림자 반영값.
3. **엑셀 검증 모드**: 엑셀 가정값(일사량 700, 차양계수)으로 계산. 엑셀과 같은 숫자가 나오는지 확인용.

## Unity 연결

**Unity 팀은 저장소의 [`unity-bridge/`](../unity-bridge/README.md) 폴더를 쓰면 된다** (C# 스크립트 · .jslib · 적용 방법). 빌드를 넣을 때는 `unity/Build/`에 복사하고 `unity.js`의 `NAME`을 맞춘다. 아래는 원리 설명.

웹 → Unity: 계산할 때 웹이 아래를 호출한다. Unity 씬에 이름이 `LouverBridge`인 오브젝트를 두고 `OnSiteInput(string json)`을 만든다.

```js
unityInstance.SendMessage('LouverBridge', 'OnSiteInput', JSON.stringify(site_input));
```

Unity 로더가 만든 인스턴스를 `window.unityInstance`에 넣어 둔다:

```js
createUnityInstance(canvas, config).then(i => { window.unityInstance = i; });
```

Unity → 웹: `Assets/Plugins/WebGL/LouverBridge.jslib`

```js
mergeInto(LibraryManager.library, {
  SendSolarResult: function (ptr) { window.LouverBridge.receiveSolarResult(UTF8ToString(ptr)); }
});
```

C# 쪽:

```csharp
using System.Runtime.InteropServices;
using UnityEngine;

public class LouverBridge : MonoBehaviour {
  [DllImport("__Internal")] private static extern void SendSolarResult(string json);
  public void OnSiteInput(string json) {
    // 1) json(site_input)을 읽어 입면 · 루버 배치
    // 2) 기상 데이터 · 그림자로 입면별 일사량 계산
    // 3) solar_result JSON을 만들어 돌려준다
    // SendSolarResult(resultJson);
  }
}
```

## 깃허브 페이지에 Unity 올릴 때

Player Settings → Publishing Settings → Compression Format을 **Disabled**로 하거나 **Decompression Fallback**을 켠다. 안 그러면 로딩에서 멈춘다.

## 2단계: 지도에서 건물 고르기 (브이월드)

`geo.js` + 화면 맨 위 "0. 지도에서 건물 고르기".

1. 브이월드 인증키를 넣고 저장 (이 브라우저에만 저장됨)
2. 주소 검색 또는 지도에서 건물 클릭 → 도로명주소건물(`LT_C_SPBD`)의 외곽선과 지상층수(`gro_flo_co`)를 불러옴
3. "이 건물로 입면 만들기" → 외곽선의 변마다 입면 생성
   - 높이 = 지상층수 × 층고(기본 4m), 창 면적 = 변 길이 × 높이 × 창면적비
   - 방향이 거의 같은 이웃 변(12° 이내)은 합치고, 5m 미만 변은 뺀다
   - 북쪽 ±45° 입면은 루버 없음 (끌 수 있음)
4. 계산이 자동으로 다시 돈다

호출 경로

- localhost: `serve.js`가 `/vworld/...`를 브이월드로 중계한다 (브라우저 CORS 문제 없음). 키를 화면에 넣기 싫으면 `$env:VWORLD_KEY="키"; node serve.js`
- 깃허브 페이지: 브라우저가 JSONP(`callback`)로 직접 호출한다. **브이월드가 이 방식을 막으면** 무료 중계 서버(예: Cloudflare Workers)가 하나 필요하다. 키를 받은 뒤 깃허브 페이지에서 꼭 한 번 시험해 볼 것.

인증키 발급 시 서비스 URL에 `http://localhost:8080`과 깃허브 페이지 주소를 등록한다.

## 아직 안 된 것

- 곡면 · 복잡한 매스는 외곽선을 직선 변으로 근사
- 실제 창 배치는 데이터가 없어 창면적비로 가정
- 컷오프는 계절별 고정값(3~5월 30°, 6~8월 60°, 9~11월 45°, 12~2월 30°)
