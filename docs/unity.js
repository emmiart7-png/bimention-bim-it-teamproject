/*
 * Unity WebGL 빌드 불러오기
 * 빌드 폴더의 Build/ 안 파일 이름이 "<NAME>.loader.js" 이면 아래 NAME 을 그 이름으로 바꾼다.
 * 빌드는 docs/unity/Build/ 에 넣는다. 파일이 없으면 자리 표시 문구가 그대로 남는다.
 */
(function () {
  'use strict';
  const UNITY = {
    NAME: 'unity',            // Build/unity.loader.js → 'unity'
    BUILD_URL: 'unity/Build',
    COMPANY: 'Team', PRODUCT: 'ReactiveFacade', VERSION: '0.1'
  };
  const box = document.getElementById('unity');
  if (!box) return;
  const loaderUrl = `${UNITY.BUILD_URL}/${UNITY.NAME}.loader.js`;
  const s = document.createElement('script');
  s.src = loaderUrl;
  s.onload = () => {
    box.innerHTML = '<canvas id="unity-canvas" tabindex="-1" style="width:100%;aspect-ratio:16/9;background:#0A1317;border-radius:12px"></canvas><div id="unity-progress" class="muted" style="margin-top:6px">Unity 불러오는 중… 0%</div>';
    box.style.display = 'block'; box.style.padding = '0'; box.style.background = 'none'; box.style.border = 'none';
    const canvas = document.getElementById('unity-canvas');
    const ext = name => `${UNITY.BUILD_URL}/${UNITY.NAME}.${name}`;
    // 압축 설정에 따라 파일 이름 끝이 .gz/.br 일 수 있다 → Decompression Fallback 빌드는 .unityweb
    const config = {
      dataUrl: ext('data'), frameworkUrl: ext('framework.js'), codeUrl: ext('wasm'),
      streamingAssetsUrl: 'unity/StreamingAssets', companyName: UNITY.COMPANY, productName: UNITY.PRODUCT, productVersion: UNITY.VERSION
    };
    if (window.UNITY_FILE_SUFFIX) for (const k of ['dataUrl', 'frameworkUrl', 'codeUrl']) config[k] += window.UNITY_FILE_SUFFIX;
    window.createUnityInstance(canvas, config, p => { const el = document.getElementById('unity-progress'); if (el) el.textContent = `Unity 불러오는 중… ${Math.round(p * 100)}%`; })
      .then(inst => { window.unityInstance = inst; const el = document.getElementById('unity-progress'); if (el) el.textContent = 'Unity 연결됨 · 웹의 건물 · 하루 재생 시각이 함께 반영됩니다'; })
      .catch(err => { box.innerHTML = `<div class="warn">Unity를 불러오지 못했습니다: ${String(err).replace(/</g, '&lt;')}<br>빌드 이름(unity.js의 NAME)과 압축 설정(Disabled 또는 Decompression Fallback)을 확인하세요.</div>`; });
  };
  s.onerror = () => { /* 빌드가 아직 없음: 자리 표시 문구 유지 */ };
  document.body.appendChild(s);
})();
