export function setLang(lang) {
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
export const _themeCache = {
  loaded: new Set(),
  preloading: new Set()
};

// 載入主題 CSS（優化版：支援快取和預載入）
export function loadThemeCSS(themeNumber) {
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
export function preloadThemeCSS(themeNumber) {
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
export function preloadAllThemes() {
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
export function setTheme(themeNumber) {
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
export function updateThemeButtons(themeNumber) {
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
export function initViewerPage(ownerThemeNumber) {
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
export function loadOwnerThemeCSS(themeNumber) {
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
export function initLangAndTheme() {
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
export function updateDirectorySelectOptions() {
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

