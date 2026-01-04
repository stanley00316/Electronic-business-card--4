// v=20260105
// 語言和主題管理
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

// 載入主題 CSS
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
  }
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
        /* Grid mode */
        .btn-group.contact-layout-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        @media (min-width:720px){.btn-group.contact-layout-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
        .btn-group.contact-layout-grid .btn{border-radius:18px;height:92px;white-space:normal;flex-direction:column;justify-content:center;align-items:center;gap:10px;padding:14px 12px;text-align:center}
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

