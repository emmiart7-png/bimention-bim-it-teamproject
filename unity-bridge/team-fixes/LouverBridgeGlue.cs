using System;
using UnityEngine;

/// <summary>
/// 웹(LouverBridge)이 보내는 값을 우리 SunLouverController에 전달하는 접착 스크립트예요.
/// README 3번(기존 코드와 연결)을 이 스크립트가 대신해요. Inspector에서 이벤트를 끌어다 놓을 필요가 없어요.
///
/// 쓰는 법: LouverBridge가 붙은 오브젝트(또는 아무 오브젝트)에 이 스크립트를 붙이면 끝이에요.
///  - 웹 → "날짜·시각"이 오면 SunLouverController.SetDateTime(...)
///  - 웹 → "건물·입면·겨울 모드"가 오면 SetWinterMode(...), SetNorthLouver(...)
/// bridge와 controller 칸은 비워 두면 씬에서 자동으로 찾아요.
/// </summary>
public class LouverBridgeGlue : MonoBehaviour
{
    public LouverBridge bridge;
    public SunLouverController controller;

    void Awake()
    {
        if (bridge == null) bridge = FindObjectOfType<LouverBridge>();
        if (controller == null) controller = FindObjectOfType<SunLouverController>();
    }

    void OnEnable()
    {
        if (bridge == null || controller == null)
        {
            Debug.LogError("[LouverBridgeGlue] LouverBridge 또는 SunLouverController를 씬에서 못 찾았어요. 둘 다 씬에 있어야 해요.");
            return;
        }
        bridge.onSiteInput.AddListener(HandleSiteInput);
        bridge.onDateTime.AddListener(HandleDateTime);
        Debug.Log("[LouverBridgeGlue] 연결됨");
    }

    void OnDisable()
    {
        if (bridge == null) return;
        bridge.onSiteInput.RemoveListener(HandleSiteInput);
        bridge.onDateTime.RemoveListener(HandleDateTime);
    }

    // 웹 → Unity: 건물, 입면, 루버 사양, 겨울 모드
    // 이름이 LouverBridge.OnSiteInput 과 같으면 웹의 SendMessage 가 이 함수까지 부르려다 오류가 나서 Handle 로 바꿈
    void HandleSiteInput(SiteInput s)
    {
        if (s == null || controller == null) return;
        controller.SetWinterMode(s.winter_mode);
        if (s.facades != null)
        {
            foreach (var f in s.facades)
                if (f != null && f.id == "N") controller.SetNorthLouver(f.louver);   // 북면 루버 유무
        }
        Debug.Log("[LouverBridgeGlue] site_input: 겨울 모드 " + s.winter_mode + ", 입면 " + (s.facades != null ? s.facades.Length : 0) + "개");
    }

    // 웹 → Unity: 날짜·시각 (한국 시간)
    void HandleDateTime(DateTime t)
    {
        if (controller != null) controller.SetDateTime(t);
    }
}
