// 외관 · 실내 카메라를 자동으로 만들어 LouverBridge 에 연결한다 (씬 파일을 고치지 않아도 됨)
// - 씬이 열리면 스스로 생긴다 (RuntimeInitializeOnLoadMethod). 씬에 이미 붙어 있으면 그것을 쓴다
// - 외관: 건물 전체가 보이게 남서쪽 위에서 바라봄. 마우스 끌기 = 돌리기, 휠 = 확대 · 축소
// - 실내: interiorFloor 층 남서쪽 모서리 안쪽에서 창(남서쪽)을 바라봄
// 좌표: Unity 북쪽 = +Z, 동쪽 = +X, 위 = +Y
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

public class LouverViewSetup : MonoBehaviour
{
    [Tooltip("실내 카메라를 둘 층 (서우 실내 = 9층)")] public int interiorFloor = 9;
    [Tooltip("층고 (m)")] public float floorHeightM = 4.2f;
    [Tooltip("실내 카메라를 모서리에서 안쪽으로 들일 거리 (m)")] public float interiorInsetM = 4f;
    [Tooltip("눈높이 (m)")] public float eyeHeightM = 1.5f;
    public Camera exteriorCamera;
    public Camera interiorCamera;

    Vector3 target;       // 외관 카메라가 바라보는 점 (건물 중심)
    float distance, yaw = 225f, pitch = 22f;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Boot()
    {
        if (FindAnyObjectByType<LouverViewSetup>() == null) new GameObject("LouverViewSetup").AddComponent<LouverViewSetup>();
    }

    void Start()
    {
        var rig = FindAnyObjectByType<LouverRig>();
        // 루버 날 범위 = 타워. (모델 전체는 지형 블록 · 주변 건물까지 들어 있어 너무 크다)
        Bounds all = BoundsUnder(rig != null && rig.louverRoot != null ? rig.louverRoot : null);
        float groundY = GroundY(all);

        // ---- 외관 카메라 ----
        if (exteriorCamera == null) exteriorCamera = Camera.main;
        if (exteriorCamera == null) exteriorCamera = MakeCamera("ExteriorCamera", 45f, 0.3f);
        if (FindAnyObjectByType<AudioListener>() == null) exteriorCamera.gameObject.AddComponent<AudioListener>();
        target = all.center;
        distance = Mathf.Max(30f, all.extents.magnitude * 1.8f);
        exteriorCamera.farClipPlane = distance * 6f;
        PlaceExterior();

        // ---- 실내 카메라 ----
        if (interiorCamera == null) interiorCamera = MakeCamera("InteriorCamera", 70f, 0.05f);
        float floorY = groundY + (interiorFloor - 1) * floorHeightM;
        Bounds slice = BladeSlice(rig, floorY, floorY + floorHeightM, all);
        Vector3 corner = new Vector3(slice.min.x, floorY + eyeHeightM, slice.min.z);
        interiorCamera.transform.position = corner + new Vector3(interiorInsetM, 0f, interiorInsetM);
        interiorCamera.transform.rotation = Quaternion.LookRotation(new Vector3(-1f, -0.08f, -1f));
        interiorCamera.farClipPlane = distance * 6f;
        interiorCamera.enabled = false;

        var bridge = FindAnyObjectByType<LouverBridge>();
        if (bridge != null)
        {
            bridge.exteriorCamera = exteriorCamera;
            bridge.interiorCamera = interiorCamera;
            bridge.SetView(bridge.CurrentView);
        }
        Debug.Log($"[LouverViewSetup] 바닥 {groundY:0.0} · 9층 바닥 {floorY:0.0} · 타워 {slice.min}~{slice.max} · 건물 크기 {all.size} · 외관 거리 {distance:0} m · 실내 {interiorFloor}층 {interiorCamera.transform.position}");
    }

    void LateUpdate()
    {
        if (exteriorCamera == null || !exteriorCamera.enabled) return;
#if ENABLE_INPUT_SYSTEM
        var m = Mouse.current;
        if (m == null) return;
        if (m.leftButton.isPressed)
        {
            Vector2 d = m.delta.ReadValue();
            yaw += d.x * 0.25f;
            pitch = Mathf.Clamp(pitch - d.y * 0.25f, 2f, 80f);
        }
        float wheel = m.scroll.ReadValue().y;
        if (Mathf.Abs(wheel) > 0.01f) distance = Mathf.Clamp(distance * (wheel > 0 ? 0.9f : 1.1f), 10f, exteriorCamera.farClipPlane / 2f);
        PlaceExterior();
#endif
    }

    void PlaceExterior()
    {
        Quaternion q = Quaternion.Euler(pitch, yaw, 0f);
        exteriorCamera.transform.position = target - q * Vector3.forward * distance;
        exteriorCamera.transform.rotation = q;
    }

    // 타워 1층 바닥 높이: 날 아래에서 땅으로 광선을 쏴 맞는 곳. 못 맞추면 날 범위의 맨 아래
    static float GroundY(Bounds b)
    {
        var start = new Vector3(b.center.x, b.min.y + 1f, b.min.z - 3f);
        if (Physics.Raycast(start, Vector3.down, out var hit, 200f)) return Mathf.Min(hit.point.y, b.min.y);
        return b.min.y;
    }

    static Camera MakeCamera(string name, float fov, float near)
    {
        var go = new GameObject(name);
        var cam = go.AddComponent<Camera>();
        cam.fieldOfView = fov;
        cam.nearClipPlane = near;
        cam.clearFlags = CameraClearFlags.Skybox;
        return cam;
    }

    // 건물(루버 모델) 전체 범위. 못 찾으면 씬의 모든 렌더러
    static Bounds BoundsUnder(Transform root)
    {
        var rs = root != null ? root.GetComponentsInChildren<Renderer>() : FindObjectsByType<Renderer>();
        Bounds b = new Bounds(Vector3.zero, Vector3.one * 10f);
        bool first = true;
        foreach (var r in rs) { if (first) { b = r.bounds; first = false; } else b.Encapsulate(r.bounds); }
        return b;
    }

    // 그 층 높이에 있는 루버 날들의 범위 = 그 층 타워의 바깥 외곽 (저층부보다 좁다)
    static Bounds BladeSlice(LouverRig rig, float y0, float y1, Bounds fallback)
    {
        if (rig == null || rig.louverRoot == null) return fallback;
        Bounds b = default; bool first = true;
        foreach (var r in rig.louverRoot.GetComponentsInChildren<Renderer>())
        {
            float cy = r.bounds.center.y;
            if (cy < y0 || cy > y1) continue;
            if (first) { b = r.bounds; first = false; } else b.Encapsulate(r.bounds);
        }
        return first ? fallback : b;
    }
}
