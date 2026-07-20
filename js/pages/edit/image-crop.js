// ===== 圖片裁切/縮放工具 =====
// 上傳頭像/Logo 後，跳出這個視窗讓使用者拖曳調整位置、用滑桿縮放大小，
// 選好範圍再存成圖片，而不是整張圖直接自動置中壓縮（原本使用者完全沒辦法自己選要保留哪個部分）。
//
// 用法：const blob = await openImageCropper(file, opts); // 使用者按「取消」則回傳 null
// opts = {
//   shape: 'circle' | 'rect'（只影響裁切窗口的視覺樣式，circle 用於頭像，rect 用於 Logo）
//   titleZh, titleEn：視窗標題
//   aspectPresets: [{ labelZh, labelEn, ratio }]，ratio 為 null 代表「原始比例」（依圖片本身長寬比）
//     頭像固定只給一個 1:1 選項（畫面上不顯示切換按鈕）；Logo 給多個選項可切換。
// }

let __cropState = null;

function __cropComputeFrameSize(ratio) {
  const maxSide = 260;
  let fw, fh;
  if (ratio >= 1) {
    fw = maxSide;
    fh = maxSide / ratio;
  } else {
    fh = maxSide;
    fw = maxSide * ratio;
  }
  return { fw, fh };
}

function __cropClampAndApply() {
  const s = __cropState;
  if (!s) return;
  const dispScale = s.baseScale * s.zoom;
  const dispW = s.naturalW * dispScale;
  const dispH = s.naturalH * dispScale;

  const minLeft = s.frameW - dispW; // <= 0
  const minTop = s.frameH - dispH;
  s.imgLeft = Math.min(0, Math.max(minLeft, s.imgLeft));
  s.imgTop = Math.min(0, Math.max(minTop, s.imgTop));

  s.imgEl.style.width = dispW + 'px';
  s.imgEl.style.height = dispH + 'px';
  s.imgEl.style.transform = 'translate(' + s.imgLeft + 'px,' + s.imgTop + 'px)';
}

// 取得目前畫面「窗口正中央」對應到原圖上的哪一點（縮放時要保持這一點還在正中央，體感才自然）
function __cropGetCenterNaturalPoint() {
  const s = __cropState;
  const dispScale = s.baseScale * s.zoom;
  return {
    natX: (s.frameW / 2 - s.imgLeft) / dispScale,
    natY: (s.frameH / 2 - s.imgTop) / dispScale
  };
}

function __cropSetCenterNaturalPoint(natX, natY) {
  const s = __cropState;
  const dispScale = s.baseScale * s.zoom;
  s.imgLeft = s.frameW / 2 - natX * dispScale;
  s.imgTop = s.frameH / 2 - natY * dispScale;
}

function __cropApplyAspectPreset(index) {
  const s = __cropState;
  const preset = s.opts.aspectPresets[index];
  s.presetIndex = index;
  s.ratio = (preset.ratio == null) ? (s.naturalW / s.naturalH) : preset.ratio;

  const { fw, fh } = __cropComputeFrameSize(s.ratio);
  s.frameW = fw;
  s.frameH = fh;
  s.frameEl.style.width = fw + 'px';
  s.frameEl.style.height = fh + 'px';
  s.frameEl.style.borderRadius = (s.opts.shape === 'circle') ? '50%' : '12px';

  // 換比例後重新置中、重設縮放，避免殘留上一個比例的位置換算錯亂
  s.zoom = 1;
  if (s.zoomSlider) s.zoomSlider.value = 100;
  s.baseScale = Math.max(fw / s.naturalW, fh / s.naturalH);
  s.imgLeft = (fw - s.naturalW * s.baseScale) / 2;
  s.imgTop = (fh - s.naturalH * s.baseScale) / 2;
  __cropClampAndApply();

  // 更新比例按鈕的選中樣式
  const picker = document.getElementById('imageCropAspectPicker');
  if (picker) {
    Array.from(picker.children).forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });
  }
}

