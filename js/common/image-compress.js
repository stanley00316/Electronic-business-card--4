// ===== 圖片壓縮與 WebP 轉換工具 =====

// 壓縮圖片並轉換為 WebP 格式
// @param {File|Blob} file - 要壓縮的圖片檔案
// @param {Object} opts - 選項
//   - maxDim: 最大尺寸（預設 512）
//   - maxBytes: 最大檔案大小（預設 1MB）
//   - mime: 目標格式（預設 image/webp）
// @returns {Promise<{blob: Blob, contentType: string, ext: string, width: number, height: number}>}
export async function compressImageToWebP(file, opts) {
  const maxDim = Math.max(64, parseInt(opts?.maxDim || 512, 10) || 512);
  const maxBytes = Math.max(50 * 1024, parseInt(opts?.maxBytes || 1024 * 1024, 10) || 1024 * 1024);
  const targetMime = String(opts?.mime || 'image/webp');

  if (!file || (!file.type && !(file instanceof Blob))) {
    throw new Error('NOT_IMAGE');
  }
  
  // 檢查是否為圖片
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('NOT_IMAGE');
  }

  const imgUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = imgUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('LOAD_FAILED'));
    });

    const w0 = img.naturalWidth || img.width || 1;
    const h0 = img.naturalHeight || img.height || 1;

    let targetMaxDim = maxDim;
    let outMime = targetMime;
    let blob = null;
    let tw = 0;
    let th = 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });

    async function encodeAt(quality) {
      return await new Promise((resolve) => canvas.toBlob(resolve, outMime, quality));
    }

    // 嘗試多次壓縮直到符合大小限制
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, targetMaxDim / Math.max(w0, h0));
      tw = Math.max(1, Math.round(w0 * scale));
      th = Math.max(1, Math.round(h0 * scale));
      canvas.width = tw;
      canvas.height = th;
      ctx.clearRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);

      // 先試 webp，若瀏覽器不支援則改用 jpeg
      outMime = targetMime;
      let q = 0.9;
      blob = await encodeAt(q);
      if (!blob) {
        outMime = 'image/jpeg';
        q = 0.9;
        blob = await encodeAt(q);
      }
      if (!blob) throw new Error('ENCODE_FAILED');

      // 逐步降低品質直到符合大小限制
      while (blob.size > maxBytes && q > 0.3) {
        q -= 0.1;
        blob = await encodeAt(q);
        if (!blob) break;
      }

      if (blob && blob.size <= maxBytes) break;

      // 若仍然太大，縮小尺寸
      targetMaxDim = Math.floor(targetMaxDim * 0.75);
      if (targetMaxDim < 64) {
        throw new Error('TOO_LARGE');
      }
    }

    if (!blob || blob.size > maxBytes) {
      throw new Error('TOO_LARGE');
    }

    const ext = outMime === 'image/webp' ? 'webp' : (outMime === 'image/jpeg' ? 'jpg' : 'png');
    return { blob, contentType: outMime, ext, width: tw, height: th };
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

// 檢查瀏覽器是否支援 WebP
export function isWebPSupported() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
}
