// 명령줄 빌드: Unity.exe -batchmode -quit -projectPath <프로젝트> -executeMethod WebGLBuild.Build
// 결과: 프로젝트 옆 WebGLBuild/louver/Build/louver.loader.js 등 (웹 검토 도구 docs/unity/Build 에 그대로 복사)
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class WebGLBuild
{
    public static void Build()
    {
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled; // 깃허브 페이지에서 바로 열리게
        PlayerSettings.WebGL.decompressionFallback = false;
        string[] scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
        string outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "WebGLBuild", "louver"));
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = outDir,
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        });
        Debug.Log($"[WebGLBuild] {report.summary.result} · {report.summary.totalSize / 1048576f:0.0} MB · {outDir}");
        if (Application.isBatchMode) EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
    }
}
