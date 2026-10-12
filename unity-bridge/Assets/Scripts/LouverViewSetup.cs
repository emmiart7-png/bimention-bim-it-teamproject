// 외관 · 실내 카메라를 자동으로 만들어 LouverBridge 에 연결한다 (씬 파일을 고치지 않아도 됨)
// - 씬이 열리면 스스로 생긴다 (RuntimeInitializeOnLoadMethod). 씬에 이미 붙어 있으면 그것을 쓴다
// - 외관: 실내 카메라 층의 남서쪽 모서리를 가까이서 바라봄 (날이 보이게). 마우스 끌기 = 돌리기, 휠 = 확대 · 축소
// - 실내: interiorFloor 층 남서쪽 모서리 안쪽에서 창(남서쪽)을 바라봄
// 좌표: Unity 북쪽 = +Z, 동쪽 = +X, 위 = +Y
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

public class LouverViewSetup : MonoBehaviour
{
    [Tooltip("실내 카메라를 둘 층 (서우 실내 = 9층)")] public int interiorFloor = 9;
    [Tooltip("층고 (m)")] public float floorHeightM = 4.2f;
    [Tooltip("실내 카메라를 모서리에서 안쪽으로 들일 거리 (m)")] public float interiorInsetM = 4f;
    [Tooltip("눈높이 (m)")] public float eyeHeightM = 1.5f;
    [Tooltip("외관 시작 거리 (m). 휠로 바꿀 수 있음")] public float startDistanceM = 260f;
    [Tooltip("루버 날 색 (유리와 구분되게)")] public Color bladeColor = new Color(0.12f, 0.31f, 0.55f);
    [Tooltip("날 색 덮어쓰기")] public bool tintBlades = true;
    public Camera exteriorCamera;
    public Camera interiorCamera;

    Vector3 target;       // 외관 카메라가 바라보는 점 (건물 중심)
    float distance, yaw = 80f, pitch = 25f;   // 카메라가 타워 서쪽 위에서 동쪽을 바라봄 (주변 건물에 덜 가림)

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Boot()
    {
        if (FindAnyObjectByType<LouverViewSetup>() == null) new GameObject("LouverViewSetup").AddComponent<LouverViewSetup>();
    }

