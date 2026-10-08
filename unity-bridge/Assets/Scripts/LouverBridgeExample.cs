// LouverBridge 를 기존 루버 제어 코드에 연결하는 예시.
// 주석의 "여기에" 부분만 팀의 실제 코드로 바꾸면 된다. Inspector 이벤트로 연결했다면 이 파일은 필요 없다.

using System;
using System.Collections.Generic;
using UnityEngine;

public class LouverBridgeExample : MonoBehaviour
{
    public LouverBridge bridge;

    private void OnEnable()
    {
        if (bridge == null) bridge = FindObjectOfType<LouverBridge>();
        bridge.onSiteInput.AddListener(OnSiteInput);
        bridge.onDateTime.AddListener(OnDateTime);
    }

    private void OnDisable()
    {
        if (bridge == null) return;
        bridge.onSiteInput.RemoveListener(OnSiteInput);
        bridge.onDateTime.RemoveListener(OnDateTime);
    }

    // 웹에서 건물을 고르거나 계산할 때마다 온다
    private void OnSiteInput(SiteInput s)
    {
        Debug.Log($"[예시] 위치 {s.site.lat_deg}, {s.site.lon_deg} · 입면 {s.facades.Length}개 · 겨울 모드 {s.winter_mode}");

        // 여기에 1) 위치(위도 · 경도)를 태양 위치 계산에 넣는다
        // 여기에 2) 입면 목록으로 건물 · 루버를 배치한다 (facade.louver == false 인 면은 루버 없음)
        foreach (var f in s.facades)
            Debug.Log($"  {f.id}: 방위 {f.azimuth_deg}°, 창 {f.window_area_m2}㎡, 루버 {(f.louver ? "있음" : "없음")}");

        // 여기에 3) 연간 일사량 계산이 끝나면 결과를 웹으로 보낸다 (계산이 길면 코루틴에서)
        // bridge.SendSolarResult(MakeResult(s));
    }

    // 웹의 "하루 재생" 슬라이더를 움직일 때마다 온다 (한국 시간)
    private void OnDateTime(DateTime t)
    {
        // 여기에 기존 날짜 · 시간 입력 함수를 호출한다. 예: sunController.SetTime(t);
        Debug.Log($"[예시] 시각 {t:yyyy-MM-dd HH:mm}");
    }

    // 결과 만들기 예시: 팀의 계산 값으로 채운다 (단위 kWh/㎡, 기간 합계)
    private SolarResult MakeResult(SiteInput s)
    {
        var list = new List<FacadeSolar>();
        foreach (var f in s.facades)
        {
            var fs = new FacadeSolar { id = f.id };
            // fs.cooling_season.bare_kwh_m2_yr = ...;            // 6~9월 통유리
            // fs.cooling_season.external_reactive_kwh_m2_yr = ...; // 6~9월 외부 반응형 루버를 지난 값
            // fs.cooling_season.external_fixed_kwh_m2_yr = ...;
            // fs.cooling_season.internal_reactive_kwh_m2_yr = ...;
            // fs.heating_season. ... (12~2월, 같은 방식)
            // fs.closed_hours_yr = ...; fs.blade_rotation_deg_yr = ...;
            list.Add(fs);
        }
        var r = new SolarResult { facades = list.ToArray() };
        r.meta.weather_source = "KMA_TMY";   // 실제 쓴 기상 데이터 이름
        r.meta.shading_included = true;
        return r;
    }
}
