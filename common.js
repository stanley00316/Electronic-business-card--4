/**
 * 數位身分平台 - 共用模組
 * @version 2026.01.27
 * 
 * 功能：
 * - 語言切換（中/英）
 * - 主題管理（9 種主題）
 * - CSS 按需載入
 * - 錯誤監控（Sentry）
 * - 效能優化
 * - Service Worker 自動更新
 */

/* =========================================================================
 * Service Worker 自動更新監聽
 * 當 Service Worker 更新時，自動重新載入頁面以獲取最新版本
 * ========================================================================= */
(function initServiceWorkerUpdateListener() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'SW_UPDATED') {
        console.log('[SW] 檢測到新版本:', event.data.version);
        // 自動重新載入頁面以獲取最新版本
        window.location.reload();
      }
    });
  }
})();

/* =========================================================================
 * 底部導航欄點擊高亮效果
 * 在行動裝置上提供明顯的點擊回饋
 * ========================================================================= */
(function initNavTapEffect() {
  function setupNavTapEffect() {
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    
    if (navItems.length === 0) {
      setTimeout(setupNavTapEffect, 500);
      return;
    }
    
    navItems.forEach(function(item) {
      // 觸控開始時添加高亮
      item.addEventListener('touchstart', function() {
        this.classList.add('tapped');
      }, { passive: true });
      
      // 觸控結束時移除高亮
      item.addEventListener('touchend', function() {
        const el = this;
        setTimeout(function() {
          el.classList.remove('tapped');
        }, 300);
      }, { passive: true });
      
      // 觸控取消時移除高亮
      item.addEventListener('touchcancel', function() {
        this.classList.remove('tapped');
      }, { passive: true });
      
      // 滑鼠點擊支援
      item.addEventListener('mousedown', function() {
        this.classList.add('tapped');
      });
      
      item.addEventListener('mouseup', function() {
        const el = this;
        setTimeout(function() {
          el.classList.remove('tapped');
        }, 300);
      });
      
      item.addEventListener('mouseleave', function() {
        this.classList.remove('tapped');
      });
    });
  }
  
  // DOM 載入後執行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupNavTapEffect);
  } else {
    setupNavTapEffect();
  }
})();

/* =========================================================================
 * 錯誤監控設定 (Sentry Configuration)
 * 
 * 啟用步驟：
 * 1. 前往 https://sentry.io 註冊免費帳號
 * 2. 建立新專案，取得 DSN
 * 3. 將 DSN 填入下方 SENTRY_DSN
 * 4. 在 HTML 頁面 <head> 加入：
 *    <script src="https://browser.sentry-cdn.com/7.x/bundle.min.js"></script>
 * ========================================================================= */
const SENTRY_DSN = ''; // 填入你的 Sentry DSN，例如：https://xxx@xxx.ingest.sentry.io/xxx

// 初始化 Sentry（如果已配置）
(function initSentry() {
  if (!SENTRY_DSN) return;
  if (typeof Sentry === 'undefined') {
    console.warn('[Sentry] SDK 未載入，請在 HTML 加入 Sentry script');
    return;
  }
  
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: location.hostname.includes('github.io') ? 'production' : 'development',
      release: '2026.01.26',
      tracesSampleRate: 0.1, // 10% 的請求追蹤效能
      beforeSend(event) {
        // 過濾掉一些不重要的錯誤
        if (event.exception) {
          const msg = event.exception.values?.[0]?.value || '';
          // 忽略網路錯誤（這些通常是用戶端問題）
          if (msg.includes('Load failed') || msg.includes('NetworkError')) {
            return null;
          }
        }
        return event;
      }
    });
    console.log('[Sentry] 錯誤監控已啟用');
  } catch (e) {
    console.error('[Sentry] 初始化失敗', e);
  }
})();

// 全域錯誤捕獲（即使 Sentry 未啟用也會記錄到 console）
window.onerror = function(message, source, lineno, colno, error) {
  console.error('[Error]', { message, source, lineno, colno, error });
  // 如果 Sentry 已初始化，它會自動捕獲這個錯誤
  return false;
};