function __cropOnPointerDown(e) {
  const s = __cropState;
  if (!s) return;
  s.dragging = true;
  s.dragStartX = e.clientX;
  s.dragStartY = e.clientY;
  s.dragStartLeft = s.imgLeft;
  s.dragStartTop = s.imgTop;
  try { s.frameEl.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();
}

function __cropOnPointerMove(e) {
  const s = __cropState;
  if (!s || !s.dragging) return;
  s.imgLeft = s.dragStartLeft + (e.clientX - s.dragStartX);
  s.imgTop = s.dragStartTop + (e.clientY - s.dragStartY);
  __cropClampAndApply();
}

function __cropOnPointerUp(e) {
  const s = __cropState;
  if (!s) return;
  s.dragging = false;
  try { s.frameEl.releasePointerCapture(e.pointerId); } catch (err) {}
}

function __cropOnZoomInput(e) {
  const s = __cropState;
  if (!s) return;
  const center = __cropGetCenterNaturalPoint();
  s.zoom = Math.max(1, parseInt(e.target.value, 10) / 100 || 1);
  __cropSetCenterNaturalPoint(center.natX, center.natY);
  __cropClampAndApply();
}

// 把目前裁切窗口看到的範圍畫到輸出用的 canvas，輸出成 PNG blob（保留透明背景，給 Logo 用很重要）
function __cropRenderOutputBlob() {
  const s = __cropState;
  return new Promise((resolve) => {
    const dispScale = s.baseScale * s.zoom;
    const srcX = -s.imgLeft / dispScale;
    const srcY = -s.imgTop / dispScale;
    const srcW = s.frameW / dispScale;
    const srcH = s.frameH / dispScale;

    const MAX_OUT = 1600;
    let outW = srcW;
    let outH = srcH;
    if (Math.max(outW, outH) > MAX_OUT) {
      const scale = MAX_OUT / Math.max(outW, outH);
      outW = Math.round(outW * scale);
      outH = Math.round(outH * scale);
    }
    outW = Math.max(1, Math.round(outW));
    outH = Math.max(1, Math.round(outH));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.clearRect(0, 0, outW, outH);
    ctx.drawImage(s.rawImg, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function __cropCleanup() {
  const s = __cropState;
  if (!s) return;
  try { if (s.objectUrl) URL.revokeObjectURL(s.objectUrl); } catch (e) {}
  s.frameEl.removeEventListener('pointerdown', __cropOnPointerDown);
  s.frameEl.removeEventListener('pointermove', __cropOnPointerMove);
  s.frameEl.removeEventListener('pointerup', __cropOnPointerUp);
  s.frameEl.removeEventListener('pointercancel', __cropOnPointerUp);
  if (s.zoomSlider) s.zoomSlider.removeEventListener('input', __cropOnZoomInput);
  __cropState = null;
}

function openImageCropper(file, opts) {
  opts = opts || {};
  const overlay = document.getElementById('imageCropOverlay');
  const frameEl = document.getElementById('imageCropFrame');
  const imgEl = document.getElementById('imageCropImg');
  const titleEl = document.getElementById('imageCropTitle');
  const picker = document.getElementById('imageCropAspectPicker');
  const zoomSlider = document.getElementById('imageCropZoomSlider');
  const confirmBtn = document.getElementById('imageCropConfirmBtn');
  const cancelBtn = document.getElementById('imageCropCancelBtn');
  const closeBtn = document.getElementById('imageCropCloseBtn');

  // 保底：萬一裁切視窗的 DOM 不存在（理論上不會發生），直接跳過裁切、把原始檔案交給後續壓縮流程
  if (!overlay || !frameEl || !imgEl || !titleEl || !zoomSlider || !confirmBtn || !cancelBtn) {
    return Promise.resolve(file);
  }

  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';

  if (!file || !file.type || !file.type.startsWith('image/')) {
    alert(currentLang === 'zh' ? '這不是圖片檔，請改選擇 JPG/PNG/WebP。' : 'Not an image file. Please choose JPG/PNG/WebP.');
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const rawImg = new Image();
    rawImg.onload = function () {
      const aspectPresets = (opts.aspectPresets && opts.aspectPresets.length)
        ? opts.aspectPresets
        : [{ labelZh: '原始比例', labelEn: 'Original', ratio: null }];

      __cropState = {
        opts,
        rawImg,
        objectUrl,
        frameEl,
        imgEl,
        zoomSlider,
        naturalW: rawImg.naturalWidth || rawImg.width || 1,
        naturalH: rawImg.naturalHeight || rawImg.height || 1,
        zoom: 1,
        imgLeft: 0,
        imgTop: 0,
        dragging: false,
        presetIndex: 0
      };

      titleEl.textContent = currentLang === 'zh' ? (opts.titleZh || '調整圖片') : (opts.titleEn || opts.titleZh || 'Adjust Image');
      imgEl.src = objectUrl;

      // 比例選擇按鈕：只有一個選項時（頭像固定 1:1）不顯示這排，減少長輩要理解的東西
      if (picker) {
        picker.innerHTML = '';
        if (aspectPresets.length > 1) {
          aspectPresets.forEach((preset, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'image-crop-aspect-btn' + (idx === 0 ? ' active' : '');
            btn.textContent = currentLang === 'zh' ? (preset.labelZh || '') : (preset.labelEn || preset.labelZh || '');
            btn.onclick = function () { __cropApplyAspectPreset(idx); };
            picker.appendChild(btn);
          });
          picker.style.display = 'flex';
        } else {
          picker.style.display = 'none';
        }
      }
      __cropState.opts.aspectPresets = aspectPresets;

      zoomSlider.value = 100;
      frameEl.addEventListener('pointerdown', __cropOnPointerDown);
      frameEl.addEventListener('pointermove', __cropOnPointerMove);
      frameEl.addEventListener('pointerup', __cropOnPointerUp);
      frameEl.addEventListener('pointercancel', __cropOnPointerUp);
      zoomSlider.addEventListener('input', __cropOnZoomInput);

      __cropApplyAspectPreset(0);

      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';

      function finish(resultBlob) {
        overlay.classList.remove('show');
        document.body.style.overflow = '';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
        overlay.onclick = null;
        __cropCleanup();
        resolve(resultBlob);
      }

      confirmBtn.onclick = async function () {
        const blob = await __cropRenderOutputBlob();
        finish(blob);
      };
      cancelBtn.onclick = function () { finish(null); };
      if (closeBtn) closeBtn.onclick = function () { finish(null); };
      overlay.onclick = function (event) {
        if (event.target === overlay) finish(null);
      };
    };
    rawImg.onerror = function () {
      try { URL.revokeObjectURL(objectUrl); } catch (e) {}
      alert(currentLang === 'zh' ? '圖片讀取失敗，請換一張圖片再試一次。' : 'Failed to load the image. Please try another one.');
      resolve(null);
    };
    rawImg.src = objectUrl;
  });
}