    void Start()
    {
        // 화질: 웹(WebGL)은 Mobile 설정을 써서 안티에일리어싱이 꺼져 있고 해상도가 0.8 이라 얇은 날이 지글거린다
        if (GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset urp) { urp.msaaSampleCount = 4; urp.renderScale = 1f; }
        var rig = FindAnyObjectByType<LouverRig>();
        // 루버 날 범위 = 타워. (모델 전체는 지형 블록 · 주변 건물까지 들어 있어 너무 크다)
        Bounds all = BoundsUnder(rig != null && rig.louverRoot != null ? rig.louverRoot : null);
        float groundY = all.min.y;   // 1층 바닥 = 루버 날의 맨 아래 (지형 블록은 더 낮아 쓰지 않음)

        // ---- 외관 카메라 ----
        if (exteriorCamera == null) exteriorCamera = Camera.main;
        if (exteriorCamera == null) exteriorCamera = MakeCamera("ExteriorCamera", 45f, 0.3f);
        if (FindAnyObjectByType<AudioListener>() == null) exteriorCamera.gameObject.AddComponent<AudioListener>();

        // ---- 실내 카메라 ----
        if (interiorCamera == null) interiorCamera = MakeCamera("InteriorCamera", 70f, 0.05f);
        float floorY = groundY + (interiorFloor - 1) * floorHeightM;
        Bounds slice = BladeSlice(rig, floorY, floorY + floorHeightM, all);
        Vector3 corner = new Vector3(slice.min.x, floorY + eyeHeightM, slice.min.z);
        interiorCamera.transform.position = corner + new Vector3(interiorInsetM, 0f, interiorInsetM);
        interiorCamera.transform.rotation = Quaternion.LookRotation(new Vector3(-1f, -0.08f, -1f));
        interiorCamera.farClipPlane = 2000f;   // (distance 는 아래에서 정해지므로 쓰지 않음)
        interiorCamera.enabled = false;

        // 외관 시작: 타워 중간 높이를 남남서쪽 위에서 (주변 건물 위로). 휠로 가까이 가면 날이 하나하나 보인다
        target = new Vector3(all.center.x, all.min.y + all.size.y * 0.55f, all.center.z);
        distance = startDistanceM;
        exteriorCamera.farClipPlane = Mathf.Max(2000f, all.extents.magnitude * 12f);
        PlaceExterior();
        foreach (var cam in new[] { exteriorCamera, interiorCamera }) CleanCamera(cam);
        if (tintBlades && rig != null && rig.louverRoot != null) TintBlades(rig.louverRoot, bladeColor);

        // 팀 v8 LouverPerformance (노이즈 · 끊김 줄이기): 씬에 없으면 붙이고, 외관 카메라 · 웹 화면 버튼에 연결
        var perf = FindAnyObjectByType<LouverPerformance>();
        if (perf == null) perf = new GameObject("LouverPerformance").AddComponent<LouverPerformance>();
        perf.cam = exteriorCamera;

        var bridge = FindAnyObjectByType<LouverBridge>();
        if (bridge != null)
        {
            bridge.exteriorCamera = exteriorCamera;
            bridge.interiorCamera = interiorCamera;
            bridge.onView.AddListener(perf.OnViewChanged);   // 실내 · 나란히면 날 그림자 켜고 면 끄기 멈춤
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

    // 주변 건물에 가리지 않는 방향 고르기: 남쪽에서 보는 방향부터 차례로 시험해 타워까지 시야가 트인 첫 방향
    void PickClearView()
    {
        float[] yaws = { 20f, 0f, 40f, -20f, 60f, -40f, 80f, -60f, 100f, -80f };
        float[] pitches = { 35f, 45f, 55f };   // 주변 건물 위로 내려다보게
        foreach (float p in pitches)
            foreach (float y in yaws)
            {
                Quaternion q = Quaternion.Euler(p, y, 0f);
                Vector3 eye = target - q * Vector3.forward * distance;
                if (!Physics.Linecast(eye, target, out var hit) || hit.distance > distance - 20f) { yaw = y; pitch = p; return; }
            }
        pitch = 55f; // 모두 막히면 위에서 내려다봄
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

    // 필름 그레인 · 피사계 심도 같은 후처리를 끄고, 가장자리 계단 현상을 줄인다
    static void CleanCamera(Camera cam)
    {
        cam.allowMSAA = true;
        var d = cam.GetUniversalAdditionalCameraData();
        d.renderPostProcessing = false;
        d.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
        d.antialiasingQuality = AntialiasingQuality.High;
    }

    // 날을 한 가지 진한 색 · 무광 재질로 바꾼다 (유리 반사와 섞여 안 보이던 문제)
    // Unity 6 의 GPU Resident Drawer 는 MaterialPropertyBlock 을 무시할 수 있어 재질 자체를 바꾼다
    static void TintBlades(Transform root, Color c)
    {
        var rs = root.GetComponentsInChildren<Renderer>();
        if (rs.Length == 0) return;
        var shader = Shader.Find("Universal Render Pipeline/Lit");
        var m = shader != null ? new Material(shader) : new Material(rs[0].sharedMaterial);
        m.name = "LouverBlade_Tint";
        if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
        if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.15f);
        if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0f);
        foreach (var r in rs)
        {
            var mats = r.sharedMaterials;
            for (int i = 0; i < mats.Length; i++) mats[i] = m;
            r.sharedMaterials = mats;
        }
        Debug.Log($"[LouverViewSetup] 날 {rs.Length}개 색 변경");
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