window.onunhandledrejection = function(event) {
  console.error('[Unhandled Promise Rejection]', event.reason);
  // 如果 Sentry 已初始化，它會自動捕獲這個錯誤
};

/* =========================================================================
 * 流量分析設定 (Analytics Configuration)
 * 
 * 支援的分析服務：
 * - Cloudflare Web Analytics: 免費、隱私友好、無 cookies
 * - Plausible: 隱私友好，免費自架或 $9/月
 * - Umami: 開源，可自架免費
 * - Google Analytics: 免費但較不隱私友好
 * ========================================================================= */
const ANALYTICS_CONFIG = {
  enabled: true, // 已啟用流量分析
  provider: 'cloudflare', // 'cloudflare', 'plausible', 'umami', 'ga'
  // Cloudflare Web Analytics 設定
  cloudflare: {
    token: '32d77b5b3e864374950c6bd32227e3c9'
  },
  // Plausible 設定（備用）
  plausible: {
    domain: 'stanley00316.github.io',
    scriptUrl: 'https://plausible.io/js/script.js'
  },
  // Umami 設定
  umami: {
    websiteId: '',
    scriptUrl: ''
  },
  // Google Analytics 設定
  ga: {
    measurementId: ''
  }
};

// 初始化流量分析（如果已配置）
(function initAnalytics() {
  if (!ANALYTICS_CONFIG.enabled) return;
  
  const provider = ANALYTICS_CONFIG.provider;
  
  // Cloudflare Web Analytics
  if (provider === 'cloudflare' && ANALYTICS_CONFIG.cloudflare.token) {
    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.setAttribute('data-cf-beacon', JSON.stringify({
      token: ANALYTICS_CONFIG.cloudflare.token
    }));
    document.head.appendChild(script);
    console.log('[Analytics] Cloudflare Web Analytics 已啟用');
  }
  
  // Plausible
  if (provider === 'plausible' && ANALYTICS_CONFIG.plausible.domain) {
    const script = document.createElement('script');
    script.defer = true;
    script.setAttribute('data-domain', ANALYTICS_CONFIG.plausible.domain);
    script.src = ANALYTICS_CONFIG.plausible.scriptUrl;
    document.head.appendChild(script);
    console.log('[Analytics] Plausible 已啟用');
  }
  
  // Umami
  if (provider === 'umami' && ANALYTICS_CONFIG.umami.websiteId) {
    const script = document.createElement('script');
    script.async = true;
    script.setAttribute('data-website-id', ANALYTICS_CONFIG.umami.websiteId);
    script.src = ANALYTICS_CONFIG.umami.scriptUrl;
    document.head.appendChild(script);
    console.log('[Analytics] Umami 已啟用');
  }
  
  // Google Analytics 4
  if (provider === 'ga' && ANALYTICS_CONFIG.ga.measurementId) {
    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_CONFIG.ga.measurementId}`;
    document.head.appendChild(gtagScript);
    
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', ANALYTICS_CONFIG.ga.measurementId);
    window.gtag = gtag;
    console.log('[Analytics] Google Analytics 已啟用');
  }
})();

// 自訂事件追蹤函數
function trackEvent(eventName, eventData = {}) {
  if (!ANALYTICS_CONFIG.enabled) return;
  
  const provider = ANALYTICS_CONFIG.provider;
  
  if (provider === 'plausible' && window.plausible) {
    window.plausible(eventName, { props: eventData });
  }
  
  if (provider === 'umami' && window.umami) {
    window.umami.track(eventName, eventData);
  }
  
  if (provider === 'ga' && window.gtag) {
    window.gtag('event', eventName, eventData);
  }
  
  console.log('[Analytics] Event:', eventName, eventData);
}

// 匯出追蹤函數供全域使用
window.trackEvent = trackEvent;

/* =========================================================================
 * 語言和主題管理
 * 優化：CSS 按需載入、主題預載入、效能改進
 * ========================================================================= */
function setLang(lang) {
  // 更新 body 的 class，讓 CSS 規則生效
  document.body.classList.remove('lang-zh', 'lang-en');
  document.body.classList.add('lang-' + lang);
  
  // 切換按鈕狀態（top-bar 中的按鈕）
  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('lang-active'));
  if (lang === 'zh') {
    const zhBtns = document.querySelectorAll('.lang-btn');
    if (zhBtns[0]) zhBtns[0].classList.add('lang-active');
  } else {
    const enBtns = document.querySelectorAll('.lang-btn');
    if (enBtns[1]) enBtns[1].classList.add('lang-active');
  }

  // 更新設定頁面的語言按鈕狀態
  const zhBtn = document.getElementById('langZhBtn');
  const enBtn = document.getElementById('langEnBtn');
  if (zhBtn && enBtn) {
    zhBtn.classList.remove('active');
    enBtn.classList.remove('active');
    if (lang === 'zh') {
      zhBtn.classList.add('active');
    } else {
      enBtn.classList.add('active');
    }
  }

  // 顯示 / 隱藏對應語系的元素
  // 由於已經更新了 body class，CSS 規則應該會自動生效
  // 但為了確保兼容性，我們仍然直接設置 display
  // 確保在所有元素上正確設置 display，避免空白畫面
  document.querySelectorAll('.lang-zh').forEach(el => {
    el.style.display = (lang === 'zh') ? 'block' : 'none';
  });
  document.querySelectorAll('.lang-en').forEach(el => {
    el.style.display = (lang === 'en') ? 'block' : 'none';
  });
  
  // 特別處理 settings-panel 內的元素，確保它們正確顯示
  document.querySelectorAll('.settings-panel .lang-zh').forEach(el => {
    el.style.display = (lang === 'zh') ? 'block' : 'none';
  });
  document.querySelectorAll('.settings-panel .lang-en').forEach(el => {
    el.style.display = (lang === 'en') ? 'block' : 'none';
  });
  
  // 底部導航欄標籤也需要切換
  document.querySelectorAll('.bottom-nav .lang-zh').forEach(el => {
    el.style.display = (lang === 'zh') ? 'block' : 'none';
  });
  document.querySelectorAll('.bottom-nav .lang-en').forEach(el => {
    el.style.display = (lang === 'en') ? 'block' : 'none';
  });
  
  // 設定面板標籤也需要切換
  document.querySelectorAll('.settings-panel .lang-zh').forEach(el => {
    el.style.display = (lang === 'zh') ? 'block' : 'none';
  });
  document.querySelectorAll('.settings-panel .lang-en').forEach(el => {
    el.style.display = (lang === 'en') ? 'block' : 'none';
  });
  
  // 平台通訊錄頁面標籤也需要切換
  document.querySelectorAll('.directory-page .lang-zh').forEach(el => {
    el.style.display = (lang === 'zh') ? 'block' : 'none';
  });
  document.querySelectorAll('.directory-page .lang-en').forEach(el => {
    el.style.display = (lang === 'en') ? 'block' : 'none';
  });
  
  // 更新下拉選單的選項顯示
  updateDirectorySelectOptions();
  
  // 更新底部導航欄列表（如果在編輯頁面）
  if (typeof updateNavList === 'function') {
    updateNavList();
  }
  
  // 儲存語言設定
  localStorage.setItem('lang', lang);
}

// ===== 全域主題系統（類似 LINE 主題） =====

// 主題快取狀態
const _themeCache = {
  loaded: new Set(),
  preloading: new Set()
};

// 載入主題 CSS（優化版：支援快取和預載入）
function loadThemeCSS(themeNumber) {
  // 移除舊的主題 CSS
  const oldThemeLink = document.getElementById('theme-css');
  if (oldThemeLink) {
    oldThemeLink.remove();
  }
  
  // 如果是主題 1-9，載入對應的主題 CSS
  if (themeNumber >= 1 && themeNumber <= 9) {
    const link = document.createElement('link');
    link.id = 'theme-css';
    link.rel = 'stylesheet';
    link.href = `theme-${themeNumber}.css`;
    document.head.appendChild(link);
    _themeCache.loaded.add(themeNumber);
  }
}

// 預載入主題 CSS（背景載入，不阻塞渲染）
function preloadThemeCSS(themeNumber) {
  if (themeNumber < 1 || themeNumber > 9) return;
  if (_themeCache.loaded.has(themeNumber) || _themeCache.preloading.has(themeNumber)) return;
  
  const existingPreload = document.getElementById(`theme-preload-${themeNumber}`);
  if (existingPreload) return;
  
  _themeCache.preloading.add(themeNumber);
  
  const link = document.createElement('link');
  link.id = `theme-preload-${themeNumber}`;
  link.rel = 'preload';
  link.as = 'style';
  link.href = `theme-${themeNumber}.css`;
  link.onload = () => {
    _themeCache.preloading.delete(themeNumber);
    _themeCache.loaded.add(themeNumber);
  };
  document.head.appendChild(link);
}

// 預載入所有主題（用於編輯頁面，使用 requestIdleCallback 優化）
function preloadAllThemes() {
  const loadNext = (index) => {
    if (index > 9) return;
    preloadThemeCSS(index);
    // 使用 requestIdleCallback 或 setTimeout 延遲載入下一個
    if (window.requestIdleCallback) {
      requestIdleCallback(() => loadNext(index + 1), { timeout: 100 });
    } else {
      setTimeout(() => loadNext(index + 1), 50);
    }
  };
  // 從主題 1 開始延遲預載入
  setTimeout(() => loadNext(1), 500);
}

// 設置全域主題
function setTheme(themeNumber) {
  // 移除所有舊的主題類別
  document.body.classList.remove('theme-dark', 'theme-light', 'theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5', 'theme-6', 'theme-7', 'theme-8', 'theme-9');
  
  // 添加新的主題類別
  if (themeNumber >= 1 && themeNumber <= 9) {
    // 重要：除了 theme-1~5，也同步套用 base 的 theme-dark / theme-light
    // 很多共用 UI（styles.css）仍依賴 theme-dark/theme-light 的 selector，
    // 若沒有加上，會造成「部分介面/字體不跟主題變」的問題。
    document.body.classList.add((themeNumber === 2 || themeNumber === 7 || themeNumber === 9) ? 'theme-light' : 'theme-dark');
    document.body.classList.add('theme-' + themeNumber);
    // 載入對應的主題 CSS
    loadThemeCSS(themeNumber);
  } else {
    // 向後兼容舊的 theme-dark/theme-light
    if (themeNumber === 'light') {
      document.body.classList.add('theme-light');
      loadThemeCSS(2); // 淺色主題 = 主題 2
      themeNumber = 2;
    } else {
      document.body.classList.add('theme-dark');
      loadThemeCSS(1); // 深色主題 = 主題 1
      themeNumber = 1;
    }
  }
  
  // 儲存主題設定
  localStorage.setItem('theme', themeNumber);
  
  // 更新主題按鈕狀態（如果存在）
  updateThemeButtons(themeNumber);
}

// 更新主題按鈕狀態
function updateThemeButtons(themeNumber) {
  // 更新設定頁面的主題按鈕
  document.querySelectorAll('.theme-selector-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`.theme-selector-btn[data-theme="${themeNumber}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }
}

// ===== 針對「查看他人名片」的特殊邏輯 =====
// 功能：卡片顯示他人的主題，背景保留觀看者（個人）的主題
function initViewerPage(ownerThemeNumber) {
  // 1. 初始化觀看者（個人）的全域主題（套用到 body）
  const savedLang = localStorage.getItem('lang') || 'zh';
  const savedTheme = localStorage.getItem('theme') || '1';
  setLang(savedLang);
  
  let viewerThemeNumber = parseInt(savedTheme);
  if (isNaN(viewerThemeNumber)) {
    viewerThemeNumber = savedTheme === 'light' ? 2 : 1;
  }
  
  // 設置 body 主題（觀看者的個性化背景）
  setTheme(viewerThemeNumber);

  // 2. 初始化名片主題（卡片擁有者的主題）
  const card = document.getElementById('previewCard');
  if (card && ownerThemeNumber) {
    // 載入對應擁有者的主題 CSS（確保 .card.card-theme-X 樣式存在）
    // 注意：loadThemeCSS 內部會檢查並避免重複載入
    loadOwnerThemeCSS(ownerThemeNumber);
    
    // 套用擁有者的主題類別到卡片
    card.classList.add('card-theme-' + ownerThemeNumber);
  }
}

// 專門為擁有者載入主題 CSS（不移除現有的全域主題 CSS）
function loadOwnerThemeCSS(themeNumber) {
  if (themeNumber < 1 || themeNumber > 9) return;
  
  const id = `owner-theme-${themeNumber}`;
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `theme-${themeNumber}.css`;
    document.head.appendChild(link);
  }
}

// 初始化語言和主題（從 localStorage 讀取）
function initLangAndTheme() {
  const savedLang = localStorage.getItem('lang') || 'zh';
  const savedTheme = localStorage.getItem('theme') || '1'; // 預設主題 1（深色）
  setLang(savedLang);
  // 轉換為數字，如果是舊格式則轉換為對應的主題編號
  let themeNumber = parseInt(savedTheme);
  if (isNaN(themeNumber)) {
    themeNumber = savedTheme === 'light' ? 2 : 1;
  }
  setTheme(themeNumber);
}

// 更新下拉選單選項的顯示
function updateDirectorySelectOptions() {
  const zhElements = document.querySelectorAll('.lang-zh');
  const currentLang = zhElements.length > 0 && zhElements[0].style.display !== 'none' ? 'zh' : 'en';
  const langAttr = currentLang === 'zh' ? 'data-lang-zh' : 'data-lang-en';
  
  // 更新搜尋欄的 placeholder
  const searchInput = document.getElementById('directorySearchInput');
  if (searchInput) {
    const placeholder = currentLang === 'zh' 
      ? searchInput.getAttribute('data-placeholder-zh')
      : searchInput.getAttribute('data-placeholder-en');
    if (placeholder) {
      searchInput.setAttribute('placeholder', placeholder);
    }
  }
  
  // 更新所有帶 data-placeholder-* 屬性的 input/textarea 的 placeholder
  document.querySelectorAll('input[data-placeholder-zh], textarea[data-placeholder-zh]').forEach(el => {
    const placeholder = currentLang === 'zh'
      ? el.getAttribute('data-placeholder-zh')
      : el.getAttribute('data-placeholder-en');
    if (placeholder) {
      el.setAttribute('placeholder', placeholder);
    }
  });

  // 更新其他帶有 data-placeholder-zh/en 的輸入欄位（例如：地區選擇器的 display 欄位）
  document.querySelectorAll('[data-placeholder-zh][data-placeholder-en]').forEach(el => {
    if (el === searchInput) return;
    const tag = (el.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') return;
    const ph = currentLang === 'zh'
      ? el.getAttribute('data-placeholder-zh')
      : el.getAttribute('data-placeholder-en');
    if (ph) el.setAttribute('placeholder', ph);
  });
  
  // 更新所有 select 的選項文字
  document.querySelectorAll('.directory-filter-select').forEach(select => {
    select.querySelectorAll('option').forEach(option => {
      const text = option.getAttribute(langAttr);
      if (text) {
        option.textContent = text;
      }
    });
  });
  
  // 更新新增好友表單中的 select 選項文字
  document.querySelectorAll('.add-friend-form-select').forEach(select => {
    select.querySelectorAll('option').forEach(option => {
      const text = option.getAttribute(langAttr);
      if (text) {
        option.textContent = text;
      }
    });
  });
}

// 頁面載入時初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLangAndTheme);
} else {
  initLangAndTheme();
}

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
function setupLazyImage(img, src) {
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
function initLazyImages() {
  if (!_lazyLoadObserver) return;
  
  document.querySelectorAll('img[data-src]').forEach(img => {
    _lazyLoadObserver.observe(img);
  });
}

// ===== 圖片壓縮與 WebP 轉換工具 =====

// 壓縮圖片並轉換為 WebP 格式
// @param {File|Blob} file - 要壓縮的圖片檔案
// @param {Object} opts - 選項
//   - maxDim: 最大尺寸（預設 512）
//   - maxBytes: 最大檔案大小（預設 1MB）
//   - mime: 目標格式（預設 image/webp）
// @returns {Promise<{blob: Blob, contentType: string, ext: string, width: number, height: number}>}
async function compressImageToWebP(file, opts) {
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
function isWebPSupported() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
}

// ===== 編輯名片：聯絡方式 CONTACT 版型切換（列表 / 小卡）=====
// 保險機制：若 edit.html（或舊版）沒有渲染切換器，這裡會自動注入，避免被快取舊 HTML 卡住。
function ensureEditContactLayoutToggle() {
  try {
    const path = (window.location && window.location.pathname) ? window.location.pathname : '';
    if (!/edit\.html$/i.test(path)) return;

    const contacts = document.getElementById('previewContacts');
    if (!contacts) return;

    // 已存在就不重複注入
    if (document.getElementById('contactLayoutListBtn') || document.querySelector('.contact-layout-toolbar')) {
      return;
    }

    // 注入最小 CSS（即使 styles.css 還在被快取，也能顯示）
    if (!document.getElementById('uvaco-contact-layout-style')) {
      const s = document.createElement('style');
      s.id = 'uvaco-contact-layout-style';
      s.textContent = `
        .contact-layout-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:-8px;margin-bottom:10px}
        .contact-layout-label{font-size:12px;letter-spacing:.12em;opacity:.85;user-select:none}
        body.theme-dark .contact-layout-label{color:#9ca3af}
        body.theme-light .contact-layout-label{color:#6b7280}
        .contact-layout-toggle{display:inline-flex;gap:6px;padding:6px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.15);backdrop-filter:blur(10px)}
        body.theme-light .contact-layout-toggle{background:rgba(255,255,255,.75);border-color:rgba(15,23,42,.10)}
        .contact-layout-btn{border:none;border-radius:999px;padding:8px 12px;font-size:13px;cursor:pointer;background:transparent;color:inherit;opacity:.9;transition:.2s}
        .contact-layout-btn.is-active{background:rgba(var(--uvaco-green-rgb),.20);color:var(--uvaco-green);opacity:1}
        .contact-layout-btn:hover{transform:translateY(-1px)}
        /* Grid mode：固定至少 3 張；寬度夠就 4 張（不允許 2/1） */
        .btn-group.contact-layout-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
        @media (min-width:980px){.btn-group.contact-layout-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
        .btn-group.contact-layout-grid .btn{border-radius:18px;height:92px;font-size:clamp(11px,2.6vw,14px);line-height:1.15;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px;padding:14px 12px;text-align:center;overflow:hidden;white-space:normal}
        .btn-group.contact-layout-grid .btn .contact-btn-label{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;word-break:break-word;overflow-wrap:anywhere}
        .btn-group.contact-layout-grid .btn img{margin:0 auto;display:block}
        /* Grid 尾列補滿：避免 3 欄時最後一排留大空白 */
        .btn-group.contact-layout-grid .contact-btn-wrapper{min-width:0}
        .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(3n+1){grid-column:1/-1}
        .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(3n+2){grid-column:span 2}
        @media (min-width:980px){
          .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(4n+1){grid-column:1/-1}
          .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(4n+2){grid-column:span 3}
          .btn-group.contact-layout-grid .contact-btn-wrapper:nth-last-of-type(1):nth-of-type(4n+3){grid-column:span 2}
        }
        .btn-group.contact-layout-grid .btn:hover{transform:translateY(-1px)}
      `;
      document.head.appendChild(s);
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'contact-layout-toolbar';
    toolbar.innerHTML = `
      <div class="contact-layout-label">
        <span class="lang-zh">顯示方式</span><span class="lang-en">Layout</span>
      </div>
      <div class="contact-layout-toggle" role="group" aria-label="Contact layout">
        <button type="button" class="contact-layout-btn" id="contactLayoutListBtn">
          <span class="lang-zh">列表</span><span class="lang-en">List</span>
        </button>
        <button type="button" class="contact-layout-btn" id="contactLayoutGridBtn">
          <span class="lang-zh">小卡</span><span class="lang-en">Cards</span>
        </button>
      </div>
    `;

    // 插到 contacts 前面
    contacts.parentNode.insertBefore(toolbar, contacts);

    // ===== 與新版 edit.html 對齊：使用同一個 key + 同一個全域狀態名稱 =====
    // - localStorage: UVACO_CONTACT_LAYOUT
    // - window.__uvacoContactLayout
    const getLayout = () => {
      try {
        const v = String(localStorage.getItem('UVACO_CONTACT_LAYOUT') || '').toLowerCase();
        return (v === 'grid') ? 'grid' : 'list';
      } catch (e) {
        return 'list';
      }
    };

    // 若舊版 edit.html 沒有這兩個函數，這裡補上（避免切換器能顯示但按了沒反應）
    if (typeof window.applyContactLayout !== 'function') {
      window.applyContactLayout = function (layout) {
        const mode = (layout === 'grid') ? 'grid' : 'list';
        const group = document.getElementById('previewContacts');
        const listBtn = document.getElementById('contactLayoutListBtn');
        const gridBtn = document.getElementById('contactLayoutGridBtn');
        if (group) group.classList.toggle('contact-layout-grid', mode === 'grid');
        if (listBtn) listBtn.classList.toggle('is-active', mode === 'list');
        if (gridBtn) gridBtn.classList.toggle('is-active', mode === 'grid');
      };
    }

    if (typeof window.setContactLayout !== 'function') {
      window.setContactLayout = function (layout) {
        window.__uvacoContactLayout = (layout === 'grid') ? 'grid' : 'list';
        try { localStorage.setItem('UVACO_CONTACT_LAYOUT', window.__uvacoContactLayout); } catch (e) {}
        if (typeof window.applyContactLayout === 'function') {
          window.applyContactLayout(window.__uvacoContactLayout);
        }
      };
    }

    // 初始值：沿用新版變數名稱，讓 saveCard()（若存在）能直接吃到
    window.__uvacoContactLayout = window.__uvacoContactLayout || getLayout();

    // 綁事件（優先呼叫全域 setContactLayout）
    const lb = document.getElementById('contactLayoutListBtn');
    const gb = document.getElementById('contactLayoutGridBtn');
    if (lb) lb.addEventListener('click', () => window.setContactLayout('list'));
    if (gb) gb.addEventListener('click', () => window.setContactLayout('grid'));

    // 初始套用
    if (typeof window.applyContactLayout === 'function') {
      window.applyContactLayout(window.__uvacoContactLayout);
    }

    // 再跑一次語言切換（避免 setLang 把 span display 搞到不一致）
    try {
      const savedLang = localStorage.getItem('lang') || 'zh';
      setLang(savedLang);
    } catch (e) {}
  } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureEditContactLayoutToggle);
} else {
  ensureEditContactLayoutToggle();
}

// ===== 卡片主題管理（用於查看他人名片時顯示對方主題） =====

// 從 URL 參數讀取對方的主題設定（查看他人名片時使用）
function initCardThemeFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const cardTheme = urlParams.get('cardTheme'); // 例如：?cardTheme=3
  if (cardTheme) {
    const themeNumber = parseInt(cardTheme);
    if (themeNumber >= 1 && themeNumber <= 9) {
      // 查看他人名片時，套用對方的主題到整個頁面
      setTheme(themeNumber);
    }
  }
}

// 從數據屬性讀取（如果卡片有 data-card-theme 屬性）
function initCardThemeFromData() {
  const card = document.querySelector('.card');
  if (card && card.dataset.cardTheme) {
    const themeNumber = parseInt(card.dataset.cardTheme);
    if (themeNumber >= 1 && themeNumber <= 9) {
      // 查看他人名片時，套用對方的主題到整個頁面
      setTheme(themeNumber);
    }
  }
}

// 初始化卡片主題（在查看他人名片頁面）
function initCardTheme() {
  // 優先順序：URL 參數 > 數據屬性
  // 注意：不使用 localStorage，因為要顯示對方的主題，而不是自己的主題
  const urlParams = new URLSearchParams(window.location.search);
  const hasCardTheme = urlParams.get('cardTheme');
  
  if (hasCardTheme) {
    initCardThemeFromURL();
  } else {
    initCardThemeFromData();
  }
}

// 頁面載入時初始化卡片主題（僅在查看名片頁面）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCardTheme);
} else {
  initCardTheme();
}

