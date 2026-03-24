// ===== 圖片懶載入工具 =====

// 使用 Intersection Observer 實現懶載入
const _lazyLoadObserver = (function() {
  if (typeof IntersectionObserver === 'undefined') return null;
  
  return new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
          img.classList.remove('lazy');
          img.classList.add('lazy-loaded');
        }
        observer.unobserve(img);
      }
    });
  }, {
    rootMargin: '50px 0px',
    threshold: 0.01
  });
})();

// 設定圖片為懶載入（用於動態建立的圖片）
export function setupLazyImage(img, src) {
  if (!img || !src) return;
  
  // 如果瀏覽器原生支援 loading="lazy"，直接使用
  if ('loading' in HTMLImageElement.prototype) {
    img.loading = 'lazy';
    img.src = src;
    return;
  }
  
  // 否則使用 Intersection Observer
  if (_lazyLoadObserver) {
    img.dataset.src = src;
    img.classList.add('lazy');
    _lazyLoadObserver.observe(img);
  } else {
    // 降級：直接載入
    img.src = src;
  }
}

// 為頁面上所有 data-src 圖片啟用懶載入
export function initLazyImages() {
  if (!_lazyLoadObserver) return;
  
  document.querySelectorAll('img[data-src]').forEach(img => {
    _lazyLoadObserver.observe(img);
  });
}
